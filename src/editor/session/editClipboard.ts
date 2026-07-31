/**
 * Edit clipboard round-trip (JTBD Wave B): copy / cut / copyMerged / paste /
 * pasteInPlace — paste always creates a new raster layer.
 */

import type { CommandRegistry } from '../../core/commands/registry'
import {
  addLayer,
  asRasterAssetRef,
  createAssetId,
  createRasterLayer,
  getChildrenIds,
  getLayer,
  isLayerImageLocked,
  MAX_CANVAS_SIDE,
  SOFT_MEGAPIXEL_LIMIT,
  type HappyDocument,
  type LayerId,
} from '../../core/document'
import { createMetadataEntry } from '../../core/history'
import { createRasterEntry } from '../../core/history/rasterEntry'
import {
  ensureEditableSurface,
  getImagingClient,
  probeClipboardImageSize,
  registerRasterSurface,
  syncEditableSurfaceToBitmap,
  writeClipboardImage,
  type RasterSurfaceEntry,
} from '../../imaging'
import { TiledRasterSurface } from '../../imaging/surfaces/TiledRasterSurface'
import { setEditableSurface } from '../../imaging/surfaces/EditableSurfaceStore'
import {
  compositeRasterLayers,
  layerDocAabb,
  visibleRasterLayers,
} from './compositeRasters'
import { clearSelection } from './editSelectionCommands'
import { documentHistory } from './documentHistory'
import { useEditorSessionStore } from './EditorSessionStore'
import { activeSelectionMask } from './selectionClip'
import type { SelectionRect } from './SelectionMask'
import { useSelectionStore } from './selectionStore'

/** Internal paste payload (system clipboard + paste-in-place origin). */
export type HappyClipboardPayload = {
  blob: Blob
  width: number
  height: number
  mimeType: string
  /** Document-space top-left of the copied region. */
  originX: number
  originY: number
  /** Optional raw RGBA for headless / unit-test paste without decode. */
  rgba?: Uint8ClampedArray
}

let happyClipboard: HappyClipboardPayload | null = null

export function getHappyClipboard(): HappyClipboardPayload | null {
  return happyClipboard
}

export function setHappyClipboard(payload: HappyClipboardPayload | null): void {
  happyClipboard = payload
}

export function clearHappyClipboard(): void {
  happyClipboard = null
}

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
    ...(selectedLayerIds ? { selectedLayerIds } : {}),
  })
}

export type ExtractedPixels = {
  rgba: Uint8ClampedArray
  width: number
  height: number
  originX: number
  originY: number
}

/** Extract pixels under selection (or full active layer) from the active raster. */
export async function extractActiveLayerPixels(): Promise<ExtractedPixels | null> {
  const session = useEditorSessionStore.getState()
  const layerId = session.selectedLayerIds[0]
  if (!layerId) return null
  const layer = getLayer(session.document, layerId)
  if (!layer || layer.type !== 'raster') return null

  const surface = await ensureEditableSurface(String(layer.pixels))
  if (!surface) return null

  const { width: cw, height: ch } = session.document.canvas
  const mask = activeSelectionMask(cw, ch)
  const bounds =
    mask?.bounds() ??
    layerDocAabb(layer.transform, surface.width, surface.height)

  const canvasClip: SelectionRect = {
    x: Math.max(0, bounds.x),
    y: Math.max(0, bounds.y),
    width: Math.min(cw, bounds.x + bounds.width) - Math.max(0, bounds.x),
    height: Math.min(ch, bounds.y + bounds.height) - Math.max(0, bounds.y),
  }
  // Allow layer pixels outside canvas when no selection (PS copies full layer).
  const region = mask
    ? {
        x: canvasClip.x,
        y: canvasClip.y,
        width: Math.max(0, canvasClip.width),
        height: Math.max(0, canvasClip.height),
      }
    : bounds

  if (region.width < 1 || region.height < 1) return null

  const composited = await compositeRasterLayers([layer], region, {
    sampleCover: mask ? (x, y) => mask.sample(x, y) / 255 : undefined,
    applyLayerOpacity: false,
  })
  if (!composited) return null
  return composited
}

/** Flatten visible raster layers under selection (or canvas) — CPU path. */
export async function extractMergedPixels(): Promise<ExtractedPixels | null> {
  const session = useEditorSessionStore.getState()
  const { width: cw, height: ch } = session.document.canvas
  const mask = activeSelectionMask(cw, ch)
  const region = mask?.bounds() ?? { x: 0, y: 0, width: cw, height: ch }
  if (region.width < 1 || region.height < 1) return null

  const composited = await compositeRasterLayers(
    visibleRasterLayers(session.document),
    region,
    {
      sampleCover: mask ? (x, y) => mask.sample(x, y) / 255 : undefined,
    },
  )
  if (!composited) return null
  return composited
}

