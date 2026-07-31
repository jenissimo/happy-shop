export type StrokePoint = { x: number; y: number }

export type StrokeWalkResult = {
  residual: number
  end: StrokePoint
}

/**
 * Walk a segment at fixed spacing. The starting point is not emitted.
 * Returns the unused distance after the final emitted point.
 */
export function walkStroke(
  from: StrokePoint,
  to: StrokePoint,
  spacingPx: number,
  residual: number,
  cb: (point: StrokePoint) => void,
): StrokeWalkResult {
  const spacing = Math.max(0.5, spacingPx)
  let x = from.x
  let y = from.y
  const dx = to.x - x
  const dy = to.y - y
  let distance = Math.hypot(dx, dy)
  if (distance < 1e-9) {
    return { residual, end: { x: to.x, y: to.y } }
  }

  const unitX = dx / distance
  const unitY = dy / distance
  let remaining = residual
  while (remaining + distance >= spacing) {
    const step = spacing - remaining
    x += unitX * step
    y += unitY * step
    distance -= step
    remaining = 0
    cb({ x, y })
  }

  return {
    residual: remaining + distance,
    end: { x: to.x, y: to.y },
  }
}
