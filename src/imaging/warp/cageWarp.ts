export type WarpPoint = { x: number; y: number }

export type WarpRect = { x: number; y: number; width: number; height: number }

/** Build a cols×rows grid of control points on `bounds` (document space). */
export function buildDefaultCage(
  bounds: WarpRect,
  cols = 3,
  rows = 3,
): WarpPoint[] {
  const points: WarpPoint[] = []
  for (let row = 0; row < rows; row++) {
    const ty = rows <= 1 ? 0.5 : row / (rows - 1)
    for (let col = 0; col < cols; col++) {
      const tx = cols <= 1 ? 0.5 : col / (cols - 1)
      points.push({
        x: bounds.x + tx * bounds.width,
        y: bounds.y + ty * bounds.height,
      })
    }
  }
  return points
}

/** Fixed topology: two triangles per grid cell (top-left diagonal). */
export function buildGridTriangles(cols: number, rows: number): [number, number, number][] {
  const triangles: [number, number, number][] = []
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const a = row * cols + col
      const b = a + 1
      const c = a + cols
      const d = c + 1
      triangles.push([a, b, c], [b, d, c])
    }
  }
  return triangles
}

function barycentric(
  p: WarpPoint,
  a: WarpPoint,
  b: WarpPoint,
  c: WarpPoint,
): { u: number; v: number; w: number } | null {
  const v0x = b.x - a.x
  const v0y = b.y - a.y
  const v1x = c.x - a.x
  const v1y = c.y - a.y
  const v2x = p.x - a.x
  const v2y = p.y - a.y
  const den = v0x * v1y - v1x * v0y
  if (Math.abs(den) < 1e-9) return null
  const v = (v2x * v1y - v1x * v2y) / den
  const w = (v0x * v2y - v2x * v0y) / den
  const u = 1 - v - w
  if (u < -1e-4 || v < -1e-4 || w < -1e-4) return null
  return { u, v, w }
}

function sampleBilinear(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const cx = Math.max(0, Math.min(width - 1, x))
  const cy = Math.max(0, Math.min(height - 1, y))
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const fx = cx - x0
  const fy = cy - y0
  const i00 = (y0 * width + x0) * 4
  const i10 = (y0 * width + x1) * 4
  const i01 = (y1 * width + x0) * 4
  const i11 = (y1 * width + x1) * 4
  const out: [number, number, number, number] = [0, 0, 0, 0]
  for (let c = 0; c < 4; c++) {
    const v00 = data[i00 + c]!
    const v10 = data[i10 + c]!
    const v01 = data[i01 + c]!
    const v11 = data[i11 + c]!
    out[c] = Math.round(
      v00 * (1 - fx) * (1 - fy) +
        v10 * fx * (1 - fy) +
        v01 * (1 - fx) * fy +
        v11 * fx * fy,
    )
  }
  return out
}

function boundsOfPoints(points: ReadonlyArray<WarpPoint>): WarpRect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  }
}

export type CageWarpOptions = {
  source: Uint8ClampedArray
  srcBounds: WarpRect
  restCage: ReadonlyArray<WarpPoint>
  deformedCage: ReadonlyArray<WarpPoint>
  cols: number
  rows: number
  /** Optional per-pixel coverage 0..255 in source-local coords. */
  coverage?: (localX: number, localY: number) => number
  /** Document-space feather radius at the rest cage boundary (0 = hard edge). */
  featherRadius?: number
}

/** Smooth 0..1 weight from distance to the rest cage perimeter. */
export function cageBoundaryFeatherWeight(distance: number, radius: number): number {
  if (radius <= 0) return 1
  if (distance >= radius) return 1
  if (distance <= 0) return 0
  const t = distance / radius
  return t * t * (3 - 2 * t)
}

/** Minimum distance from `p` to any outer edge segment of the rest cage grid. */
export function distanceToRestCageBoundary(
  p: WarpPoint,
  restCage: ReadonlyArray<WarpPoint>,
  cols: number,
  rows: number,
): number {
  let minDist = Infinity
  for (let col = 0; col < cols - 1; col++) {
    minDist = Math.min(
      minDist,
      distToSegment(p, restCage[col]!, restCage[col + 1]!),
      distToSegment(
        p,
        restCage[(rows - 1) * cols + col]!,
        restCage[(rows - 1) * cols + col + 1]!,
      ),
    )
  }
  for (let row = 0; row < rows - 1; row++) {
    minDist = Math.min(
      minDist,
      distToSegment(p, restCage[row * cols]!, restCage[(row + 1) * cols]!),
      distToSegment(
        p,
        restCage[row * cols + cols - 1]!,
        restCage[(row + 1) * cols + cols - 1]!,
      ),
    )
  }
  return minDist
}

/**
 * Inverse-map through the deformed grid mesh and resample `source`.
 * Output covers the union of rest/deformed cage AABBs (clamped to src canvas).
 */