async function rgbaToPngBlob(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.putImageData(
        new ImageData(rgba as ImageDataArray, width, height),
        0,
        0,
      )
      return canvas.convertToBlob({ type: 'image/png' })
    }
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.putImageData(
        new ImageData(rgba as ImageDataArray, width, height),
        0,
        0,
      )
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      )
      if (blob) return blob
    }
  }
  // Headless fallback — paste path can use `rgba` directly.
  return new Blob([Uint8Array.from(rgba)], { type: 'application/octet-stream' })
}

async function commitClipboard(
  extracted: ExtractedPixels,
): Promise<boolean> {
  const blob = await rgbaToPngBlob(
    extracted.rgba,
    extracted.width,
    extracted.height,
  )
  const mimeType = blob.type.startsWith('image/') ? blob.type : 'image/png'
  setHappyClipboard({
    blob,
    width: extracted.width,
    height: extracted.height,
    mimeType,
    originX: extracted.originX,
    originY: extracted.originY,
    rgba: extracted.rgba,
  })
  if (blob.type.startsWith('image/')) {
    await writeClipboardImage(blob)
  }
  return true
}

export async function copySelection(): Promise<boolean> {
  const extracted = await extractActiveLayerPixels()
  if (!extracted) return false
  return commitClipboard(extracted)
}

export async function copyMerged(): Promise<boolean> {
  const extracted = await extractMergedPixels()
  if (!extracted) return false
  return commitClipboard(extracted)
}

async function clearEntireActiveLayer(): Promise<boolean> {
  const session = useEditorSessionStore.getState()
  const layerId = session.selectedLayerIds[0]
  if (!layerId) return false
  const layer = getLayer(session.document, layerId)
  if (!layer || layer.type !== 'raster' || isLayerImageLocked(layer)) return false

  const assetId = String(layer.pixels)
  const surface = await ensureEditableSurface(assetId)
  if (!surface) return false

  const region = {
    x: 0,
    y: 0,
    width: surface.width,
    height: surface.height,
  }
  const patch = surface.paintSelection({
    region,
    mode: 'clear',
    sampleDoc: () => 255,
  })
  if (patch.tiles.length === 0) return false

  if (typeof OffscreenCanvas !== 'undefined') {
    await syncEditableSurfaceToBitmap(assetId)
  }
  documentHistory.push(
    createRasterEntry({
      label: 'Cut',
      patch,
      onInvalidated: () => {
        useEditorSessionStore.getState().bumpRasterEpoch()
      },
    }),
  )
  useEditorSessionStore.setState({
    dirty: true,
    historyVersion: documentHistory.version,
  })
  useEditorSessionStore.getState().bumpRasterEpoch()
  return true
}

export async function cutSelection(): Promise<boolean> {
  const copied = await copySelection()
  if (!copied) return false
  if (useSelectionStore.getState().hasSelection()) {
    return clearSelection()
  }
  return clearEntireActiveLayer()
}

async function bitmapFromPayload(
  payload: HappyClipboardPayload,
): Promise<{ bitmap: ImageBitmap; width: number; height: number; sourceBlob?: Blob }> {
  if (payload.rgba && payload.rgba.length === payload.width * payload.height * 4) {
    if (typeof createImageBitmap === 'function' && typeof ImageData !== 'undefined') {
      try {
        const bitmap = await createImageBitmap(
          new ImageData(payload.rgba as ImageDataArray, payload.width, payload.height),
        )
        return {
          bitmap,
          width: payload.width,
          height: payload.height,
          sourceBlob: payload.blob.type.startsWith('image/') ? payload.blob : undefined,
        }
      } catch {
        /* fall through to decode */
      }
    }
    // Bun / headless: stub bitmap; caller registers editable surface from rgba.
    const stub = {
      width: payload.width,
      height: payload.height,
      close() {},
    } as ImageBitmap
    return {
      bitmap: stub,
      width: payload.width,
      height: payload.height,
      sourceBlob: undefined,
    }
  }

  if (payload.blob.type.startsWith('image/')) {
    const client = getImagingClient()
    try {
      const decoded = await client.decode(payload.blob, {
        maxSide: MAX_CANVAS_SIDE,
        softMegapixelLimit: SOFT_MEGAPIXEL_LIMIT,
      })
      return {
        bitmap: decoded.bitmap,
        width: decoded.width,
        height: decoded.height,
        sourceBlob: payload.blob,
      }
    } catch {
      const bitmap = await createImageBitmap(payload.blob)
      return {
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
        sourceBlob: payload.blob,
      }
    }
  }

  throw new Error('Clipboard payload has no decodable image')
}

