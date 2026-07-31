/** Snap a layer-local coordinate to the center of the nearest document pixel. */
export function snapPixelCenter(value: number): number {
  return Math.floor(value) + 0.5
}

export function snapPixelPoint(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: snapPixelCenter(point.x),
    y: snapPixelCenter(point.y),
  }
}

/** Integer side length for pixel-art brush sizes (minimum 1). */
export function snapPixelBrushSize(size: number): number {
  if (!Number.isFinite(size)) return 1
  return Math.max(1, Math.round(size))
}

/** Pixel grid indices (0-based) from a snapped pixel-center coordinate. */
export function pixelIndexFromCenter(center: number): number {
  return Math.floor(center)
}
