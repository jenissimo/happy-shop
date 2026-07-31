/**
 * Pen / work-path geometry (SPECS/PEN-TOOL.md).
 * Stored on ShapeLayer as `svg-path` pathData with M/L/C/Z commands.
 */

export type PenPoint = { x: number; y: number }

/** Absolute document-space anchor with optional cubic handles. */
export type PenAnchor = PenPoint & {
  in?: PenPoint
  out?: PenPoint
}

export type PenPath = {
  anchors: PenAnchor[]
  closed: boolean
}

const CLOSE_DIST_PX = 8
const EPS = 1e-6

export function emptyPenPath(): PenPath {
  return { anchors: [], closed: false }
}

export function penPathIsEmpty(path: PenPath | null | undefined): boolean {
  return !path || path.anchors.length === 0
}

/** True when the path has enough geometry to fill or select. */
export function penPathIsFillable(path: PenPath): boolean {
  return path.closed && path.anchors.length >= 3
}

export function penPathIsStrokable(path: PenPath): boolean {
  return path.anchors.length >= 2 || (path.closed && path.anchors.length >= 2)
}

function near(a: PenPoint, b: PenPoint, dist = CLOSE_DIST_PX): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= dist
}

export function penPathCanClose(path: PenPath, x: number, y: number): boolean {
  const first = path.anchors[0]
  return Boolean(first && path.anchors.length >= 3 && near(first, { x, y }))
}

