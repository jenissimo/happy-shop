import type { Transform } from '../../../core/document'
import type { Rect, TiledRasterSurface } from '../../../imaging/surfaces/TiledRasterSurface'
import {
  documentToLayerLocal,
  layerLocalToDocument,
} from '../brush/layerCoords'

function sampleBilinearBuffer(
  data: Uint8ClampedArray,
  bounds: Rect,
  docX: number,
  docY: number,
): [number, number, number, number] {
  const lx = docX - bounds.x
  const ly = docY - bounds.y
  const w = bounds.width
  const h = bounds.height
  if (lx < -0.5 || ly < -0.5 || lx > w - 0.5 || ly > h - 0.5) {
    return [0, 0, 0, 0]
  }
  const cx = Math.max(0, Math.min(w - 1, lx))
  const cy = Math.max(0, Math.min(h - 1, ly))
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const fx = cx - x0
  const fy = cy - y0
  const out: [number, number, number, number] = [0, 0, 0, 0]
  for (let c = 0; c < 4; c++) {
    const i00 = (y0 * w + x0) * 4 + c
    const i10 = (y0 * w + x1) * 4 + c
    const i01 = (y1 * w + x0) * 4 + c
    const i11 = (y1 * w + x1) * 4 + c
    out[c] = Math.round(
      data[i00]! * (1 - fx) * (1 - fy) +
        data[i10]! * fx * (1 - fy) +
        data[i01]! * (1 - fx) * fy +
        data[i11]! * fx * fy,
    )
  }
  return out
}

function sampleBilinearLocal(
  surface: TiledRasterSurface,
  localX: number,
  localY: number,
): [number, number, number, number] {
  const { data, width, height } = surface.toRgbaBuffer()
  const cx = Math.max(0, Math.min(width - 1, localX))
  const cy = Math.max(0, Math.min(height - 1, localY))
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const fx = cx - x0
  const fy = cy - y0
  const out: [number, number, number, number] = [0, 0, 0, 0]
  for (let c = 0; c < 4; c++) {
    const i00 = (y0 * width + x0) * 4 + c
    const i10 = (y0 * width + x1) * 4 + c
    const i01 = (y1 * width + x0) * 4 + c
    const i11 = (y1 * width + x1) * 4 + c
    out[c] = Math.round(
      data[i00]! * (1 - fx) * (1 - fy) +
        data[i10]! * fx * (1 - fy) +
        data[i01]! * (1 - fx) * fy +
        data[i11]! * fx * fy,
    )
  }
  return out
}

export function captureDocRegion(
  surface: TiledRasterSurface,
  transform: Transform,
  docBounds: Rect,
  coverage: (localX: number, localY: number) => number,
): Uint8ClampedArray {
  const w = docBounds.width
  const h = docBounds.height
  const out = new Uint8ClampedArray(w * h * 4)
  for (let oy = 0; oy < h; oy++) {
    for (let ox = 0; ox < w; ox++) {
      const doc = { x: docBounds.x + ox + 0.5, y: docBounds.y + oy + 0.5 }
      const local = documentToLayerLocal(doc, transform)
      const cover = coverage(local.x, local.y) / 255
      const [r, g, b, a] = sampleBilinearLocal(surface, local.x, local.y)
      const oi = (oy * w + ox) * 4
      out[oi] = r
      out[oi + 1] = g
      out[oi + 2] = b
      out[oi + 3] = Math.round(a * cover)
    }
  }
  return out
}

export function buildDocSampleFn(
  transform: Transform,
  warped: { docBounds: { x: number; y: number; width: number; height: number }; data: Uint8ClampedArray },
  baseline: { docBounds: { x: number; y: number; width: number; height: number }; data: Uint8ClampedArray },
  coverage: (localX: number, localY: number) => number,
): (localX: number, localY: number) => [number, number, number, number] | null {
  return (localX, localY) => {
    const cover = coverage(localX, localY)
    if (cover <= 0) return null
    const doc = layerLocalToDocument({ x: localX, y: localY }, transform)
    const [wr, wg, wb, wa] = sampleBilinearBuffer(
      warped.data,
      warped.docBounds,
      doc.x,
      doc.y,
    )
    if (wa > 0) {
      return [wr, wg, wb, Math.round((wa * cover) / 255)]
    }
    const [br, bg, bb, ba] = sampleBilinearBuffer(
      baseline.data,
      baseline.docBounds,
      doc.x,
      doc.y,
    )
    if (ba <= 0) return null
    return [br, bg, bb, Math.round((ba * cover) / 255)]
  }
}

export function layerLocalRegionFromDocBounds(
  docBounds: Rect,
  transform: Transform,
  surfaceWidth: number,
  surfaceHeight: number,
): Rect {
  const corners = [
    { x: docBounds.x, y: docBounds.y },
    { x: docBounds.x + docBounds.width, y: docBounds.y },
    { x: docBounds.x, y: docBounds.y + docBounds.height },
    { x: docBounds.x + docBounds.width, y: docBounds.y + docBounds.height },
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of corners) {
    const local = documentToLayerLocal(c, transform)
    minX = Math.min(minX, local.x)
    minY = Math.min(minY, local.y)
    maxX = Math.max(maxX, local.x)
    maxY = Math.max(maxY, local.y)
  }
  const pad = 2
  const x = Math.max(0, Math.floor(minX) - pad)
  const y = Math.max(0, Math.floor(minY) - pad)
  const right = Math.min(surfaceWidth, Math.ceil(maxX) + pad)
  const bottom = Math.min(surfaceHeight, Math.ceil(maxY) + pad)
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }
}
