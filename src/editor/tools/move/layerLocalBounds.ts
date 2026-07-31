import type { HappyDocument, Layer } from '../../../core/document'
import { isLayerPositionLocked } from '../../../core/document'
import { getRasterSurface } from '../../../imaging'
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
    let { x, y, w, h } = layer.bounds
    if (w < 1) {
      const chars = Math.max(1, layer.content.length)
      w = Math.max(24, chars * layer.fontSize * 0.55)
    }
    if (h < 1) {
      h = Math.max(layer.fontSize * 1.2, layer.leading || 0)
    }
    return { x, y, w, h }
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
