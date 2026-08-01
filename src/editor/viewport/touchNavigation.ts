/**
 * Resolves two-finger touch samples into Figma-like viewport navigation:
 * midpoint delta → pan, distance ratio → pinch-zoom toward midpoint.
 */

export type TouchNavPoint = {
  id: number
  /** Viewport screen CSS px (camera space), not client coords. */
  x: number
  y: number
}

export type TouchNavigationAction = {
  dx: number
  dy: number
  /** Multiplicative zoom (>1 zooms in). `1` = no zoom. */
  factor: number
  /** Zoom anchor in viewport screen CSS px. */
  anchorX: number
  anchorY: number
}

const MIN_PINCH_DISTANCE = 1e-3

function midpoint(
  a: TouchNavPoint,
  b: TouchNavPoint,
): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function distance(a: TouchNavPoint, b: TouchNavPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Pick a stable pair from the active touch map (insertion order).
 * Returns null when fewer than two contacts are present.
 */
export function pickTouchPair(
  pointers: ReadonlyMap<number, TouchNavPoint>,
): [TouchNavPoint, TouchNavPoint] | null {
  if (pointers.size < 2) return null
  const iter = pointers.values()
  const a = iter.next().value
  const b = iter.next().value
  if (!a || !b) return null
  return [a, b]
}

/**
 * Map consecutive two-finger samples to pan + pinch zoom.
 * Points must already be in viewport screen CSS px.
 */
export function resolveTouchNavigation(
  prev: readonly [TouchNavPoint, TouchNavPoint],
  next: readonly [TouchNavPoint, TouchNavPoint],
): TouchNavigationAction {
  const prevMid = midpoint(prev[0], prev[1])
  const nextMid = midpoint(next[0], next[1])
  const prevDist = distance(prev[0], prev[1])
  const nextDist = distance(next[0], next[1])

  let factor = 1
  if (prevDist >= MIN_PINCH_DISTANCE && nextDist >= MIN_PINCH_DISTANCE) {
    factor = nextDist / prevDist
  }

  return {
    dx: nextMid.x - prevMid.x,
    dy: nextMid.y - prevMid.y,
    factor,
    anchorX: nextMid.x,
    anchorY: nextMid.y,
  }
}
