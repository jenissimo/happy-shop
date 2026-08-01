/**
 * Pen / work-path geometry (SPECS/PEN-TOOL.md).
 * Stored on ShapeLayer as `svg-path` pathData with M/L/C/Z commands.
 * Canonical model: compound path of subpaths with optional linked handles.
 */

export type PenPoint = { x: number; y: number }

/** Absolute document-space anchor with optional cubic handles. */
export type PenAnchor = PenPoint & {
  in?: PenPoint
  out?: PenPoint
  /** When true (default for smooth), dragging one handle mirrors the opposite. */
  linked?: boolean
}

export type PenSubpath = {
  anchors: PenAnchor[]
  closed: boolean
}

export type PenPath = {
  subpaths: PenSubpath[]
  fillRule?: 'nonzero' | 'evenodd'
}

const CLOSE_DIST_PX = 8
const EPS = 1e-6

export function emptySubpath(): PenSubpath {
  return { anchors: [], closed: false }
}

export function emptyPenPath(): PenPath {
  return { subpaths: [emptySubpath()] }
}

export function ensureSubpath(path: PenPath, index = 0): PenPath {
  if (path.subpaths[index]) return path
  const subpaths = [...path.subpaths]
  while (subpaths.length <= index) subpaths.push(emptySubpath())
  return { ...path, subpaths }
}

export function getSubpath(path: PenPath, index = 0): PenSubpath {
  return path.subpaths[index] ?? emptySubpath()
}

export function setSubpath(path: PenPath, index: number, subpath: PenSubpath): PenPath {
  const subpaths = [...path.subpaths]
  subpaths[index] = subpath
  return { ...path, subpaths }
}

export function updateSubpath(
  path: PenPath,
  index: number,
  updater: (sp: PenSubpath) => PenSubpath,
): PenPath {
  return setSubpath(path, index, updater(getSubpath(path, index)))
}

export function activeSubpathIndex(path: PenPath, preferred = 0): number {
  if (path.subpaths[preferred]) return preferred
  return Math.max(0, path.subpaths.length - 1)
}

/** Total anchors across all subpaths. */
export function penPathAnchorCount(path: PenPath): number {
  return path.subpaths.reduce((n, sp) => n + sp.anchors.length, 0)
}

export function penPathIsEmpty(path: PenPath | null | undefined): boolean {
  return !path || penPathAnchorCount(path) === 0
}

/** True when every non-empty subpath is closed and fillable. */
export function penPathIsFillable(path: PenPath): boolean {
  const nonEmpty = path.subpaths.filter((sp) => sp.anchors.length >= 3)
  return nonEmpty.length > 0 && nonEmpty.every((sp) => sp.closed)
}

export function penPathIsStrokable(path: PenPath): boolean {
  return path.subpaths.some((sp) => sp.anchors.length >= 2)
}

function near(a: PenPoint, b: PenPoint, dist = CLOSE_DIST_PX): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= dist
}

export function penPathCanClose(
  path: PenPath,
  x: number,
  y: number,
  subpathIndex = 0,
): boolean {
  const sp = getSubpath(path, subpathIndex)
  const first = sp.anchors[0]
  return Boolean(first && sp.anchors.length >= 3 && !sp.closed && near(first, { x, y }))
}

/** Hit near first or last endpoint of an open subpath (for continue). */
export function hitTestPathEndpoint(
  path: PenPath,
  x: number,
  y: number,
  zoom = 1,
): { subpathIndex: number; end: 'start' | 'end' } | null {
  const scale = Math.max(0.25, zoom)
  const r = CLOSE_DIST_PX / scale
  for (let si = path.subpaths.length - 1; si >= 0; si--) {
    const sp = path.subpaths[si]!
    if (sp.closed || sp.anchors.length === 0) continue
    const first = sp.anchors[0]!
    const last = sp.anchors[sp.anchors.length - 1]!
    if (near(last, { x, y }, r)) return { subpathIndex: si, end: 'end' }
    if (near(first, { x, y }, r)) return { subpathIndex: si, end: 'start' }
  }
  return null
}

/** Resolve handle position; missing handle coincides with the knot (PS-style). */
export function resolveHandle(
  anchor: PenAnchor,
  which: 'in' | 'out',
): PenPoint {
  const h = which === 'in' ? anchor.in : anchor.out
  return h ?? { x: anchor.x, y: anchor.y }
}