async function resolvePastePayload(): Promise<HappyClipboardPayload | null> {
  if (happyClipboard) return happyClipboard
  const probe = await probeClipboardImageSize()
  if (probe.status !== 'found') return null
  return {
    blob: probe.probe.blob,
    width: probe.probe.width,
    height: probe.probe.height,
    mimeType: probe.probe.mimeType,
    originX: 0,
    originY: 0,
  }
}

async function pasteAsNewLayer(options: {
  inPlace: boolean
}): Promise<boolean> {
  const payload = await resolvePastePayload()
  if (!payload) return false

  let decoded: {
    bitmap: ImageBitmap
    width: number
    height: number
    sourceBlob?: Blob
  }
  try {
    decoded = await bitmapFromPayload(payload)
  } catch {
    return false
  }

  const session = useEditorSessionStore.getState()
  const before = session.document
  const { width: cw, height: ch } = before.canvas

  const x = options.inPlace
    ? payload.originX
    : Math.round((cw - decoded.width) / 2)
  const y = options.inPlace
    ? payload.originY
    : Math.round((ch - decoded.height) / 2)

  const assetId = createAssetId()
  const entry: RasterSurfaceEntry = {
    assetId,
    width: decoded.width,
    height: decoded.height,
    bitmap: decoded.bitmap,
    sourceBlob: decoded.sourceBlob,
  }
  registerRasterSurface(entry)

  // Keep editable surface in sync when we only have a stub bitmap (tests).
  if (payload.rgba && payload.rgba.length === decoded.width * decoded.height * 4) {
    const surface = TiledRasterSurface.fromImageData(assetId, {
      data: payload.rgba.slice(),
      width: decoded.width,
      height: decoded.height,
    } as ImageData)
    setEditableSurface(surface)
  }

  const selectedId = session.selectedLayerIds[0]
  const selected = selectedId ? before.layers[selectedId] : undefined
  const layer = createRasterLayer({
    name: 'Pasted Layer',
    pixels: asRasterAssetRef(assetId),
    transform: { x, y },
    parentId: selected?.parentId ?? null,
  })

  let after: HappyDocument
  if (selected) {
    const siblings =
      getChildrenIds(before, selected.parentId) ?? before.rootChildren
    const index = siblings.indexOf(selected.id)
    after = addLayer(before, layer, {
      parentId: selected.parentId,
      index: index >= 0 ? index + 1 : undefined,
    })
  } else {
    after = addLayer(before, layer)
  }

  pushMetadata(
    options.inPlace ? 'Paste in Place' : 'Paste',
    before,
    after,
    [layer.id],
  )
  useEditorSessionStore.getState().bumpRasterEpoch()
  return true
}

export async function pasteClipboard(): Promise<boolean> {
  return pasteAsNewLayer({ inPlace: false })
}

export async function pasteClipboardInPlace(): Promise<boolean> {
  if (!happyClipboard) {
    // OS-only paste has no origin — fall back to centered paste.
    return pasteAsNewLayer({ inPlace: false })
  }
  return pasteAsNewLayer({ inPlace: true })
}

function canCopyActiveRaster(): boolean {
  const session = useEditorSessionStore.getState()
  const id = session.selectedLayerIds[0]
  if (!id) return false
  const layer = getLayer(session.document, id)
  return !!layer && layer.type === 'raster'
}

function canCutActiveRaster(): boolean {
  const session = useEditorSessionStore.getState()
  const id = session.selectedLayerIds[0]
  if (!id) return false
  const layer = getLayer(session.document, id)
  return !!layer && layer.type === 'raster' && !isLayerImageLocked(layer)
}

export function registerEditClipboardCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'edit.copy',
    title: 'Copy',
    shortcut: 'Mod+C',
    enabled: canCopyActiveRaster,
    run: () => {
      void copySelection()
    },
  })

  registry.register({
    id: 'edit.cut',
    title: 'Cut',
    shortcut: 'Mod+X',
    enabled: canCutActiveRaster,
    run: () => {
      void cutSelection()
    },
  })

  registry.register({
    id: 'edit.copyMerged',
    title: 'Copy Merged',
    shortcut: 'Mod+Shift+C',
    enabled: () => true,
    run: () => {
      void copyMerged()
    },
  })

  registry.register({
    id: 'edit.paste',
    title: 'Paste',
    shortcut: 'Mod+V',
    enabled: () => true,
    run: () => {
      void pasteClipboard()
    },
  })

  registry.register({
    id: 'edit.pasteInPlace',
    title: 'Paste in Place',
    shortcut: 'Mod+Shift+V',
    enabled: () => happyClipboard != null,
    run: () => {
      void pasteClipboardInPlace()
    },
  })
}
