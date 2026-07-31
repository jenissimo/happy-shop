import type { HappyDocument } from '../../../core/document'
import type { SelectionPoint } from '../../session/SelectionMask'
import {
  compositeRasterLayers,
  visibleRasterLayers,
} from '../../session/compositeRasters'

export type EdgeField = {
  data: Float32Array
  width: number
  height: number
}

/** Build a Sobel magnitude field from the merged visible canvas. */
export async function buildDocumentEdgeField(
  doc: HappyDocument,
): Promise<EdgeField | null> {
  const layers = visibleRasterLayers(doc)
  if (layers.length === 0) return null
  const region = {
    x: 0,
    y: 0,
    width: doc.canvas.width,
    height: doc.canvas.height,
  }
  const composited = await compositeRasterLayers(layers, region)
  if (!composited) return null
  return computeEdgeField(composited.rgba, composited.width, composited.height)
}

export function computeEdgeField(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): EdgeField {
  const gray = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    const a = rgba[o + 3]! / 255
    gray[i] =
      (rgba[o]! * 0.299 + rgba[o + 1]! * 0.587 + rgba[o + 2]! * 0.114) * a
  }

  const data = new Float32Array(width * height)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const gx = gray[i + 1]! - gray[i - 1]!
      const gy = gray[i + width]! - gray[i - width]!
      data[i] = Math.hypot(gx, gy)
    }
  }
  return { data, width, height }
}

function edgeAt(field: EdgeField, x: number, y: number): number {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || py < 0 || px >= field.width || py >= field.height) return 0
  return field.data[py * field.width + px]!
}

/** Snap a document point to the strongest edge within `radius` px. */
export function snapPointToEdge(
  x: number,
  y: number,
  field: EdgeField,
  radius = 8,
): SelectionPoint {
  const cx = Math.round(x)
  const cy = Math.round(y)
  let best: SelectionPoint = { x: cx, y: cy }
  let bestMag = edgeAt(field, cx, cy)
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = cx + dx
      const py = cy + dy
      const mag = edgeAt(field, px, py)
      if (mag > bestMag) {
        bestMag = mag
        best = { x: px, y: py }
      }
    }
  }
  return best
}

/**
 * Greedy edge-following segment from `from` toward `to`.
 * Returns intermediate points (excluding `from`; includes snapped `to`).
 */
export function traceMagneticSegment(
  from: SelectionPoint,
  to: SelectionPoint,
  field: EdgeField,
  step = 4,
): SelectionPoint[] {
  const points: SelectionPoint[] = []
  let current = { ...from }
  const maxSteps = Math.ceil(
    Math.hypot(to.x - from.x, to.y - from.y) / Math.max(1, step),
  ) + 64

  for (let i = 0; i < maxSteps; i++) {
    const dist = Math.hypot(to.x - current.x, to.y - current.y)
    if (dist <= step) break

    const angle = Math.atan2(to.y - current.y, to.x - current.x)
    let best = current
    let bestScore = -Infinity

    for (let da = -Math.PI / 2; da <= Math.PI / 2; da += Math.PI / 8) {
      const a = angle + da * 0.35
      const nx = Math.round(current.x + Math.cos(a) * step)
      const ny = Math.round(current.y + Math.sin(a) * step)
      if (nx < 0 || ny < 0 || nx >= field.width || ny >= field.height) continue
      const edge = edgeAt(field, nx, ny)
      const toward = 1 / (1 + Math.hypot(to.x - nx, to.y - ny))
      const score = edge * 2 + toward
      if (score > bestScore) {
        bestScore = score
        best = { x: nx, y: ny }
      }
    }

    if (best.x === current.x && best.y === current.y) break
    points.push(best)
    current = best
  }

  const snappedTo = snapPointToEdge(to.x, to.y, field)
  const last = points[points.length - 1]
  if (!last || last.x !== snappedTo.x || last.y !== snappedTo.y) {
    points.push(snappedTo)
  }
  return points
}
