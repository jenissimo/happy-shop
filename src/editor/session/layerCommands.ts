/**
 * Core Layer menu commands (SPEC §1.1 — work with layers).
 * Overwrites registry stubs for new / duplicate / delete / arrange.
 */

import type { CommandRegistry } from '../../core/commands/registry'
import {
  addLayer,
  asRasterAssetRef,
  asRasterMaskRef,
  createAssetId,
  createGroupLayer,
  createLayerId,
  createRasterLayer,
  getChildrenIds,
  groupLayers,
  removeLayer,
  reorderLayer,
  setMask,
  setMaskEnabled,
  setGroupIsolated,
  ungroupLayer,
  type HappyDocument,
  type Layer,
  type LayerId,
  type RasterAssetRef,
} from '../../core/document'
import { createMetadataEntry } from '../../core/history'
import {
  getRasterSurface,
  registerRasterSurface,
} from '../../imaging'
import { documentHistory } from './documentHistory'
import { isTransformableLayer } from '../tools/move/layerLocalBounds'
import {
  normalizeLayerSelection,
  useEditorSessionStore,
} from './EditorSessionStore'
import { useSelectionStore } from './selectionStore'

function applyDoc(doc: HappyDocument): void {
  useEditorSessionStore.setState({ document: doc, dirty: true })
}

function pushMetadata(
  label: string,
  before: HappyDocument,
  after: HappyDocument,
  selectedLayerIds?: LayerId[],
): void {
  if (before === after) return
  documentHistory.push(
    createMetadataEntry({
      label,
      before,
      after,
      apply: applyDoc,
    }),
  )
  useEditorSessionStore.setState({
    document: after,
    dirty: true,
    historyVersion: documentHistory.version,
    selectedLayerIds: normalizeLayerSelection(
      after,
      selectedLayerIds ?? useEditorSessionStore.getState().selectedLayerIds,
    ),
  })
}

/**
 * Transparent canvas-sized ImageBitmap for new/duplicate raster layers.
 * Must acquire a 2D context before `createImageBitmap` — Chromium rejects
 * bare `OffscreenCanvas` sources with InvalidStateError ("could not be allocated").
 */
async function createBlankBitmap(
  width: number,
  height: number,
): Promise<ImageBitmap> {
  const w = Math.max(1, width)
  const h = Math.max(1, height)

  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const canvas = new OffscreenCanvas(w, h)
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // Touch pixels so the surface is allocated (transparent clear).
        ctx.clearRect(0, 0, w, h)
        if (typeof canvas.transferToImageBitmap === 'function') {
          return canvas.transferToImageBitmap()
        }
        if (typeof createImageBitmap === 'function') {
          return await createImageBitmap(canvas)
        }
      }
    } catch {
      // fall through
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx && typeof createImageBitmap === 'function') {
        ctx.clearRect(0, 0, w, h)
        return await createImageBitmap(canvas)
      }
    } catch {
      // fall through
    }
  }

  if (typeof createImageBitmap === 'function' && typeof ImageData !== 'undefined') {
    try {
      const data = new Uint8ClampedArray(w * h * 4)
      return await createImageBitmap(new ImageData(data as ImageDataArray, w, h))
    } catch {
      // fall through
    }
  }

  return { width: w, height: h, close() {} } as ImageBitmap
}

/** Insert a new layer as the sibling above the current selection (paint order). */
function addLayerAboveSelection(
  doc: HappyDocument,
  layer: Layer,
): HappyDocument {
  const selectedId = useEditorSessionStore.getState().selectedLayerIds[0]
  const selected = selectedId ? doc.layers[selectedId] : undefined
  if (!selected) return addLayer(doc, layer)
  const siblings = getChildrenIds(doc, selected.parentId) ?? doc.rootChildren
  const index = siblings.indexOf(selected.id)
  return addLayer(doc, layer, {
    parentId: selected.parentId,
    index: index >= 0 ? index + 1 : undefined,
  })
}

/** Clone raster surface bytes into a new asset id (duplicate must not share pixels). */
export async function cloneRasterAssetRef(
  pixels: RasterAssetRef,
): Promise<RasterAssetRef> {
  const entry = getRasterSurface(pixels)
  const assetId = createAssetId()
  if (!entry) {
    const { width, height } = useEditorSessionStore.getState().document.canvas
    const bitmap = await createBlankBitmap(width, height)
    registerRasterSurface({ assetId, width, height, bitmap })
    return asRasterAssetRef(assetId)
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(entry.bitmap)
  } catch {
    bitmap = await createBlankBitmap(entry.width, entry.height)
  }

  registerRasterSurface({
    assetId,
    width: entry.width,
    height: entry.height,
    bitmap,
    sourceBlob: entry.sourceBlob?.slice(0),
  })
  return asRasterAssetRef(assetId)
}

