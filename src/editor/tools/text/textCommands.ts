import type { CommandRegistry } from '../../../core/commands/registry'
import {
  addLayer,
  asRasterAssetRef,
  createAssetId,
  createRasterLayer,
  createTextLayer,
  replaceLayer,
  updateTextLayer,
  type CssColor,
  type HappyDocument,
  type LayerId,
  type TextLayer,
  type TextLayerPropsPatch,
} from '../../../core/document'
import { createMetadataEntry } from '../../../core/history'
import { registerRasterSurface } from '../../../imaging'
import { documentHistory } from '../../session/documentHistory'
import {
  normalizeLayerSelection,
  useEditorSessionStore,
} from '../../session/EditorSessionStore'
import { useTextToolStore } from './textToolStore'
import { measureTextBounds, rasterizeTextLayerToBitmap } from './textRasterize'
import { getTextEditingSelection } from './textEditingSelection'
import { styleTextRange, type CharacterStylePatch } from './textRuns'

function applyDoc(doc: HappyDocument): void {
  useEditorSessionStore.setState({ document: doc, dirty: true })
}

function pushMetadata(
  label: string,
  before: HappyDocument,
  after: HappyDocument,
  mergeKey?: string,
  mergeWindowMs?: number,
): void {
  if (before === after) return
  documentHistory.push(
    createMetadataEntry({
      label,
      before,
      after,
      apply: applyDoc,
      mergeKey,
      mergeWindowMs,
    }),
  )
  useEditorSessionStore.setState({
    document: after,
    dirty: true,
    historyVersion: documentHistory.version,
  })
}

/**
 * Creates a text layer and enters an edit session. History is deferred until
 * `finishTextEditSession` so Esc can discard a brand-new empty layer cleanly.
 */
export function createAndSelectTextLayer(options: {
  textMode: 'point' | 'box'
  x: number
  y: number
  width?: number
  height?: number
  content?: string
}): TextLayer {
  const tool = useTextToolStore.getState().options
  const before = useEditorSessionStore.getState().document
  const w = Math.max(0, options.width ?? 0)
  const h = Math.max(0, options.height ?? 0)
  const layer = createTextLayer({
    name: 'Text',
    textMode: options.textMode,
    content: options.content ?? '',
    fontFamily: tool.fontFamily,
    fontSource: tool.fontSource,
    fontSize: tool.fontSize,
    fontWeight: tool.fontWeight,
    italic: tool.italic,
    underline: tool.underline,
    color: tool.color,
    tracking: tool.tracking,
    leading: tool.leading,
    align: tool.align,
    bounds: { x: 0, y: 0, w, h },
    transform: { x: options.x, y: options.y },
  })
  const after = addLayer(before, layer)
  useEditorSessionStore.setState({
    document: after,
    dirty: true,
    selectedLayerIds: [layer.id],
  })
  useTextToolStore.getState().beginEdit({
    layerId: layer.id,
    baseline: before,
    isNew: true,
  })
  return layer
}

/** Select an existing live text layer and begin a fresh editable session. */
export function beginTextEditSession(layerId: LayerId): boolean {
  const current = useEditorSessionStore.getState().document
  const layer = current.layers[layerId]
  if (!layer || layer.type !== 'text') return false

  useEditorSessionStore.setState({
    selectedLayerIds: [layerId],
  })
  syncTextOptionsFromLayer(layer)
  useTextToolStore.getState().beginEdit({
    layerId,
    baseline: current,
    isNew: false,
  })
  return true
}

/** Live typing / option tweaks during an edit session (no history yet). */
export function previewTextProps(
  layerId: LayerId,
  patch: TextLayerPropsPatch,
): void {
  const before = useEditorSessionStore.getState().document
  const after = updateTextLayer(before, layerId, patch)
  if (after === before) return
  useEditorSessionStore.setState({ document: after, dirty: true })
}

/** Finish edit session: one coalesced metadata entry (add or edit). */
export function finishTextEditSession(): void {
  const edit = useTextToolStore.getState().edit
  if (!edit) return
  const current = useEditorSessionStore.getState().document
  const layer = current.layers[edit.layerId]

  if (!layer || layer.type !== 'text') {
    useTextToolStore.getState().endEdit()
    return
  }

  if (edit.isNew && layer.content.trim() === '') {
    useEditorSessionStore.setState({
      document: edit.baseline,
      dirty: useEditorSessionStore.getState().dirty,
      selectedLayerIds: normalizeLayerSelection(edit.baseline, []),
    })
    useTextToolStore.getState().endEdit()
    return
  }

  if (current === edit.baseline) {
    useTextToolStore.getState().endEdit()
    return
  }

  pushMetadata(
    edit.isNew ? 'Add Text Layer' : 'Edit Text',
    edit.baseline,
    current,
    edit.isNew ? `text-add:${edit.layerId}` : `text-edit:${edit.layerId}`,
    60_000,
  )
  useTextToolStore.getState().endEdit()
}

