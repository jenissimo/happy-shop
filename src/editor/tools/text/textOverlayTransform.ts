import type { Transform } from '../../../core/document'

export type OverlayCamera = {
  zoom: number
  offsetX: number
  offsetY: number
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Screen-space CSS matrix for a layer node, built exactly the way Pixi builds
 * its local transform (rotation + skew + scale about the pivot) and then
 * composed with the camera. Keeping the DOM text editor on the same matrix as
 * `PixiRenderBackend` is what makes the caret sit on the committed glyphs.
 *
 * `translateX` carries the point-text alignment anchor, which Pixi applies in
 * document space (`text.position`), not in layer-local space.
 */
export function layerScreenCssMatrix(
  transform: Transform,
  camera: OverlayCamera,
  translateX = 0,
): string {
  const rotation = degToRad(transform.rotationDeg)
  const skewX = degToRad(transform.skewXDeg)
  const skewY = degToRad(transform.skewYDeg)
  const a = Math.cos(rotation + skewY) * transform.scaleX
  const b = Math.sin(rotation + skewY) * transform.scaleX
  const c = -Math.sin(rotation - skewX) * transform.scaleY
  const d = Math.cos(rotation - skewX) * transform.scaleY
  const tx =
    transform.x + translateX - (transform.pivotX * a + transform.pivotY * c)
  const ty = transform.y - (transform.pivotX * b + transform.pivotY * d)
  const { zoom, offsetX, offsetY } = camera
  const parts = [
    zoom * a,
    zoom * b,
    zoom * c,
    zoom * d,
    zoom * tx + offsetX,
    zoom * ty + offsetY,
  ]
  return `matrix(${parts.map((value) => round(value)).join(', ')})`
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6
}
