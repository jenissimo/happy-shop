export type Point = { x: number; y: number }

/**
 * Clamp a floating window so the title bar stays mostly reachable on-screen.
 * At least 48px of the window remains visible horizontally; top edge stays ≥ 8px in.
 */
export function clampFloatingPosition(
  x: number,
  y: number,
  windowWidth: number,
  viewportWidth: number,
  viewportHeight: number,
): Point {
  const maxX = Math.max(0, viewportWidth - 48)
  const maxY = Math.max(0, viewportHeight - 48)
  const minX = 8 - windowWidth + 48
  const minY = 8
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  }
}

/** Next left/top from a pointer drag (client coordinates → CSS left/top). */
export function floatingPositionFromDrag(
  origin: Point,
  pointerStart: Point,
  pointerCurrent: Point,
  windowWidth: number,
  viewportWidth: number,
  viewportHeight: number,
): Point {
  return clampFloatingPosition(
    origin.x + (pointerCurrent.x - pointerStart.x),
    origin.y + (pointerCurrent.y - pointerStart.y),
    windowWidth,
    viewportWidth,
    viewportHeight,
  )
}