export function cancelTextEditSession(): void {
  const edit = useTextToolStore.getState().edit
  if (!edit) return
  useEditorSessionStore.setState({
    document: edit.baseline,
    selectedLayerIds: normalizeLayerSelection(
      edit.baseline,
      edit.isNew ? [] : [edit.layerId],
    ),
  })
  useTextToolStore.getState().endEdit()
}

export async function rasterizeTextLayer(layerId: LayerId): Promise<boolean> {
  const before = useEditorSessionStore.getState().document
  const layer = before.layers[layerId]
  if (!layer || layer.type !== 'text') return false

  const measured = await measureTextBounds(layer)
  const bitmap = await rasterizeTextLayerToBitmap(layer, measured)
  const assetId = createAssetId()
  registerRasterSurface({
    assetId,
    width: measured.width,
    height: measured.height,
    bitmap,
  })

  const raster = createRasterLayer({
    id: layer.id,
    name: layer.name,
    parentId: layer.parentId,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    transform: {
      ...layer.transform,
      x: layer.transform.x + measured.offsetX,
      y: layer.transform.y + measured.offsetY,
    },
    mask: layer.mask,
    effects: layer.effects,
    pixels: asRasterAssetRef(assetId),
  })
  const after = replaceLayer(before, raster)
  pushMetadata('Rasterize Layer', before, after)
  useEditorSessionStore.getState().bumpRasterEpoch()
  return true
}

export function syncTextOptionsFromLayer(layer: TextLayer): void {
  useTextToolStore.getState().setOptions({
    fontFamily: layer.fontFamily,
    fontSource: layer.fontSource,
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    italic: layer.italic,
    underline: layer.underline,
    color: layer.color,
    align: layer.align,
    tracking: layer.tracking,
    leading: layer.leading,
  })
}

export function applyTextOptionsToSelected(patch: {
  fontFamily?: string
  fontSource?: TextLayer['fontSource']
  fontSize?: number
  fontWeight?: number
  italic?: boolean
  underline?: boolean
  color?: CssColor
  align?: TextLayer['align']
  tracking?: number
  leading?: number
}): void {
  useTextToolStore.getState().setOptions(patch)
  const { selectedLayerIds, document } = useEditorSessionStore.getState()
  if (selectedLayerIds.length !== 1) return
  const id = selectedLayerIds[0]!
  const layer = document.layers[id]
  if (!layer || layer.type !== 'text') return
  const edit = useTextToolStore.getState().edit
  if (edit && edit.layerId === id) {
    const selection = getTextEditingSelection(id)
    const characterPatch: CharacterStylePatch = {
      ...(patch.fontFamily !== undefined ? { fontFamily: patch.fontFamily } : {}),
      ...(patch.fontSource !== undefined ? { fontSource: patch.fontSource } : {}),
      ...(patch.fontSize !== undefined ? { fontSize: patch.fontSize } : {}),
      ...(patch.fontWeight !== undefined ? { fontWeight: patch.fontWeight } : {}),
      ...(patch.italic !== undefined ? { italic: patch.italic } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.underline !== undefined ? { underline: patch.underline } : {}),
      ...(patch.tracking !== undefined ? { tracking: patch.tracking } : {}),
    }
    // A non-collapsed DOM selection receives character styling (including
    // underline and tracking). At a caret, those become layer typing defaults.
    // Leading and align stay paragraph/layer scoped.
    if (selection && selection.start !== selection.end && Object.keys(characterPatch).length) {
      previewTextProps(id, {
        runs: styleTextRange(layer, selection.start, selection.end, characterPatch),
      })
      return
    }
    previewTextProps(id, patch)
    return
  }
  const before = document
  const after = updateTextLayer(before, id, patch)
  pushMetadata('Edit Text', before, after, `text-props:${id}`, 400)
}

export function registerTextCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'layer.newText',
    title: 'New Text Layer',
    enabled: () => true,
    run: () => {
      const doc = useEditorSessionStore.getState().document
      createAndSelectTextLayer({
        textMode: 'point',
        x: Math.round(doc.canvas.width / 2 - 40),
        y: Math.round(doc.canvas.height / 2 - 24),
        content: 'Text',
      })
    },
  })

  registry.register({
    id: 'layer.rasterize',
    title: 'Rasterize Layer',
    enabled: () => {
      const { selectedLayerIds, document } = useEditorSessionStore.getState()
      if (selectedLayerIds.length !== 1) return false
      const layer = document.layers[selectedLayerIds[0]!]
      return layer?.type === 'text'
    },
    run: async () => {
      const id = useEditorSessionStore.getState().selectedLayerIds[0]
      if (!id) return
      await rasterizeTextLayer(id)
    },
  })
}