function segmentIsCurve(from: PenAnchor, to: PenAnchor): boolean {
  return Boolean(from.out || to.in)
}

/** Encode path relative to bounds origin for ShapeLayer.pathData. */
export function penPathToSvgData(path: PenPath, offsetX = 0, offsetY = 0): string {
  const parts: string[] = []
  for (const sp of path.subpaths) {
    if (sp.anchors.length === 0) continue
    const [first, ...rest] = sp.anchors
    if (!first) continue
    parts.push(`M ${first.x - offsetX} ${first.y - offsetY}`)
    let prev = first
    for (const anchor of rest) {
      appendSegment(parts, prev, anchor, offsetX, offsetY)
      prev = anchor
    }
    if (sp.closed && sp.anchors.length >= 2) {
      appendSegment(parts, prev, first, offsetX, offsetY)
      parts.push('Z')
    }
  }
  return parts.join(' ')
}

function appendSegment(
  parts: string[],
  from: PenAnchor,
  to: PenAnchor,
  offsetX: number,
  offsetY: number,
): void {
  if (segmentIsCurve(from, to)) {
    const c1 = resolveHandle(from, 'out')
    const c2 = resolveHandle(to, 'in')
    parts.push(
      `C ${c1.x - offsetX} ${c1.y - offsetY} ${c2.x - offsetX} ${c2.y - offsetY} ${to.x - offsetX} ${to.y - offsetY}`,
    )
    return
  }
  parts.push(`L ${to.x - offsetX} ${to.y - offsetY}`)
}

/** Parse editable SVG subset: M/L/H/V/C/Z (absolute + relative). Multiple M → subpaths. */
export function parsePenSvgPath(data: string): PenPath | null {
  const tokens = data.match(/[a-z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi)
  if (!tokens?.length) return null
  const subpaths: PenSubpath[] = []
  let anchors: PenAnchor[] = []
  let index = 0
  let command = ''
  let x = 0
  let y = 0
  let start: PenPoint | null = null
  let closed = false

  const flush = () => {
    if (anchors.length === 0) return
    if (closed && start && near(start, anchors[anchors.length - 1]!, 0.5)) {
      anchors.pop()
    }
    if (anchors.length >= 1) {
      subpaths.push({ anchors, closed })
    }
    anchors = []
    closed = false
    start = null
  }

  const read = () => {
    const token = tokens[index++]
    return token == null ? null : Number(token)
  }

  const pushAnchor = (ax: number, ay: number, inPt?: PenPoint, outPt?: PenPoint) => {
    const anchor: PenAnchor = { x: ax, y: ay }
    if (inPt) anchor.in = inPt
    if (outPt) anchor.out = outPt
    if (inPt && outPt) anchor.linked = true
    anchors.push(anchor)
  }

  while (index < tokens.length) {
    if (/^[a-z]$/i.test(tokens[index]!)) command = tokens[index++]!
    if (!command || !'MmLlHhVvCcZz'.includes(command)) return null
    if (command === 'Z' || command === 'z') {
      closed = true
      flush()
      command = ''
      continue
    }

    const relative = command === command.toLowerCase()
    const upper = command.toUpperCase()

    if (upper === 'H') {
      const a = read()
      if (a == null || !Number.isFinite(a)) return null
      x = relative ? x + a : a
      pushAnchor(x, y)
      continue
    }
    if (upper === 'V') {
      const a = read()
      if (a == null || !Number.isFinite(a)) return null
      y = relative ? y + a : a
      pushAnchor(x, y)
      continue
    }

    if (upper === 'C') {
      const x1 = read()
      const y1 = read()
      const x2 = read()
      const y2 = read()
      const ax = read()
      const ay = read()
      if ([x1, y1, x2, y2, ax, ay].some((v) => v == null || !Number.isFinite(v!))) return null
      const c1x = relative ? x + x1! : x1!
      const c1y = relative ? y + y1! : y1!
      const c2x = relative ? x + x2! : x2!
      const c2y = relative ? y + y2! : y2!
      const nx = relative ? x + ax! : ax!
      const ny = relative ? y + ay! : ay!
      if (anchors.length === 0) {
        pushAnchor(x, y, undefined, { x: c1x, y: c1y })
      } else {
        const prev = anchors[anchors.length - 1]!
        prev.out = { x: c1x, y: c1y }
      }
      pushAnchor(nx, ny, { x: c2x, y: c2y })
      x = nx
      y = ny
      continue
    }

    const a = read()
    const b = read()
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null
    x = relative ? x + a : a
    y = relative ? y + b : b
    if (upper === 'M') {
      flush()
      pushAnchor(x, y)
      start = { x, y }
      command = relative ? 'l' : 'L'
    } else {
      pushAnchor(x, y)
    }
  }

  flush()
  if (subpaths.length === 0 || penPathAnchorCount({ subpaths }) < 1) return null
  // Require at least 2 anchors total for a meaningful path (legacy behavior).
  if (penPathAnchorCount({ subpaths }) < 2) return null
  return { subpaths }
}

export function penPathBounds(path: PenPath): { x: number; y: number; w: number; h: number } {
  const pts = tessellatePenPath(path, 12)
  if (pts.length === 0) {
    return { x: 0, y: 0, w: 1, h: 1 }
  }
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    x,
    y,
    w: Math.max(1, Math.max(...xs) - x),
    h: Math.max(1, Math.max(...ys) - y),
  }
}

