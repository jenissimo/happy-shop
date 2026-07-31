import type { CommandRegistry } from '../../core/commands/registry'
import { getLayer, isLayerImageLocked } from '../../core/document'
import { createRasterEntry } from '../../core/history/rasterEntry'
import {
  ensureEditableSurface,
  syncEditableSurfaceToBitmap,
} from '../../imaging/surfaces/EditableSurfaceStore'
import { useBrushSettingsStore } from '../tools/brush/brushSettingsStore'
import { documentHistory } from './documentHistory'
import { useEditorSessionStore } from './EditorSessionStore'
import { deleteSelectedLayers } from './layerCommands'
import {
  activeSelectionMask,
  selectionBoundsInLayerLocal,
} from './selectionClip'
import { useSelectionStore } from './selectionStore'
import { layerLocalToDocument } from '../tools/brush/layerCoords'

function parseHex(color: string): { r: number; g: number; b: number } {
  const hex = color.replace('#', '')
  if (hex.length < 6) return { r: 0, g: 0, b: 0 }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

/** Fill active selection on the selected raster layer (brush color). */
export async function fillSelection(): Promise<boolean> {
  return paintUnderSelection('fill')
}

/** Clear pixels under the active selection on the selected raster layer. */
export async function clearSelection(): Promise<boolean> {
  return paintUnderSelection('clear')
}

async function paintUnderSelection(mode: 'fill' | 'clear'): Promise<boolean> {
  const session = useEditorSessionStore.getState()
  const layerId = session.selectedLayerIds[0]
  if (!layerId) return false
  const layer = getLayer(session.document, layerId)
  if (!layer || layer.type !== 'raster' || isLayerImageLocked(layer)) return false

  const { width: cw, height: ch } = session.document.canvas
  const mask = activeSelectionMask(cw, ch)
  if (!mask) return false
  const bounds = mask.bounds()
  if (!bounds) return false

  const assetId = String(layer.pixels)
  const surface = await ensureEditableSurface(assetId)
  if (!surface) return false

  const region = selectionBoundsInLayerLocal(
    bounds,
    layer.transform,
    surface.width,
    surface.height,
  )
  if (region.width < 1 || region.height < 1) return false

  const color = parseHex(useBrushSettingsStore.getState().color)
  const patch = surface.paintSelection({
    region,
    mode,
    color,
    sampleDoc: (lx, ly) => {
      const doc = layerLocalToDocument({ x: lx, y: ly }, layer.transform)
      return mask.sample(doc.x, doc.y)
    },
  })
  if (patch.tiles.length === 0) return false

  // Bun unit tests lack OffscreenCanvas; tiled surface remains authoritative.
  if (typeof OffscreenCanvas !== 'undefined') {
    await syncEditableSurfaceToBitmap(assetId)
  }
  documentHistory.push(
    createRasterEntry({
      label: mode === 'fill' ? 'Fill' : 'Clear',
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

export function registerEditSelectionCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'select.inverse',
    title: 'Inverse',
    shortcut: 'Mod+Shift+I',
    enabled: () => true,
    run: () => {
      const { width, height } =
        useEditorSessionStore.getState().document.canvas
      useSelectionStore.getState().inverse(width, height)
    },
  })

  registry.register({
    id: 'edit.fill',
    title: 'Fill',
    shortcut: 'Alt+Backspace',
    enabled: () => {
      const session = useEditorSessionStore.getState()
      if (!useSelectionStore.getState().hasSelection()) return false
      const id = session.selectedLayerIds[0]
      if (!id) return false
      const layer = getLayer(session.document, id)
      return !!layer && layer.type === 'raster' && !isLayerImageLocked(layer)
    },
    run: () => {
      void fillSelection()
    },
  })

  registry.register({
    id: 'edit.clear',
    title: 'Clear',
    shortcut: 'Delete',
    enabled: () => {
      if (useSelectionStore.getState().hasSelection()) {
        const session = useEditorSessionStore.getState()
        const id = session.selectedLayerIds[0]
        if (!id) return false
        const layer = getLayer(session.document, id)
        return !!layer && layer.type === 'raster' && !isLayerImageLocked(layer)
      }
      return useEditorSessionStore.getState().selectedLayerIds.length > 0
    },
    run: () => {
      if (useSelectionStore.getState().hasSelection()) {
        void clearSelection()
        return
      }
      deleteSelectedLayers()
    },
  })
}
