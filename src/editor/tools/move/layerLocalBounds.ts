import type { HappyDocument, Layer } from '../../../core/document'
import { isLayerPositionLocked } from '../../../core/document'
import { getRasterSurface } from '../../../imaging'
import { measureTextBoundsSync } from '../text/textLayout'
import type { LocalBounds } from './transformMath'

/**
 * Content rectangle in layer-local space for transform handles.
 * Raster: full surface at (0,0). Shape/text: their `bounds`.
 */
export function getLayerLocalBounds(
  layer: Layer,
  doc: HappyDocument,
): LocalBounds | null {
  if (layer.type === 'raster') {
    const surface = getRasterSurface(String(layer.pixels))
    const w = surface?.width ?? doc.canvas.width
    const h = surface?.height ?? doc.canvas.height
    if (w < 1 || h < 1) return null
    return { x: 0, y: 0, w, h }
  }
  if (layer.type === 'shape') {
    const { x, y, w, h } = layer.bounds
    if (w < 1 || h < 1) return null
    return { x, y, w, h }
  }
  if (layer.type === 'text') {
    if (layer.textMode === 'box' && layer.bounds.w >= 1 && layer.bounds.h >= 1) {
      return { x: layer.bounds.x, y: layer.bounds.y, w: layer.bounds.w, h: layer.bounds.h }
    }
    const measured = measureTextBoundsSync(layer)
    return {
      x: measured.offsetX,
      y: measured.offsetY,
      w: measured.width,
      h: measured.height,
    }
  }
  return null
}

export function isTransformableLayer(layer: Layer): boolean {
  return (
    (layer.type === 'raster' ||
      layer.type === 'shape' ||
      layer.type === 'text') &&
    !isLayerPositionLocked(layer)
  )
}
