import { getLayer, isLayerImageLocked } from '../../core/document'
import { createRasterEntry } from '../../core/history/rasterEntry'
import {
  ensureEditableSurface,
  syncEditableSurfaceToBitmap,
} from '../../imaging/surfaces/EditableSurfaceStore'
import { documentHistory } from '../session/documentHistory'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { buildPaintClip } from '../session/paintClip'
import { selectionBoundsInLayerLocal } from '../session/selectionClip'
import { useSelectionStore } from '../session/selectionStore'
import { addGaussianBlurNode, canAddContentFilter } from './contentFilters'

export const MAX_GAUSSIAN_BLUR_RADIUS = 100

export function canApplyGaussianBlur(): boolean {
  return canAddContentFilter()
}

/** Add a non-destructive gaussian-blur content node to the active layer FX stack. */
export async function applyGaussianBlur(radius: number): Promise<boolean> {
  if (!canApplyGaussianBlur()) return false
  return addGaussianBlurNode(radius)
}

/** Destructive raster blur — kept for regression tests and explicit rasterize workflows. */
export async function applyGaussianBlurDestructive(radius: number): Promise<boolean> {
  const state = useEditorSessionStore.getState()
  const id = state.selectedLayerIds[0]
  const layer = id && getLayer(state.document, id)
  if (!layer || layer.type !== 'raster' || isLayerImageLocked(layer)) return false

  const normalizedRadius = Math.max(0, Math.min(MAX_GAUSSIAN_BLUR_RADIUS, radius))
  if (normalizedRadius === 0) return false
  const surfaceId = String(layer.pixels)
  const surface = await ensureEditableSurface(surfaceId, state.document.canvas)
  if (!surface) return false

  const selection = useSelectionStore.getState()
  const selectedBounds = selection.mask?.bounds() ?? selection.marquee
  const region = selectedBounds
    ? selectionBoundsInLayerLocal(
        selectedBounds,
        layer.transform,
        surface.width,
        surface.height,
      )
    : { x: 0, y: 0, width: surface.width, height: surface.height }
  const patch = surface.gaussianBlur({
    region,
    radius: normalizedRadius,
    clip: buildPaintClip(layer, surface),
  })
  if (!patch.tiles.length) return false

  await syncEditableSurfaceToBitmap(surfaceId)
  const invalidate = () => useEditorSessionStore.getState().bumpRasterEpoch()
  documentHistory.push(
    createRasterEntry({
      label: 'Gaussian Blur',
      patch,
      onInvalidated: invalidate,
    }),
  )
  invalidate()
  useEditorSessionStore.setState({
    dirty: true,
    historyVersion: documentHistory.version,
  })
  return true
}