function tessellateSubpath(sp: PenSubpath, segmentsPerCurve: number): PenPoint[] {
  if (sp.anchors.length === 0) return []
  const out: PenPoint[] = [{ x: sp.anchors[0]!.x, y: sp.anchors[0]!.y }]
  const count = sp.anchors.length
  const segCount = sp.closed ? count : count - 1
  for (let i = 0; i < segCount; i++) {
    const from = sp.anchors[i]!
    const to = sp.anchors[(i + 1) % count]!
    if (segmentIsCurve(from, to)) {
      const c1 = resolveHandle(from, 'out')
      const c2 = resolveHandle(to, 'in')
      for (let s = 1; s <= segmentsPerCurve; s++) {
        const t = s / segmentsPerCurve
        out.push(cubicAt(from, c1, c2, to, t))
      }
    } else {
      out.push({ x: to.x, y: to.y })
    }
  }
  if (sp.closed && out.length >= 2) {
    const first = out[0]!
    const last = out[out.length - 1]!
    if (Math.hypot(first.x - last.x, first.y - last.y) < EPS) {
      out.pop()
    }
  }
  return out
}

/** Flatten cubics to a polyline for selection, stroke walk, and Pixi `poly`. */
export function tessellatePenPath(path: PenPath, segmentsPerCurve = 16): PenPoint[] {
  const out: PenPoint[] = []
  for (const sp of path.subpaths) {
    out.push(...tessellateSubpath(sp, segmentsPerCurve))
  }
  return out
}

export function tessellatePenSubpath(
  path: PenPath,
  subpathIndex: number,
  segmentsPerCurve = 16,
): PenPoint[] {
  return tessellateSubpath(getSubpath(path, subpathIndex), segmentsPerCurve)
}

function cubicAt(p0: PenPoint, p1: PenPoint, p2: PenPoint, p3: PenPoint, t: number): PenPoint {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  }
}

/** De Casteljau split of cubic at t ∈ (0,1). */
export function splitCubicAt(
  p0: PenPoint,
  p1: PenPoint,
  p2: PenPoint,
  p3: PenPoint,
  t: number,
): { left: [PenPoint, PenPoint, PenPoint, PenPoint]; right: [PenPoint, PenPoint, PenPoint, PenPoint] } {
  const lerp = (a: PenPoint, b: PenPoint) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  })
  const p01 = lerp(p0, p1)
  const p12 = lerp(p1, p2)
  const p23 = lerp(p2, p3)
  const p012 = lerp(p01, p12)
  const p123 = lerp(p12, p23)
  const p0123 = lerp(p012, p123)
  return {
    left: [p0, p01, p012, p0123],
    right: [p0123, p123, p23, p3],
  }
}

/** Sample points along the path centerline at roughly `spacingPx` intervals (document px). */
export function samplePenPath(path: PenPath, spacingPx: number): PenPoint[] {
  return path.subpaths.flatMap((_, index) => samplePenSubpath(path, index, spacingPx))
}

