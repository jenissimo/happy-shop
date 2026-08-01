import type { PathKnot, PathSubpath, VectorPath } from '../../core/document/pathSchema'

export type SamplePoint = { x: number; y: number }

export type SampleVectorPathOptions = {
  /** Target spacing between emitted points in document px. */
  stepPx?: number
}

const DEFAULT_STEP_PX = 2

function absHandle(knot: PathKnot, handle: { x: number; y: number } | null): SamplePoint {
  if (!handle) return { x: knot.x, y: knot.y }
  return { x: knot.x + handle.x, y: knot.y + handle.y }
}

function cubicAt(
  t: number,
  p0: SamplePoint,
  p1: SamplePoint,
  p2: SamplePoint,
  p3: SamplePoint,
): SamplePoint {
  const u = 1 - t
  const uu = u * u
  const tt = t * t
  const uuu = uu * u
  const ttt = tt * t
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  }
}

function cubicLength(
  p0: SamplePoint,
  p1: SamplePoint,
  p2: SamplePoint,
  p3: SamplePoint,
  samples = 12,
): number {
  let length = 0
  let prev = p0
  for (let index = 1; index <= samples; index++) {
    const point = cubicAt(index / samples, p0, p1, p2, p3)
    length += Math.hypot(point.x - prev.x, point.y - prev.y)
    prev = point
  }
  return length
}

function sampleCubicSegment(
  p0: SamplePoint,
  c1: SamplePoint,
  c2: SamplePoint,
  p1: SamplePoint,
  stepPx: number,
  includeStart: boolean,
): SamplePoint[] {
  const length = cubicLength(p0, c1, c2, p1)
  const steps = Math.max(1, Math.ceil(length / stepPx))
  const points: SamplePoint[] = includeStart ? [{ ...p0 }] : []
  for (let index = 1; index <= steps; index++) {
    points.push(cubicAt(index / steps, p0, c1, c2, p1))
  }
  return points
}

function sampleSubpath(sp: PathSubpath, stepPx: number): SamplePoint[] {
  const { knots, closed } = sp
  if (knots.length === 0) return []
  if (knots.length === 1) return [{ x: knots[0]!.x, y: knots[0]!.y }]

  const points: SamplePoint[] = [{ x: knots[0]!.x, y: knots[0]!.y }]
  const segmentCount = closed ? knots.length : knots.length - 1

  for (let index = 0; index < segmentCount; index++) {
    const current = knots[index]!
    const next = knots[(index + 1) % knots.length]!
    const p0 = { x: current.x, y: current.y }
    const p1 = { x: next.x, y: next.y }
    const c1 = absHandle(current, current.handleOut)
    const c2 = absHandle(next, next.handleIn)
    // Always sample as cubic; missing handles coincide with knot (one-sided OK).
    const hasCurve = current.handleOut != null || next.handleIn != null
    if (hasCurve) {
      for (const point of sampleCubicSegment(p0, c1, c2, p1, stepPx, false)) {
        points.push(point)
      }
    } else {
      // Sample straight segments at stepPx so stroke spacing stays uniform.
      const length = Math.hypot(p1.x - p0.x, p1.y - p0.y)
      const steps = Math.max(1, Math.ceil(length / stepPx))
      for (let s = 1; s <= steps; s++) {
        const t = s / steps
        points.push({
          x: p0.x + (p1.x - p0.x) * t,
          y: p0.y + (p1.y - p0.y) * t,
        })
      }
    }
  }

  if (closed && points.length > 1) {
    const first = points[0]!
    const last = points[points.length - 1]!
    if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-3) {
      points.pop()
    }
  }

  return points
}

/** Flatten a persisted vector path to a document-space polyline. */
export function sampleVectorPath(
  path: VectorPath,
  options: SampleVectorPathOptions = {},
): SamplePoint[] {
  const stepPx = Math.max(0.5, options.stepPx ?? DEFAULT_STEP_PX)
  const points: SamplePoint[] = []
  for (const sp of path.subpaths) {
    points.push(...sampleSubpath(sp, stepPx))
  }
  return points
}

export function pathRequiresClosedFill(path: VectorPath): boolean {
  const fillable = path.subpaths.filter((sp) => sp.knots.length >= 3)
  return fillable.length > 0 && fillable.every((sp) => sp.closed)
}

export function pathCanStroke(path: VectorPath): boolean {
  return path.subpaths.some((sp) => sp.knots.length >= 2)
}