export async function createNewRasterLayer(): Promise<LayerId | null> {
  const before = useEditorSessionStore.getState().document
  const assetId = createAssetId()
  const width = before.canvas.width
  const height = before.canvas.height
  const bitmap = await createBlankBitmap(width, height)
  registerRasterSurface({ assetId, width, height, bitmap })
  const layer = createRasterLayer({
    name: 'Layer',
    pixels: asRasterAssetRef(assetId),
  })
  const after = addLayerAboveSelection(before, layer)
  pushMetadata('New Layer', before, after, [layer.id])
  useEditorSessionStore.getState().bumpRasterEpoch()
  return layer.id
}

export function createNewGroupLayer(): LayerId | null {
  const before = useEditorSessionStore.getState().document
  const group = createGroupLayer({ name: 'Group' })
  const after = addLayerAboveSelection(before, group)
  pushMetadata('New Group', before, after, [group.id])
  return group.id
}

async function duplicateLeaf(layer: Layer): Promise<Layer> {
  const clone = structuredClone(layer) as Layer
  clone.id = createLayerId()
  clone.name = `${layer.name} copy`
  clone.parentId = layer.parentId
  if (clone.type === 'group') {
    clone.children = []
  }
  if (clone.type === 'raster') {
    clone.pixels = await cloneRasterAssetRef(layer.type === 'raster' ? layer.pixels : clone.pixels)
  }
  return clone
}

export async function duplicateSelectedLayer(): Promise<boolean> {
  const state = useEditorSessionStore.getState()
  const id = state.selectedLayerIds[0]
  if (!id) return false
  const copyIds = await duplicateLayersForMove([id])
  return copyIds.length > 0
}

/** Paint-order walk (bottom → top) for the given ids. */
function layerIdsInPaintOrder(
  doc: HappyDocument,
  ids: readonly LayerId[],
): LayerId[] {
  const wanted = new Set(ids)
  const ordered: LayerId[] = []
  const walk = (parentId: LayerId | null) => {
    const children = getChildrenIds(doc, parentId) ?? doc.rootChildren
    for (const id of children) {
      if (wanted.has(id)) ordered.push(id)
      const layer = doc.layers[id]
      if (layer?.type === 'group') walk(id)
    }
  }
  walk(null)
  return ordered
}

/**
 * Duplicate transformable layers for Move-tool Alt+drag.
 * Inserts each copy above its source, selects copies, and records history.
 */
export async function duplicateLayersForMove(
  layerIds: readonly LayerId[],
): Promise<LayerId[]> {
  const before = useEditorSessionStore.getState().document
  const orderedIds = layerIdsInPaintOrder(before, layerIds).filter((id) => {
    const layer = before.layers[id]
    return layer != null && isTransformableLayer(layer)
  })
  if (orderedIds.length === 0) return []

  let doc = before
  const copyIds: LayerId[] = []
  for (const id of orderedIds) {
    const layer = doc.layers[id]!
    const copy = await duplicateLeaf(layer)
    const siblings = getChildrenIds(doc, layer.parentId) ?? doc.rootChildren
    const index = siblings.indexOf(id)
    doc = addLayer(doc, copy, {
      parentId: layer.parentId,
      index: index >= 0 ? index + 1 : undefined,
    })
    copyIds.push(copy.id)
  }

  pushMetadata('Duplicate Layer', before, doc, copyIds)
  if (copyIds.some((id) => doc.layers[id]?.type === 'raster')) {
    useEditorSessionStore.getState().bumpRasterEpoch()
  }
  return copyIds
}

function selectionAfterDelete(
  before: HappyDocument,
  after: HappyDocument,
  selectedLayerIds: readonly LayerId[],
): LayerId[] {
  const activeId = selectedLayerIds[0]
  const active = activeId ? before.layers[activeId] : undefined
  if (active) {
    const siblings = getChildrenIds(before, active.parentId) ?? []
    const index = siblings.indexOf(active.id)
    // Prefer the layer visually below; when there is none, use the one above.
    for (const direction of [-1, 1]) {
      for (
        let i = index + direction;
        i >= 0 && i < siblings.length;
        i += direction
      ) {
        const candidate = siblings[i]
        if (candidate && after.layers[candidate]) return [candidate]
      }
    }
  }
  return normalizeLayerSelection(after, selectedLayerIds)
}

