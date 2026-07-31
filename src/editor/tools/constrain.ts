export type Pt = { x: number; y: number }
export type Rect = { x: number; y: number; width: number; height: number }

/** Shared screen-space drag threshold. */
export const POINTER_DRAG_THRESHOLD_PX = 4

export function constrainToAxis(from: Pt, to: Pt, stepDeg = 45): Pt {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.hypot(dx, dy)
  if (distance < 1e-9) return { ...from }
  const step = (stepDeg * Math.PI) / 180
  const angle = Math.round(Math.atan2(dy, dx) / step) * step
  return {
    x: from.x + Math.cos(angle) * distance,
    y: from.y + Math.sin(angle) * distance,
  }
}

/** Sign-preserving square drag, normalized into a canvas rect. */
export function squareFromDrag(start: Pt, current: Pt): Rect {
  const dx = current.x - start.x
  const dy = current.y - start.y
  const size = Math.max(Math.abs(dx), Math.abs(dy))
  const signedX = (Math.sign(dx) || 1) * size
  const signedY = (Math.sign(dy) || 1) * size
  return {
    x: Math.min(start.x, start.x + signedX),
    y: Math.min(start.y, start.y + signedY),
    width: size,
    height: size,
  }
}

export function rectFromCenter(center: Pt, current: Pt): Rect {
  const halfW = Math.abs(current.x - center.x)
  const halfH = Math.abs(current.y - center.y)
  return {
    x: center.x - halfW,
    y: center.y - halfH,
    width: halfW * 2,
    height: halfH * 2,
  }
}

export function rectFromDrag(
  start: Pt,
  current: Pt,
  opts: { square?: boolean; fromCenter?: boolean } = {},
): Rect {
  let target = current
  if (opts.square) {
    const dx = current.x - start.x
    const dy = current.y - start.y
    const size = Math.max(Math.abs(dx), Math.abs(dy))
    target = {
      x: start.x + (Math.sign(dx) || 1) * size,
      y: start.y + (Math.sign(dy) || 1) * size,
    }
  }
  if (opts.fromCenter) return rectFromCenter(start, target)
  return {
    x: Math.min(start.x, target.x),
    y: Math.min(start.y, target.y),
    width: Math.abs(target.x - start.x),
    height: Math.abs(target.y - start.y),
  }
}

export function isDrag(
  start: Pt,
  current: Pt,
  zoom: number,
  thresholdPx = POINTER_DRAG_THRESHOLD_PX,
): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) * zoom >= thresholdPx
}
