import type { Transform } from '../../../core/document'
import type { Point } from '../../viewport/ViewportCamera'

const DEG = Math.PI / 180

/**
 * Document (canvas) px → layer-local / raster px.
 *
 * Matches Pixi layer placement in `PixiRenderBackend.applyLayer` (pad=0):
 *   world = T(pos) · R · S · K · T(-pivot) · local
 * Brush stamps into the tiled surface in local/raster space; painting at raw
 * document coords is the classic “stroke misses the cursor” bug on moved /
 * rotated / scaled layers (and still wrong whenever transform ≠ identity).
 */
export function documentToLayerLocal(doc: Point, t: Transform): Point {
  let x = doc.x - t.x
  let y = doc.y - t.y

  const rot = -t.rotationDeg * DEG
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const rx = x * cos - y * sin
  const ry = x * sin + y * cos

  // Inverse skew (affine): [1, skewX; skewY, 1] with tan(skew) like Pixi.
  const kx = Math.tan(t.skewXDeg * DEG)
  const ky = Math.tan(t.skewYDeg * DEG)
  // Solve [1 kx; ky 1] · [sx; sy] = [rx; ry]
  const det = 1 - kx * ky
  const sx = det !== 0 ? (rx - kx * ry) / det : rx
  const sy = det !== 0 ? (ry - ky * rx) / det : ry

  const scaleX = t.scaleX === 0 ? 1 : t.scaleX
  const scaleY = t.scaleY === 0 ? 1 : t.scaleY
  return {
    x: sx / scaleX + t.pivotX,
    y: sy / scaleY + t.pivotY,
  }
}

/** Layer-local / raster px → document (canvas) px (forward of the above). */
export function layerLocalToDocument(local: Point, t: Transform): Point {
  let x = local.x - t.pivotX
  let y = local.y - t.pivotY
  x *= t.scaleX
  y *= t.scaleY
  const kx = Math.tan(t.skewXDeg * DEG)
  const ky = Math.tan(t.skewYDeg * DEG)
  const skx = x + kx * y
  const sky = ky * x + y
  const rot = t.rotationDeg * DEG
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  return {
    x: skx * cos - sky * sin + t.x,
    y: skx * sin + sky * cos + t.y,
  }
}
