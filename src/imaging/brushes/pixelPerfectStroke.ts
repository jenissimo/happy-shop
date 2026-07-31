import {
  pixelIndexFromCenter,
  snapPixelCenter,
} from './pixelSnap'

export type PixelCell = { ix: number; iy: number }

type GridPoint = { x: number; y: number }

/** Map a snapped pixel-center coordinate to integer grid indices. */
export function pixelCellFromCenter(x: number, y: number): PixelCell {
  return {
    ix: pixelIndexFromCenter(x),
    iy: pixelIndexFromCenter(y),
  }
}

export function pixelCenterFromCell(cell: PixelCell): { x: number; y: number } {
  return {
    x: snapPixelCenter(cell.ix),
    y: snapPixelCenter(cell.iy),
  }
}

/** Integer Bresenham line on the pixel grid (inclusive endpoints). */
export function bresenhamLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): GridPoint[] {
  const points: GridPoint[] = []
  let x = x0
  let y = y0
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : x0 > x1 ? -1 : 0
  const sy = y0 < y1 ? 1 : y0 > y1 ? -1 : 0
  let err = dx - dy

  while (true) {
    points.push({ x, y })
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
  return points
}

function isCornerDouble(a: GridPoint, b: GridPoint, c: GridPoint): boolean {
  return (
    (a.x === b.x || a.y === b.y) &&
    (c.x === b.x || c.y === b.y) &&
    a.x !== c.x &&
    a.y !== c.y
  )
}

/**
 * Remove inner-corner pixels that thicken shallow diagonals to 2 px wide.
 * Expects inclusive endpoints on the integer pixel grid.
 */
export function omitCornerDoubles(points: GridPoint[]): GridPoint[] {
  if (points.length <= 2) return points.slice()
  const result: GridPoint[] = [points[0]!]
  for (let i = 1; i < points.length - 1; i++) {
    const a = result[result.length - 1]!
    const b = points[i]!
    const c = points[i + 1]!
    if (isCornerDouble(a, b, c)) continue
    result.push(b)
  }
  result.push(points[points.length - 1]!)
  return result
}

function omitCornerDoublesFromPrev(
  prev: GridPoint,
  points: GridPoint[],
): GridPoint[] {
  if (points.length === 0) return points
  const result: GridPoint[] = []
  let a = prev
  for (let i = 0; i < points.length; i++) {
    const b = points[i]!
    const c = points[i + 1]
    if (c && isCornerDouble(a, b, c)) continue
    result.push(b)
    a = b
  }
  return result
}

/** Full grid path for tests and offline validation. */
export function pixelStrokePath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  omitCorners: boolean,
): GridPoint[] {
  let path = bresenhamLine(x0, y0, x1, y1)
  if (omitCorners) path = omitCornerDoubles(path)
  return path
}

/**
 * Bresenham walk on the integer pixel grid. Omits the start cell so callers
 * can chain segments without double-stamping. Each emitted point is a snapped
 * pixel center. When `omitCorners` is true, inner L-corners are skipped so
 * shallow diagonals stay 1 px wide.
 */
export function walkPixelPerfectLine(
  fromCenter: { x: number; y: number },
  toCenter: { x: number; y: number },
  omitCorners: boolean,
  cb: (x: number, y: number) => void,
): PixelCell {
  const from = pixelCellFromCenter(fromCenter.x, fromCenter.y)
  const to = pixelCellFromCenter(toCenter.x, toCenter.y)

  let line = bresenhamLine(from.ix, from.iy, to.ix, to.iy)
  if (line.length <= 1) return to

  line = line.slice(1)
  if (omitCorners) {
    line = omitCornerDoublesFromPrev({ x: from.ix, y: from.iy }, line)
  }

  for (const pixel of line) {
    const center = pixelCenterFromCell({ ix: pixel.x, iy: pixel.y })
    cb(center.x, center.y)
  }

  return to
}