export function warpCageRegion(options: CageWarpOptions): {
  data: Uint8ClampedArray
  bounds: WarpRect
} {
  const { source, srcBounds, restCage, deformedCage, cols, rows, coverage, featherRadius = 0 } =
    options
  const srcW = Math.max(1, Math.round(srcBounds.width))
  const srcH = Math.max(1, Math.round(srcBounds.height))
  const triangles = buildGridTriangles(cols, rows)
  const outBounds = boundsOfPoints([...restCage, ...deformedCage])
  const pad = 1
  const x0 = Math.max(srcBounds.x, Math.floor(outBounds.x) - pad)
  const y0 = Math.max(srcBounds.y, Math.floor(outBounds.y) - pad)
  const x1 = Math.min(
    srcBounds.x + srcBounds.width,
    Math.ceil(outBounds.x + outBounds.width) + pad,
  )
  const y1 = Math.min(
    srcBounds.y + srcBounds.height,
    Math.ceil(outBounds.y + outBounds.height) + pad,
  )
  const outW = Math.max(0, x1 - x0)
  const outH = Math.max(0, y1 - y0)
  const out = new Uint8ClampedArray(outW * outH * 4)

  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const docX = x0 + ox + 0.5
      const docY = y0 + oy + 0.5
      const p = { x: docX, y: docY }
      let mapped: WarpPoint | null = null
      for (const [ia, ib, ic] of triangles) {
        const da = deformedCage[ia]!
        const db = deformedCage[ib]!
        const dc = deformedCage[ic]!
        const bc = barycentric(p, da, db, dc)
        if (!bc) continue
        const ra = restCage[ia]!
        const rb = restCage[ib]!
        const rc = restCage[ic]!
        mapped = {
          x: bc.u * ra.x + bc.v * rb.x + bc.w * rc.x,
          y: bc.u * ra.y + bc.v * rb.y + bc.w * rc.y,
        }
        break
      }
      if (!mapped) continue
      const localX = mapped.x - srcBounds.x
      const localY = mapped.y - srcBounds.y
      const cover = (coverage?.(localX, localY) ?? 255) / 255
      const boundaryDist = distanceToRestCageBoundary(mapped, restCage, cols, rows)
      const featherW = cageBoundaryFeatherWeight(boundaryDist, featherRadius)
      const blend = cover * featherW
      if (blend <= 0) continue
      const [wr, wg, wb, wa] = sampleBilinear(source, srcW, srcH, localX - 0.5, localY - 0.5)
      const outLocalX = docX - srcBounds.x
      const outLocalY = docY - srcBounds.y
      const [or, og, ob, oa] = sampleBilinear(source, srcW, srcH, outLocalX - 0.5, outLocalY - 0.5)
      const oi = (oy * outW + ox) * 4
      out[oi] = Math.round(or + (wr - or) * blend)
      out[oi + 1] = Math.round(og + (wg - og) * blend)
      out[oi + 2] = Math.round(ob + (wb - ob) * blend)
      out[oi + 3] = Math.round(oa + (wa - oa) * blend)
    }
  }

  return { data: out, bounds: { x: x0, y: y0, width: outW, height: outH } }
}

/** Hit-test cage points; returns index or -1. */
export function hitTestCagePoint(
  doc: WarpPoint,
  cage: ReadonlyArray<WarpPoint>,
  radiusDoc: number,
): number {
  const r2 = radiusDoc * radiusDoc
  let best = -1
  let bestD = r2
  for (let i = 0; i < cage.length; i++) {
    const p = cage[i]!
    const d = (p.x - doc.x) ** 2 + (p.y - doc.y) ** 2
    if (d <= bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

function distToSegment(
  p: WarpPoint,
  a: WarpPoint,
  b: WarpPoint,
): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2))
  const px = a.x + t * abx
  const py = a.y + t * aby
  return Math.hypot(p.x - px, p.y - py)
}

export type CageEdgeHit =
  | { kind: 'h'; afterRow: number }
  | { kind: 'v'; afterCol: number }

/** Hit-test cage grid edges; returns the row/column split to insert after. */
export function hitTestCageEdge(
  doc: WarpPoint,
  cage: ReadonlyArray<WarpPoint>,
  cols: number,
  rows: number,
  radiusDoc: number,
): CageEdgeHit | null {
  let best: CageEdgeHit | null = null
  let bestD = radiusDoc

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols; col++) {
      const a = cage[row * cols + col]!
      const b = cage[(row + 1) * cols + col]!
      const d = distToSegment(doc, a, b)
      if (d <= bestD) {
        bestD = d
        best = { kind: 'h', afterRow: row }
      }
    }
  }

  for (let col = 0; col < cols - 1; col++) {
    for (let row = 0; row < rows; row++) {
      const a = cage[row * cols + col]!
      const b = cage[row * cols + col + 1]!
      const d = distToSegment(doc, a, b)
      if (d <= bestD) {
        bestD = d
        best = { kind: 'v', afterCol: col }
      }
    }
  }

  return best
}