/** Sample one contour. Callers that paint must keep contours separate. */
export function samplePenSubpath(
  path: PenPath,
  subpathIndex: number,
  spacingPx: number,
): PenPoint[] {
  const poly = tessellatePenSubpath(path, subpathIndex, 16)
  if (poly.length < 2) return poly
  const spacing = Math.max(0.5, spacingPx)
  const samples: PenPoint[] = [{ ...poly[0]! }]
  let residual = 0
  for (let i = 0; i < poly.length - 1; i++) {
    const from = poly[i]!
    const to = poly[i + 1]!
    let x = from.x
    let y = from.y
    const dx = to.x - x
    const dy = to.y - y
    let distance = Math.hypot(dx, dy)
    if (distance < EPS) continue
    const ux = dx / distance
    const uy = dy / distance
    while (residual + distance >= spacing) {
      const step = spacing - residual
      x += ux * step
      y += uy * step
      distance -= step
      residual = 0
      samples.push({ x, y })
    }
    residual += distance
  }
  const last = poly[poly.length - 1]!
  const tail = samples[samples.length - 1]!
  if (Math.hypot(tail.x - last.x, tail.y - last.y) > EPS) {
    samples.push(last)
  }
  return samples
}

export type PenHit =
  | { kind: 'anchor'; subpathIndex: number; index: number }
  | { kind: 'in'; subpathIndex: number; index: number }
  | { kind: 'out'; subpathIndex: number; index: number }
  | { kind: 'segment'; subpathIndex: number; segmentIndex: number; t: number; point: PenPoint }

const ANCHOR_HIT = 7
const HANDLE_HIT = 6
const SEGMENT_HIT = 5

export function hitTestPenPath(
  path: PenPath,
  x: number,
  y: number,
  zoom: number,
  options?: { includeSegments?: boolean },
): PenHit | null {
  const scale = Math.max(0.25, zoom)
  const anchorR = ANCHOR_HIT / scale
  const handleR = HANDLE_HIT / scale

  for (let si = path.subpaths.length - 1; si >= 0; si--) {
    const sp = path.subpaths[si]!
    for (let i = sp.anchors.length - 1; i >= 0; i--) {
      const anchor = sp.anchors[i]!
      if (anchor.in && Math.hypot(x - anchor.in.x, y - anchor.in.y) <= handleR) {
        return { kind: 'in', subpathIndex: si, index: i }
      }
      if (anchor.out && Math.hypot(x - anchor.out.x, y - anchor.out.y) <= handleR) {
        return { kind: 'out', subpathIndex: si, index: i }
      }
      if (Math.hypot(x - anchor.x, y - anchor.y) <= anchorR) {
        return { kind: 'anchor', subpathIndex: si, index: i }
      }
    }
  }

  if (options?.includeSegments) {
    const segHit = hitTestPenSegment(path, x, y, zoom)
    if (segHit) return segHit
  }
  return null
}

export function hitTestPenSegment(
  path: PenPath,
  x: number,
  y: number,
  zoom: number,
): Extract<PenHit, { kind: 'segment' }> | null {
  const scale = Math.max(0.25, zoom)
  const maxDist = SEGMENT_HIT / scale
  let best: Extract<PenHit, { kind: 'segment' }> | null = null
  let bestDist = maxDist

  for (let si = 0; si < path.subpaths.length; si++) {
    const sp = path.subpaths[si]!
    const count = sp.anchors.length
    const segCount = sp.closed ? count : count - 1
    for (let i = 0; i < segCount; i++) {
      const from = sp.anchors[i]!
      const to = sp.anchors[(i + 1) % count]!
      const samples = segmentIsCurve(from, to)
        ? Array.from({ length: 17 }, (_, s) => {
            const t = s / 16
            return {
              t,
              p: cubicAt(from, resolveHandle(from, 'out'), resolveHandle(to, 'in'), to, t),
            }
          })
        : [
            { t: 0, p: { x: from.x, y: from.y } },
            { t: 1, p: { x: to.x, y: to.y } },
          ]
      for (let s = 0; s < samples.length - 1; s++) {
        const a = samples[s]!
        const b = samples[s + 1]!
        const closest = closestOnSegment(a.p, b.p, { x, y })
        const d = Math.hypot(x - closest.point.x, y - closest.point.y)
        if (d < bestDist) {
          bestDist = d
          const t = a.t + (b.t - a.t) * closest.t
          best = {
            kind: 'segment',
            subpathIndex: si,
            segmentIndex: i,
            t,
            point: closest.point,
          }
        }
      }
    }
  }
  return best
}