/** Encode path relative to bounds origin for ShapeLayer.pathData. */
export function penPathToSvgData(path: PenPath, offsetX = 0, offsetY = 0): string {
  const [first, ...rest] = path.anchors
  if (!first) return ''
  const parts: string[] = [
    `M ${first.x - offsetX} ${first.y - offsetY}`,
  ]
  let prev = first
  for (const anchor of rest) {
    appendSegment(parts, prev, anchor, offsetX, offsetY)
    prev = anchor
  }
  if (path.closed && path.anchors.length >= 2) {
    appendSegment(parts, prev, first, offsetX, offsetY)
    parts.push('Z')
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
  const hasCurve = from.out && to.in
  if (hasCurve) {
    parts.push(
      `C ${from.out!.x - offsetX} ${from.out!.y - offsetY} ${to.in!.x - offsetX} ${to.in!.y - offsetY} ${to.x - offsetX} ${to.y - offsetY}`,
    )
    return
  }
  parts.push(`L ${to.x - offsetX} ${to.y - offsetY}`)
}

/** Parse editable SVG subset: M/L/H/V/C/Z (absolute + relative). */
export function parsePenSvgPath(data: string): PenPath | null {
  const tokens = data.match(/[a-z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi)
  if (!tokens?.length) return null
  const anchors: PenAnchor[] = []
  let index = 0
  let command = ''
  let x = 0
  let y = 0
  let start: PenPoint | null = null
  let closed = false

  const read = () => {
    const token = tokens[index++]
    return token == null ? null : Number(token)
  }

  const pushAnchor = (ax: number, ay: number, inPt?: PenPoint, outPt?: PenPoint) => {
    const anchor: PenAnchor = { x: ax, y: ay }
    if (inPt) anchor.in = inPt
    if (outPt) anchor.out = outPt
    anchors.push(anchor)
  }

  while (index < tokens.length) {
    if (/^[a-z]$/i.test(tokens[index]!)) command = tokens[index++]!
    if (!command || !'MmLlHhVvCcZz'.includes(command)) return null
    if (command === 'Z' || command === 'z') {
      closed = true
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
      if (command === 'M' || command === 'm') command = relative ? 'l' : 'L'
      continue
    }

    const a = read()
    const b = read()
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null
    x = relative ? x + a : a
    y = relative ? y + b : b
    if (upper === 'M') {
      pushAnchor(x, y)
      start = { x, y }
      command = relative ? 'l' : 'L'
    } else {
      pushAnchor(x, y)
    }
  }

  if (anchors.length < 2) return null
  if (closed && start && near(start, anchors[anchors.length - 1]!, 0.5)) {
    anchors.pop()
  }
  return { anchors, closed }
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

/** Flatten cubics to a polyline for selection, stroke walk, and Pixi `poly`. */
export function tessellatePenPath(path: PenPath, segmentsPerCurve = 16): PenPoint[] {
  if (path.anchors.length === 0) return []
  const out: PenPoint[] = [{ x: path.anchors[0]!.x, y: path.anchors[0]!.y }]
  const count = path.anchors.length
  const segCount = path.closed ? count : count - 1
  for (let i = 0; i < segCount; i++) {
    const from = path.anchors[i]!
    const to = path.anchors[(i + 1) % count]!
    if (from.out && to.in) {
      for (let s = 1; s <= segmentsPerCurve; s++) {
        const t = s / segmentsPerCurve
        out.push(cubicAt(from, from.out, to.in, to, t))
      }
    } else {
      out.push({ x: to.x, y: to.y })
    }
  }
  if (path.closed && out.length >= 2) {
    const first = out[0]!
    const last = out[out.length - 1]!
    if (Math.hypot(first.x - last.x, first.y - last.y) < EPS) {
      out.pop()
    }
  }
  return out
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

/** Sample points along the path centerline at roughly `spacingPx` intervals (document px). */
export function samplePenPath(path: PenPath, spacingPx: number): PenPoint[] {
  const poly = tessellatePenPath(path, 16)
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
  | { kind: 'anchor'; index: number }
  | { kind: 'in'; index: number }
  | { kind: 'out'; index: number }

const ANCHOR_HIT = 7
const HANDLE_HIT = 6

export function hitTestPenPath(
  path: PenPath,
  x: number,
  y: number,
  zoom: number,
): PenHit | null {
  const scale = Math.max(0.25, zoom)
  const anchorR = ANCHOR_HIT / scale
  const handleR = HANDLE_HIT / scale
  for (let i = path.anchors.length - 1; i >= 0; i--) {
    const anchor = path.anchors[i]!
    if (anchor.in && Math.hypot(x - anchor.in.x, y - anchor.in.y) <= handleR) {
      return { kind: 'in', index: i }
    }
    if (anchor.out && Math.hypot(x - anchor.out.x, y - anchor.out.y) <= handleR) {
      return { kind: 'out', index: i }
    }
    if (Math.hypot(x - anchor.x, y - anchor.y) <= anchorR) {
      return { kind: 'anchor', index: i }
    }
  }
  return null
}

/** Dragging a handle mirrors the opposite handle for smooth points. */
export function mirrorHandle(anchor: PenAnchor, handle: 'in' | 'out', pos: PenPoint): PenAnchor {
  const next = { ...anchor, [handle]: pos } as PenAnchor
  const other = handle === 'in' ? 'out' : 'in'
  next[other] = {
    x: anchor.x + (anchor.x - pos.x),
    y: anchor.y + (anchor.y - pos.y),
  }
  return next
}

export function addCornerAnchor(path: PenPath, x: number, y: number): PenPath {
  return {
    ...path,
    anchors: [...path.anchors, { x, y }],
  }
}

export function addSmoothAnchor(
  path: PenPath,
  x: number,
  y: number,
  out: PenPoint,
): PenPath {
  const inPt = {
    x: x + (x - out.x),
    y: y + (y - out.y),
  }
  return {
    ...path,
    anchors: [...path.anchors, { x, y, in: inPt, out }],
  }
}

export function closePenPath(path: PenPath): PenPath {
  if (path.anchors.length < 3) return { ...path, closed: false }
  return { ...path, closed: true }
}

/** Remove the last placed anchor from an in-progress draft. */
export function popLastPenAnchor(path: PenPath): PenPath | null {
  if (path.anchors.length === 0) return null
  const anchors = path.anchors.slice(0, -1)
  if (anchors.length === 0) return null
  return { ...path, anchors }
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
  return { anchors, closed: false }
}