function lerpPoint(a: WarpPoint, b: WarpPoint, t: number): WarpPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function copyGridRow(
  source: ReadonlyArray<WarpPoint>,
  cols: number,
  row: number,
): WarpPoint[] {
  const out: WarpPoint[] = []
  for (let col = 0; col < cols; col++) {
    const p = source[row * cols + col]!
    out.push({ x: p.x, y: p.y })
  }
  return out
}

export function insertCageRow(
  restCage: ReadonlyArray<WarpPoint>,
  cage: ReadonlyArray<WarpPoint>,
  cols: number,
  rows: number,
  afterRow: number,
): { restCage: WarpPoint[]; cage: WarpPoint[]; cols: number; rows: number } | null {
  if (afterRow < 0 || afterRow >= rows - 1 || rows >= 8) return null
  const newRows = rows + 1
  const newRest: WarpPoint[] = []
  const newCage: WarpPoint[] = []
  for (let row = 0; row < newRows; row++) {
    if (row <= afterRow) {
      newRest.push(...copyGridRow(restCage, cols, row))
      newCage.push(...copyGridRow(cage, cols, row))
      continue
    }
    if (row === afterRow + 1) {
      for (let col = 0; col < cols; col++) {
        const ra = restCage[afterRow * cols + col]!
        const rb = restCage[(afterRow + 1) * cols + col]!
        const ca = cage[afterRow * cols + col]!
        const cb = cage[(afterRow + 1) * cols + col]!
        newRest.push(lerpPoint(ra, rb, 0.5))
        newCage.push(lerpPoint(ca, cb, 0.5))
      }
      continue
    }
    newRest.push(...copyGridRow(restCage, cols, row - 1))
    newCage.push(...copyGridRow(cage, cols, row - 1))
  }
  return { restCage: newRest, cage: newCage, cols, rows: newRows }
}

export function insertCageCol(
  restCage: ReadonlyArray<WarpPoint>,
  cage: ReadonlyArray<WarpPoint>,
  cols: number,
  rows: number,
  afterCol: number,
): { restCage: WarpPoint[]; cage: WarpPoint[]; cols: number; rows: number } | null {
  if (afterCol < 0 || afterCol >= cols - 1 || cols >= 8) return null
  const newCols = cols + 1
  const newRest: WarpPoint[] = []
  const newCage: WarpPoint[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < newCols; col++) {
      if (col <= afterCol) {
        const p = restCage[row * cols + col]!
        const q = cage[row * cols + col]!
        newRest.push({ x: p.x, y: p.y })
        newCage.push({ x: q.x, y: q.y })
        continue
      }
      if (col === afterCol + 1) {
        const ra = restCage[row * cols + afterCol]!
        const rb = restCage[row * cols + afterCol + 1]!
        const ca = cage[row * cols + afterCol]!
        const cb = cage[row * cols + afterCol + 1]!
        newRest.push(lerpPoint(ra, rb, 0.5))
        newCage.push(lerpPoint(ca, cb, 0.5))
        continue
      }
      const p = restCage[row * cols + col - 1]!
      const q = cage[row * cols + col - 1]!
      newRest.push({ x: p.x, y: p.y })
      newCage.push({ x: q.x, y: q.y })
    }
  }
  return { restCage: newRest, cage: newCage, cols: newCols, rows }
}

export function removeCagePoint(
  restCage: ReadonlyArray<WarpPoint>,
  cage: ReadonlyArray<WarpPoint>,
  cols: number,
  rows: number,
  index: number,
): { restCage: WarpPoint[]; cage: WarpPoint[]; cols: number; rows: number } | null {
  if (index < 0 || index >= cols * rows) return null
  const row = Math.floor(index / cols)
  const col = index % cols
  const canRemoveRow = rows > 2 && row > 0 && row < rows - 1
  const canRemoveCol = cols > 2 && col > 0 && col < cols - 1
  if (canRemoveRow) {
    const newRows = rows - 1
    const newRest: WarpPoint[] = []
    const newCage: WarpPoint[] = []
    for (let r = 0; r < newRows; r++) {
      const srcRow = r < row ? r : r + 1
      newRest.push(...copyGridRow(restCage, cols, srcRow))
      newCage.push(...copyGridRow(cage, cols, srcRow))
    }
    return { restCage: newRest, cage: newCage, cols, rows: newRows }
  }
  if (canRemoveCol) {
    const newCols = cols - 1
    const newRest: WarpPoint[] = []
    const newCage: WarpPoint[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < newCols; c++) {
        const srcCol = c < col ? c : c + 1
        const p = restCage[r * cols + srcCol]!
        const q = cage[r * cols + srcCol]!
        newRest.push({ x: p.x, y: p.y })
        newCage.push({ x: q.x, y: q.y })
      }
    }
    return { restCage: newRest, cage: newCage, cols: newCols, rows }
  }
  return null
}

export function canRemoveCagePoint(cols: number, rows: number, index: number): boolean {
  if (index < 0 || index >= cols * rows) return false
  const row = Math.floor(index / cols)
  const col = index % cols
  return (
    (rows > 2 && row > 0 && row < rows - 1) ||
    (cols > 2 && col > 0 && col < cols - 1)
  )
}