export function deleteSelectedLayers(): boolean {
  const state = useEditorSessionStore.getState()
  if (state.selectedLayerIds.length === 0) return false
  const before = state.document
  let after = before
  for (const id of state.selectedLayerIds) {
    if (!after.layers[id]) continue
    after = removeLayer(after, id)
  }
  if (after === before) return false
  pushMetadata(
    'Delete Layer',
    before,
    after,
    selectionAfterDelete(before, after, state.selectedLayerIds),
  )
  useEditorSessionStore.getState().bumpRasterEpoch()
  return true
}

type SiblingInfo = {
  id: LayerId
  index: number
  length: number
  document: HappyDocument
}

function getSelectedSiblingInfo(): SiblingInfo | null {
  const { selectedLayerIds, document } = useEditorSessionStore.getState()
  if (selectedLayerIds.length !== 1) return null
  const id = selectedLayerIds[0]!
  const layer = document.layers[id]
  if (!layer) return null
  const siblings = getChildrenIds(document, layer.parentId)
  if (!siblings) return null
  const index = siblings.indexOf(id)
  if (index < 0) return null
  return { id, index, length: siblings.length, document }
}

function arrangeSelected(
  label: string,
  targetIndex: (info: SiblingInfo) => number | null,
): boolean {
  const info = getSelectedSiblingInfo()
  if (!info) return false
  const next = targetIndex(info)
  if (next == null || next === info.index) return false
  const after = reorderLayer(info.document, info.id, next)
  if (after === info.document) return false
  pushMetadata(label, info.document, after)
  return true
}

export function bringSelectedToFront(): boolean {
  return arrangeSelected('Bring to Front', (info) =>
    info.index >= info.length - 1 ? null : info.length - 1,
  )
}

export function bringSelectedForward(): boolean {
  return arrangeSelected('Bring Forward', (info) =>
    info.index >= info.length - 1 ? null : info.index + 1,
  )
}

export function sendSelectedBackward(): boolean {
  return arrangeSelected('Send Backward', (info) =>
    info.index <= 0 ? null : info.index - 1,
  )
}

export function sendSelectedToBack(): boolean {
  return arrangeSelected('Send to Back', (info) =>
    info.index <= 0 ? null : 0,
  )
}

async function createSolidMaskBitmap(
  width: number,
  height: number,
  fill: '#ffffff' | '#000000',
): Promise<ImageBitmap> {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const canvas = new OffscreenCanvas(w, h)
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = fill
        ctx.fillRect(0, 0, w, h)
        if (typeof canvas.transferToImageBitmap === 'function') {
          return canvas.transferToImageBitmap()
        }
        if (typeof createImageBitmap === 'function') {
          return await createImageBitmap(canvas)
        }
      }
    } catch {
      // fall through
    }
  }
  if (typeof createImageBitmap === 'function' && typeof ImageData !== 'undefined') {
    try {
      const data = new Uint8ClampedArray(w * h * 4)
      const v = fill === '#ffffff' ? 255 : 0
      for (let i = 0; i < data.length; i += 4) {
        data[i] = v
        data[i + 1] = v
        data[i + 2] = v
        data[i + 3] = 255
      }
      return await createImageBitmap(new ImageData(data as ImageDataArray, w, h))
    } catch {
      // fall through
    }
  }
  return { width: w, height: h, close() {} } as ImageBitmap
}

async function addLayerMask(
  label: string,
  fill: '#ffffff' | '#000000',
): Promise<boolean> {
  const state = useEditorSessionStore.getState()
  if (state.selectedLayerIds.length !== 1) return false
  const id = state.selectedLayerIds[0]!
  const layer = state.document.layers[id]
  if (!layer || layer.mask != null) return false

  const before = state.document
  const assetId = createAssetId()
  const { width, height } = before.canvas
  const bitmap = await createSolidMaskBitmap(width, height, fill)
  registerRasterSurface({ assetId, width, height, bitmap })
  const after = setMask(before, id, asRasterMaskRef(assetId))
  if (after === before) return false
  pushMetadata(label, before, after)
  useEditorSessionStore.getState().bumpRasterEpoch()
  return true
}

/** Reveal-all layer mask (white). */
export async function addLayerMaskRevealAll(): Promise<boolean> {
  return addLayerMask('Reveal All', '#ffffff')
}