function closestOnSegment(
  a: PenPoint,
  b: PenPoint,
  p: PenPoint,
): { point: PenPoint; t: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < EPS) return { point: { ...a }, t: 0 }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return { point: { x: a.x + dx * t, y: a.y + dy * t }, t }
}

export function isHandleLinked(anchor: PenAnchor): boolean {
  if (anchor.linked === false) return false
  if (anchor.linked === true) return true
  return Boolean(anchor.in && anchor.out)
}

/** Dragging a handle mirrors the opposite handle for smooth (linked) points. */
export function mirrorHandle(anchor: PenAnchor, handle: 'in' | 'out', pos: PenPoint): PenAnchor {
  const next: PenAnchor = { ...anchor, [handle]: pos, linked: true }
  const other = handle === 'in' ? 'out' : 'in'
  next[other] = {
    x: anchor.x + (anchor.x - pos.x),
    y: anchor.y + (anchor.y - pos.y),
  }
  return next
}

/** Move one handle without mirroring (cusp / unlinked). */
export function setHandleUnlinked(
  anchor: PenAnchor,
  handle: 'in' | 'out',
  pos: PenPoint,
): PenAnchor {
  return { ...anchor, [handle]: pos, linked: false }
}

export function addCornerAnchor(
  path: PenPath,
  x: number,
  y: number,
  subpathIndex = 0,
): PenPath {
  return updateSubpath(path, subpathIndex, (sp) => ({
    ...sp,
    anchors: [...sp.anchors, { x, y }],
  }))
}

export function addSmoothAnchor(
  path: PenPath,
  x: number,
  y: number,
  out: PenPoint,
  subpathIndex = 0,
  linked = true,
): PenPath {
  const inPt = {
    x: x + (x - out.x),
    y: y + (y - out.y),
  }
  const anchor: PenAnchor = linked
    ? { x, y, in: inPt, out, linked: true }
    : { x, y, out, linked: false }
  return updateSubpath(path, subpathIndex, (sp) => ({
    ...sp,
    anchors: [...sp.anchors, anchor],
  }))
}

export function addCuspAnchor(
  path: PenPath,
  x: number,
  y: number,
  out: PenPoint,
  subpathIndex = 0,
): PenPath {
  return addSmoothAnchor(path, x, y, out, subpathIndex, false)
}

export function closePenPath(path: PenPath, subpathIndex = 0): PenPath {
  return updateSubpath(path, subpathIndex, (sp) => {
    if (sp.anchors.length < 3) return { ...sp, closed: false }
    return { ...sp, closed: true }
  })
}

/** After closing a subpath, append a new empty open subpath for continued drawing. */
export function startNewSubpath(path: PenPath): PenPath {
  return { ...path, subpaths: [...path.subpaths, emptySubpath()] }
}

/** Remove the last placed anchor from an in-progress draft (active open subpath). */
export function popLastPenAnchor(path: PenPath, subpathIndex?: number): PenPath | null {
  const si =
    subpathIndex ??
    (() => {
      for (let i = path.subpaths.length - 1; i >= 0; i--) {
        if (path.subpaths[i]!.anchors.length > 0) return i
      }
      return 0
    })()
  const sp = getSubpath(path, si)
  if (sp.anchors.length === 0) return null
  const anchors = sp.anchors.slice(0, -1)
  if (anchors.length === 0) {
    if (path.subpaths.length <= 1) return null
    const subpaths = path.subpaths.filter((_, i) => i !== si)
    return { ...path, subpaths: subpaths.length ? subpaths : [emptySubpath()] }
  }
  return setSubpath(path, si, { ...sp, anchors })
}

export function convertToCorner(anchor: PenAnchor): PenAnchor {
  return { x: anchor.x, y: anchor.y }
}

export function convertToSmooth(anchor: PenAnchor, out: PenPoint): PenAnchor {
  return {
    x: anchor.x,
    y: anchor.y,
    out,
    in: { x: anchor.x + (anchor.x - out.x), y: anchor.y + (anchor.y - out.y) },
    linked: true,
  }
}

