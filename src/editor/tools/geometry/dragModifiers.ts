import {
  constrainToAxis,
  rectFromDrag,
  type Pt,
  type Rect,
} from '../constrain'

/** @deprecated Use `Pt` from `../constrain`. */
export type DragPoint = Pt
/** @deprecated Use `Rect` from `../constrain`. */
export type DragRect = Rect

export type DragModifierKeys = {
  shiftKey?: boolean
  altKey?: boolean
}

/**
 * Photoshop-like drag rect for marquee / ellipse / shape:
 * - Shift: lock 1:1 (square / circle)
 * - Alt: draw from center (start is the center)
 * - Shift+Alt: both
 */
export function constrainedDragRect(
  start: DragPoint,
  current: DragPoint,
  mods: DragModifierKeys = {},
): DragRect {
  return rectFromDrag(start, current, {
    square: !!mods.shiftKey,
    fromCenter: !!mods.altKey,
  })
}

/**
 * Snap `current` onto the nearest 45° ray from `origin` (keeps distance).
 * Used for Shift-constrained brush drags.
 */
export function constrainTo45(origin: DragPoint, current: DragPoint): DragPoint {
  return constrainToAxis(origin, current, 45)
}

/**
 * Distance-sampled points along a segment, matching brush spacing residual.
 * Does not include the start point; stamps when traveled distance hits spacing.
 * Returns residual unused distance past the last stamp toward `to`.
 */
export function sampleLinePoints(
  from: DragPoint,
  to: DragPoint,
  spacing: number,
  residual = 0,
): { points: DragPoint[]; residual: number; end: DragPoint } {
  const spacingPx = Math.max(0.5, spacing)
  let x0 = from.x
  let y0 = from.y
  let dx = to.x - x0
  let dy = to.y - y0
  let dist = Math.hypot(dx, dy)
  if (dist < 1e-9) {
    return { points: [], residual, end: { x: to.x, y: to.y } }
  }
  let traveled = residual
  const ux = dx / dist
  const uy = dy / dist
  const points: DragPoint[] = []
  while (traveled + dist >= spacingPx) {
    const step = spacingPx - traveled
    x0 += ux * step
    y0 += uy * step
    dist -= step
    traveled = 0
    points.push({ x: x0, y: y0 })
  }
  return {
    points,
    residual: traveled + dist,
    end: { x: to.x, y: to.y },
  }
}