/** Hide-all layer mask (black). */
export async function addLayerMaskHideAll(): Promise<boolean> {
  return addLayerMask('Hide All', '#000000')
}

export function deleteLayerMask(): boolean {
  const state = useEditorSessionStore.getState()
  if (state.selectedLayerIds.length !== 1) return false
  const id = state.selectedLayerIds[0]!
  const layer = state.document.layers[id]
  if (!layer?.mask) return false
  const before = state.document
  const after = setMask(before, id, undefined)
  if (after === before) return false
  pushMetadata('Delete Layer Mask', before, after)
  useEditorSessionStore.getState().bumpRasterEpoch()
  return true
}

export function toggleLayerMaskEnabled(): boolean {
  const state = useEditorSessionStore.getState()
  if (state.selectedLayerIds.length !== 1) return false
  const id = state.selectedLayerIds[0]!
  const layer = state.document.layers[id]
  if (!layer?.mask) return false
  const enabled = layer.maskEnabled ?? true
  const before = state.document
  const after = setMaskEnabled(before, id, !enabled)
  if (after === before) return false
  pushMetadata(enabled ? 'Disable Layer Mask' : 'Enable Layer Mask', before, after)
  return true
}

/** Group selected same-parent layers into a folder (PS Group Layers). */
export function groupSelectedLayers(): LayerId | null {
  const state = useEditorSessionStore.getState()
  const ids = state.selectedLayerIds
  if (ids.length === 0) return null
  const before = state.document
  const first = before.layers[ids[0]!]
  if (!first) return null
  const parentId = first.parentId
  const siblings = getChildrenIds(before, parentId)
  if (!siblings) return null
  const memberSet = new Set(
    ids.filter((id) => {
      const layer = before.layers[id]
      return layer != null && layer.parentId === parentId
    }),
  )
  const ordered = siblings.filter((id) => memberSet.has(id))
  if (ordered.length === 0) return null

  const group = createGroupLayer({ name: 'Group' })
  const after = groupLayers(before, ordered, group)
  if (after === before) return null
  pushMetadata('Group Layers', before, after, [group.id])
  return group.id
}

/** Ungroup selected group layer(s); children lift to the group parent. */
export function ungroupSelectedLayers(): boolean {
  const state = useEditorSessionStore.getState()
  const before = state.document
  const groupIds = state.selectedLayerIds.filter((id) => {
    const layer = before.layers[id]
    return layer?.type === 'group'
  })
  if (groupIds.length === 0) return false

  let after = before
  const nextSelection: LayerId[] = []
  for (const id of groupIds) {
    const group = after.layers[id]
    if (!group || group.type !== 'group') continue
    nextSelection.push(...group.children)
    after = ungroupLayer(after, id)
  }
  if (after === before) return false
  pushMetadata('Ungroup Layers', before, after, nextSelection)
  return true
}

export function toggleSelectedGroupIsolation(): boolean {
  const state = useEditorSessionStore.getState()
  if (state.selectedLayerIds.length !== 1) return false
  const id = state.selectedLayerIds[0]!
  const group = state.document.layers[id]
  if (!group || group.type !== 'group') return false
  const after = setGroupIsolated(state.document, id, !group.isolated)
  if (after === state.document) return false
  pushMetadata(group.isolated ? 'Un-isolate Group' : 'Isolate Group', state.document, after)
  return true
}

function canAddLayerMask(): boolean {
  const { selectedLayerIds, document } = useEditorSessionStore.getState()
  if (selectedLayerIds.length !== 1) return false
  const layer = document.layers[selectedLayerIds[0]!]
  return layer != null && layer.mask == null
}

function canDeleteOrToggleMask(): boolean {
  const { selectedLayerIds, document } = useEditorSessionStore.getState()
  if (selectedLayerIds.length !== 1) return false
  const layer = document.layers[selectedLayerIds[0]!]
  return layer?.mask != null
}

function canGroupSelected(): boolean {
  const { selectedLayerIds, document } = useEditorSessionStore.getState()
  if (selectedLayerIds.length === 0) return false
  const first = document.layers[selectedLayerIds[0]!]
  if (!first) return false
  return selectedLayerIds.some((id) => {
    const layer = document.layers[id]
    return layer != null && layer.parentId === first.parentId
  })
}

function canUngroupSelected(): boolean {
  const { selectedLayerIds, document } = useEditorSessionStore.getState()
  return selectedLayerIds.some((id) => document.layers[id]?.type === 'group')
}