export function removeAnchor(
  path: PenPath,
  subpathIndex: number,
  anchorIndex: number,
): PenPath | null {
  const sp = getSubpath(path, subpathIndex)
  if (sp.anchors.length <= 2) {
    // Removing would leave too few points — drop the subpath if others remain.
    if (path.subpaths.length <= 1) return null
    const subpaths = path.subpaths.filter((_, i) => i !== subpathIndex)
    return { ...path, subpaths }
  }
  const anchors = sp.anchors.filter((_, i) => i !== anchorIndex)
  return setSubpath(path, subpathIndex, { ...sp, anchors })
}

/** Insert an anchor on a segment via cubic split at parameter t. */
export function insertAnchorOnSegment(
  path: PenPath,
  subpathIndex: number,
  segmentIndex: number,
  t: number,
): PenPath {
  const sp = getSubpath(path, subpathIndex)
  const count = sp.anchors.length
  const from = sp.anchors[segmentIndex]!
  const to = sp.anchors[(segmentIndex + 1) % count]!
  const clampedT = Math.max(0.02, Math.min(0.98, t))

  if (!segmentIsCurve(from, to)) {
    const point = {
      x: from.x + (to.x - from.x) * clampedT,
      y: from.y + (to.y - from.y) * clampedT,
    }
    const anchors = [...sp.anchors]
    anchors.splice(segmentIndex + 1, 0, point)
    return setSubpath(path, subpathIndex, { ...sp, anchors })
  }

  const c1 = resolveHandle(from, 'out')
  const c2 = resolveHandle(to, 'in')
  const { left, right } = splitCubicAt(from, c1, c2, to, clampedT)
  const newAnchor: PenAnchor = {
    x: left[3]!.x,
    y: left[3]!.y,
    in: left[2],
    out: right[1],
    linked: true,
  }
  const nextFrom: PenAnchor = {
    ...from,
    out: left[1],
  }
  const nextTo: PenAnchor = {
    ...to,
    in: right[2],
  }
  const anchors = [...sp.anchors]
  anchors[segmentIndex] = nextFrom
  if (sp.closed && segmentIndex === count - 1) {
    anchors[0] = nextTo
    anchors.push(newAnchor)
  } else {
    anchors[(segmentIndex + 1) % count] = nextTo
    anchors.splice(segmentIndex + 1, 0, newAnchor)
  }
  return setSubpath(path, subpathIndex, { ...sp, anchors })
}

/** Reverse an open subpath so drawing continues from the opposite end. */
export function reverseSubpath(path: PenPath, subpathIndex: number): PenPath {
  return updateSubpath(path, subpathIndex, (sp) => ({
    ...sp,
    anchors: [...sp.anchors].reverse().map((a) => {
      const next: PenAnchor = { x: a.x, y: a.y, linked: a.linked }
      if (a.in) next.out = a.in
      if (a.out) next.in = a.out
      return next
    }),
  }))
}

const FREEFORM_SAMPLE_PX = 4

/** Sample a freehand stroke into corner anchors at roughly `spacingPx` intervals. */
export function buildFreeformPenPath(
  points: readonly PenPoint[],
  spacingPx = FREEFORM_SAMPLE_PX,
): PenPath {
  if (points.length === 0) return emptyPenPath()
  const spacing = Math.max(1, spacingPx)
  const anchors: PenAnchor[] = [{ x: points[0]!.x, y: points[0]!.y }]
  for (let i = 1; i < points.length; i++) {
    const pt = points[i]!
    const last = anchors[anchors.length - 1]!
    if (Math.hypot(pt.x - last.x, pt.y - last.y) >= spacing) {
      anchors.push({ x: pt.x, y: pt.y })
    }
  }
  const tail = points[points.length - 1]!
  const lastAnchor = anchors[anchors.length - 1]!
  if (Math.hypot(tail.x - lastAnchor.x, tail.y - lastAnchor.y) >= 1) {
    anchors.push({ x: tail.x, y: tail.y })
  }
  return { subpaths: [{ anchors, closed: false }] }
}

/** Clone path deeply enough for gesture start snapshots. */
export function clonePenPath(path: PenPath): PenPath {
  return {
    fillRule: path.fillRule,
    subpaths: path.subpaths.map((sp) => ({
      closed: sp.closed,
      anchors: sp.anchors.map((a) => ({
        ...a,
        in: a.in ? { ...a.in } : undefined,
        out: a.out ? { ...a.out } : undefined,
      })),
    })),
  }
}
