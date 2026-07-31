import type { Layer } from './schema'

/** Full layer lock (row lock icon / header "lock all"). */
export function isLayerFullyLocked(layer: Layer): boolean {
  return layer.locked
}

/** Blocks move, scale, rotate, and Free Transform. */
export function isLayerPositionLocked(layer: Layer): boolean {
  return layer.locked || Boolean(layer.lockFlags?.position)
}

/** Blocks pixel edits (brush, fill, retouch, filters, etc.). */
export function isLayerImageLocked(layer: Layer): boolean {
  return layer.locked || Boolean(layer.lockFlags?.imagePixels)
}

/** Restricts painting to pixels that already have alpha > 0. */
export function isLayerTransparentPixelsLocked(layer: Layer): boolean {
  return layer.locked || Boolean(layer.lockFlags?.transparentPixels)
}