function canToggleSelectedGroupIsolation(): boolean {
  const { selectedLayerIds, document } = useEditorSessionStore.getState()
  return selectedLayerIds.length === 1 &&
    document.layers[selectedLayerIds[0]!]?.type === 'group'
}

function hasMarquee(): boolean {
  return useSelectionStore.getState().marquee != null
}

function stubEditIfMissing(
  registry: CommandRegistry,
  id: string,
  title: string,
  enabled: () => boolean,
  shortcut?: string,
): void {
  if (registry.get(id)) return
  registry.register({
    id,
    title,
    shortcut,
    enabled,
    run: () => {
      console.info(`[command stub] ${id}`)
    },
  })
}

export function registerLayerCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'layer.new',
    title: 'New Layer',
    enabled: () => true,
    run: () => {
      void createNewRasterLayer().catch((err) => {
        console.error('[layer.new] failed to create raster layer', err)
      })
    },
  })

  registry.register({
    id: 'layer.newGroup',
    title: 'New Group',
    enabled: () => true,
    run: () => {
      createNewGroupLayer()
    },
  })

  registry.register({
    id: 'layer.duplicate',
    title: 'Duplicate Layer',
    enabled: () => useEditorSessionStore.getState().selectedLayerIds.length === 1,
    run: () => {
      void duplicateSelectedLayer()
    },
  })

  registry.register({
    id: 'layer.delete',
    title: 'Delete Layer',
    enabled: () => useEditorSessionStore.getState().selectedLayerIds.length > 0,
    run: () => {
      deleteSelectedLayers()
    },
  })

  registry.register({
    id: 'layer.bringToFront',
    title: 'Bring to Front',
    enabled: () => {
      const info = getSelectedSiblingInfo()
      return info != null && info.index < info.length - 1
    },
    run: () => {
      bringSelectedToFront()
    },
  })

  registry.register({
    id: 'layer.bringForward',
    title: 'Bring Forward',
    enabled: () => {
      const info = getSelectedSiblingInfo()
      return info != null && info.index < info.length - 1
    },
    run: () => {
      bringSelectedForward()
    },
  })

  registry.register({
    id: 'layer.sendBackward',
    title: 'Send Backward',
    enabled: () => {
      const info = getSelectedSiblingInfo()
      return info != null && info.index > 0
    },
    run: () => {
      sendSelectedBackward()
    },
  })

  registry.register({
    id: 'layer.sendToBack',
    title: 'Send to Back',
    enabled: () => {
      const info = getSelectedSiblingInfo()
      return info != null && info.index > 0
    },
    run: () => {
      sendSelectedToBack()
    },
  })

  registry.register({
    id: 'layer.group',
    title: 'Group Layers',
    shortcut: 'Mod+G',
    enabled: canGroupSelected,
    run: () => {
      groupSelectedLayers()
    },
  })

  registry.register({
    id: 'layer.ungroup',
    title: 'Ungroup Layers',
    shortcut: 'Mod+Shift+G',
    enabled: canUngroupSelected,
    run: () => {
      ungroupSelectedLayers()
    },
  })

  registry.register({
    id: 'layer.group.toggleIsolated',
    title: 'Isolate Group',
    enabled: canToggleSelectedGroupIsolation,
    run: () => {
      toggleSelectedGroupIsolation()
    },
  })

  registry.register({
    id: 'layer.mask.add',
    title: 'Reveal All',
    enabled: canAddLayerMask,
    run: () => {
      void addLayerMaskRevealAll()
    },
  })

  registry.register({
    id: 'layer.mask.hideAll',
    title: 'Hide All',
    enabled: canAddLayerMask,
    run: () => {
      void addLayerMaskHideAll()
    },
  })

  registry.register({
    id: 'layer.mask.disable',
    title: 'Disable Layer Mask',
    enabled: canDeleteOrToggleMask,
    run: () => {
      toggleLayerMaskEnabled()
    },
  })

  registry.register({
    id: 'layer.mask.delete',
    title: 'Delete Layer Mask',
    enabled: canDeleteOrToggleMask,
    run: () => {
      deleteLayerMask()
    },
  })

  // Fill/clear owned by editSelectionCommands; clipboard by editClipboard.
  stubEditIfMissing(registry, 'edit.fill', 'Fill…', hasMarquee)
  stubEditIfMissing(registry, 'edit.clear', 'Clear', hasMarquee)
}
