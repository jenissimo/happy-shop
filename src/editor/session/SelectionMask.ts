export type SelectionRect = {
  x: number
  y: number
  width: number
  height: number
}

export type SelectionCombineMode = 'new' | 'add' | 'subtract' | 'intersect'

export type SelectionPoint = { x: number; y: number }

export type SelectionRasterizeOptions = {
  antiAlias?: boolean
}

export type SelectionAffineTransform = {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotationDeg: number
  skewXDeg: number
  skewYDeg: number
  pivotX: number
  pivotY: number
}

export type SelectionOutline = {
  /** Closed rectangles to stroke with marching ants (document space). */
  rects: SelectionRect[]
  /** Ellipse AABBs (axis-aligned) to stroke as ellipses. */
  ellipses: SelectionRect[]
  /** Open or closed polylines (lasso preview / polygon). */
  paths: SelectionPoint[][]
  /**
   * When true, `rects` are holes inside the canvas — also stroke the canvas
   * border (inverse of a rect selection).
   */
  inverted: boolean
}

/**
 * Document-space selection mask (A8). Rect/ellipse stay compact until
 * inverse / combine / non-compact ops materialize a full buffer.
 */
export class SelectionMask {
  readonly width: number
  readonly height: number
  /** Packed coverage 0..255; null until materialized. */
  private data: Uint8Array | null = null
  /** Compact rect when selection is a single axis-aligned rectangle. */
  private rect: SelectionRect | null = null
  /** Compact ellipse AABB (filled ellipse inside). */
  private ellipse: SelectionRect | null = null
  /** True when the selection is the complement of `rect` within the canvas. */
  private inverted = false

  private constructor(width: number, height: number) {
    this.width = Math.max(1, Math.floor(width))
    this.height = Math.max(1, Math.floor(height))
  }

  static empty(width: number, height: number): SelectionMask {
    return new SelectionMask(width, height)
  }

  static fromRect(
    canvasWidth: number,
    canvasHeight: number,
    rect: SelectionRect,
    options: SelectionRasterizeOptions = {},
  ): SelectionMask {
    const mask = new SelectionMask(canvasWidth, canvasHeight)
    const r = normalizeRect(rect, mask.width, mask.height)
    if (r.width < 1 || r.height < 1) return mask
    if (options.antiAlias) {
      mask.data = rasterizeCoverage(mask.width, mask.height, rect, (x, y) =>
        rectCoverage(x, y, rect),
      )
      return mask
    }
    mask.rect = r
    mask.inverted = false
    return mask
  }

  static fromEllipse(
    canvasWidth: number,
    canvasHeight: number,
    bounds: SelectionRect,
    options: SelectionRasterizeOptions = {},
  ): SelectionMask {
    const mask = new SelectionMask(canvasWidth, canvasHeight)
    const r = normalizeRect(bounds, mask.width, mask.height)
    if (r.width < 1 || r.height < 1) return mask
    if (options.antiAlias) {
      mask.data = rasterizeCoverage(mask.width, mask.height, bounds, (x, y) =>
        pointInEllipse(x, y, bounds),
      )
      return mask
    }
    mask.ellipse = r
    return mask
  }

  static fromPolygon(
    canvasWidth: number,
    canvasHeight: number,
    points: ReadonlyArray<SelectionPoint>,
    options: SelectionRasterizeOptions = {},
  ): SelectionMask {
    const mask = new SelectionMask(canvasWidth, canvasHeight)
    if (points.length < 3) return mask
    const data = new Uint8Array(mask.width * mask.height)
    if (options.antiAlias) {
      const bounds = polygonBounds(points)
      data.set(rasterizeCoverage(mask.width, mask.height, bounds, (x, y) =>
        pointInPolygon(x, y, points),
      ))
    } else {
      fillPolygon(data, mask.width, mask.height, points)
    }
    mask.data = data
    return mask
  }

  /** Build from an A8 buffer (copied). Size must match canvas. */
  static fromData(
    canvasWidth: number,
    canvasHeight: number,
    data: Uint8Array,
  ): SelectionMask {
    const mask = new SelectionMask(canvasWidth, canvasHeight)
    if (data.length !== mask.width * mask.height) {
      throw new Error('SelectionMask.fromData size mismatch')
    }
    mask.data = data.slice()
    return mask
  }

  clone(): SelectionMask {
    const next = new SelectionMask(this.width, this.height)
    next.rect = this.rect ? { ...this.rect } : null
    next.ellipse = this.ellipse ? { ...this.ellipse } : null
    next.inverted = this.inverted
    next.data = this.data ? this.data.slice() : null
    return next
  }

  isEmpty(): boolean {
    if (this.data) {
      for (let i = 0; i < this.data.length; i++) {
        if (this.data[i]! > 0) return false
      }
      return true
    }
    if (this.ellipse) {
      return this.ellipse.width < 1 || this.ellipse.height < 1
    }
    if (!this.rect) return true
    if (this.inverted) {
      // Inverse of a proper sub-rect covers canvas; inverse of full canvas is empty.
      return (
        this.rect.x <= 0 &&
        this.rect.y <= 0 &&
        this.rect.x + this.rect.width >= this.width &&
        this.rect.y + this.rect.height >= this.height
      )
    }
    return this.rect.width < 1 || this.rect.height < 1
  }

  /** Axis-aligned bounds of selected pixels, or null if empty. */
  bounds(): SelectionRect | null {
    if (this.isEmpty()) return null
    if (this.data) return boundsOfData(this.data, this.width, this.height)
    if (this.ellipse) return { ...this.ellipse }
    if (!this.rect) return null
    if (!this.inverted) return { ...this.rect }
    // Inverse of an interior rect → full canvas.
    return { x: 0, y: 0, width: this.width, height: this.height }
  }

  /**
   * Coverage at document pixel (integer sample). 0 = outside, 255 = inside.
   */
  sample(x: number, y: number): number {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return 0
    if (this.data) return this.data[iy * this.width + ix]!
    if (this.ellipse) {
      return pointInEllipse(ix + 0.5, iy + 0.5, this.ellipse) ? 255 : 0
    }
    if (!this.rect) return 0
    const inside =
      ix >= this.rect.x &&
      iy >= this.rect.y &&
      ix < this.rect.x + this.rect.width &&
      iy < this.rect.y + this.rect.height
    if (this.inverted) return inside ? 0 : 255
    return inside ? 255 : 0
  }

  contains(x: number, y: number): boolean {
    return this.sample(x, y) > 0
  }

  /** Invert selection within canvas bounds (canvas − current). */
  inverse(): SelectionMask {
    const next = this.clone()
    if (next.ellipse) {
      next.materialize()
    }
    if (next.data) {
      for (let i = 0; i < next.data.length; i++) {
        next.data[i] = (255 - next.data[i]!) as number
      }
      next.rect = null
      next.ellipse = null
      next.inverted = false
      return next
    }
    if (!next.rect) {
      // Empty → select all.
      next.rect = { x: 0, y: 0, width: next.width, height: next.height }
      next.inverted = false
      return next
    }
    next.inverted = !next.inverted
    return next
  }

  /**
   * Combine `incoming` into this mask. Dimensions must match.
   * `new` returns a clone of incoming (ignores this).
   */
  combine(
    incoming: SelectionMask,
    mode: SelectionCombineMode,
  ): SelectionMask {
    if (incoming.width !== this.width || incoming.height !== this.height) {
      throw new Error('SelectionMask.combine size mismatch')
    }
    if (mode === 'new') return incoming.clone()

    const a = this.clone()
    a.materialize()
    const b = incoming.clone()
    b.materialize()
    const out = new SelectionMask(this.width, this.height)
    const data = new Uint8Array(this.width * this.height)
    const ad = a.data!
    const bd = b.data!
    for (let i = 0; i < data.length; i++) {
      const av = ad[i]!
      const bv = bd[i]!
      if (mode === 'add') data[i] = Math.max(av, bv)
      else if (mode === 'subtract') data[i] = Math.round((av * (255 - bv)) / 255)
      else data[i] = Math.min(av, bv) // intersect
    }
    out.data = data
    return out
  }

  /** Outline for marching-ants overlay. */
  outline(): SelectionOutline | null {
    if (this.isEmpty()) return null
    if (this.data) {
      const b = this.bounds()
      if (!b) return null
      // Arbitrary masks: bounds stroke (true contours are expensive).
      return { rects: [b], ellipses: [], paths: [], inverted: false }
    }
    if (this.ellipse) {
      return {
        rects: [],
        ellipses: [{ ...this.ellipse }],
        paths: [],
        inverted: false,
      }
    }
    if (!this.rect) return null
    if (this.inverted) {
      return {
        rects: [{ ...this.rect }],
        ellipses: [],
        paths: [],
        inverted: true,
      }
    }
    return {
      rects: [{ ...this.rect }],
      ellipses: [],
      paths: [],
      inverted: false,
    }
  }

  /** Ensure A8 buffer exists. */
  materialize(): Uint8Array {
    if (this.data) return this.data
    const data = new Uint8Array(this.width * this.height)
    if (this.ellipse) {
      fillEllipse(data, this.width, this.height, this.ellipse)
    } else if (this.rect) {
      if (this.inverted) data.fill(255)
      const r = this.rect
      const value = this.inverted ? 0 : 255
      for (let y = r.y; y < r.y + r.height; y++) {
        const row = y * this.width
        for (let x = r.x; x < r.x + r.width; x++) {
          data[row + x] = value
        }
      }
    }
    this.data = data
    this.rect = null
    this.ellipse = null
    this.inverted = false
    return data
  }

  /** Apply a soft, symmetric edge to the A8 mask without changing its canvas. */
  feather(radius: number): SelectionMask {
    const amount = Math.max(0, Math.min(250, Number.isFinite(radius) ? radius : 0))
    if (amount === 0 || this.isEmpty()) return this.clone()
    const source = this.clone().materialize()
    const blurred = blurA8(source, this.width, this.height, Math.max(1, Math.ceil(amount)))
    return SelectionMask.fromData(this.width, this.height, blurred)
  }

  /**
   * Affinely resample this mask into document space. The source remains
   * unchanged so an interactive transform can always resample from its
   * original pixels instead of accumulating interpolation loss.
   */
  affineTransform(transform: SelectionAffineTransform): SelectionMask {
    const source = this.clone().materialize()
    const out = new Uint8Array(this.width * this.height)
    for (let y = 0; y < this.height; y++) {
      const row = y * this.width
      for (let x = 0; x < this.width; x++) {
        const local = documentToMaskLocal(x + 0.5, y + 0.5, transform)
        out[row + x] = bilinearSample(source, this.width, this.height, local.x - 0.5, local.y - 0.5)
      }
    }
    return SelectionMask.fromData(this.width, this.height, out)
  }

  /**
   * Projective resample: map `destQuad` back through `sourceQuad`, then through
   * the inverse affine `transform` into this mask. Used for perspective handles.
   */
  resampleAffineProjective(
    transform: SelectionAffineTransform,
    sourceQuad: SelectionPoint[],
    destQuad: SelectionPoint[],
  ): SelectionMask {
    if (sourceQuad.length !== 4 || destQuad.length !== 4) {
      return this.affineTransform(transform)
    }
    const invH = invertHomography(computeHomography(sourceQuad, destQuad))
    if (!invH) return this.affineTransform(transform)
    const source = this.clone().materialize()
    const out = new Uint8Array(this.width * this.height)
    for (let y = 0; y < this.height; y++) {
      const row = y * this.width
      for (let x = 0; x < this.width; x++) {
        const pre = applyHomography(invH, x + 0.5, y + 0.5)
        const local = documentToMaskLocal(pre.x, pre.y, transform)
        out[row + x] = bilinearSample(source, this.width, this.height, local.x - 0.5, local.y - 0.5)
      }
    }
    return SelectionMask.fromData(this.width, this.height, out)
  }
}

export function normalizeRect(
  rect: SelectionRect,
  canvasWidth: number,
  canvasHeight: number,
): SelectionRect {
  const x0 = Math.max(0, Math.min(canvasWidth, Math.floor(rect.x)))
  const y0 = Math.max(0, Math.min(canvasHeight, Math.floor(rect.y)))
  const x1 = Math.max(
    x0,
    Math.min(canvasWidth, Math.ceil(rect.x + rect.width)),
  )
  const y1 = Math.max(
    y0,
    Math.min(canvasHeight, Math.ceil(rect.y + rect.height)),
  )
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

function pointInEllipse(px: number, py: number, bounds: SelectionRect): boolean {
  const rx = bounds.width / 2
  const ry = bounds.height / 2
  if (rx < 0.5 || ry < 0.5) return false
  const cx = bounds.x + rx
  const cy = bounds.y + ry
  const nx = (px - cx) / rx
  const ny = (py - cy) / ry
  return nx * nx + ny * ny <= 1
}

function rectCoverage(px: number, py: number, bounds: SelectionRect): boolean {
  return (
    px >= bounds.x &&
    py >= bounds.y &&
    px <= bounds.x + bounds.width &&
    py <= bounds.y + bounds.height
  )
}

const AA_SAMPLES = [0.125, 0.375, 0.625, 0.875]

/** Supersample a geometric predicate into an A8 mask. */
function rasterizeCoverage(
  width: number,
  height: number,
  bounds: SelectionRect,
  contains: (x: number, y: number) => boolean,
): Uint8Array {
  const data = new Uint8Array(width * height)
  const x0 = Math.max(0, Math.floor(bounds.x))
  const y0 = Math.max(0, Math.floor(bounds.y))
  const x1 = Math.min(width, Math.ceil(bounds.x + bounds.width))
  const y1 = Math.min(height, Math.ceil(bounds.y + bounds.height))
  for (let y = y0; y < y1; y++) {
    const row = y * width
    for (let x = x0; x < x1; x++) {
      let covered = 0
      for (const sy of AA_SAMPLES) {
        for (const sx of AA_SAMPLES) {
          if (contains(x + sx, y + sy)) covered++
        }
      }
      data[row + x] = Math.round((covered * 255) / (AA_SAMPLES.length ** 2))
    }
  }
  return data
}

function fillEllipse(
  data: Uint8Array,
  width: number,
  height: number,
  bounds: SelectionRect,
): void {
  const x0 = Math.max(0, bounds.x)
  const y0 = Math.max(0, bounds.y)
  const x1 = Math.min(width, bounds.x + bounds.width)
  const y1 = Math.min(height, bounds.y + bounds.height)
  for (let y = y0; y < y1; y++) {
    const row = y * width
    for (let x = x0; x < x1; x++) {
      if (pointInEllipse(x + 0.5, y + 0.5, bounds)) data[row + x] = 255
    }
  }
}

/** Even-odd scanline fill for a closed polygon (document pixels). */
function fillPolygon(
  data: Uint8Array,
  width: number,
  height: number,
  points: ReadonlyArray<SelectionPoint>,
): void {
  let minY = height
  let maxY = -1
  for (const p of points) {
    const y = Math.floor(p.y)
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  minY = Math.max(0, minY)
  maxY = Math.min(height - 1, maxY)
  if (maxY < minY) return

  const n = points.length
  for (let y = minY; y <= maxY; y++) {
    const scanY = y + 0.5
    const xs: number[] = []
    for (let i = 0; i < n; i++) {
      const a = points[i]!
      const b = points[(i + 1) % n]!
      const y0 = a.y
      const y1 = b.y
      if (y0 === y1) continue
      const ymin = Math.min(y0, y1)
      const ymax = Math.max(y0, y1)
      if (scanY < ymin || scanY >= ymax) continue
      const t = (scanY - y0) / (y1 - y0)
      xs.push(a.x + t * (b.x - a.x))
    }
    xs.sort((u, v) => u - v)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      let x0 = Math.ceil(xs[k]!)
      let x1 = Math.floor(xs[k + 1]!)
      if (x0 < 0) x0 = 0
      if (x1 >= width) x1 = width - 1
      const row = y * width
      for (let x = x0; x <= x1; x++) data[row + x] = 255
    }
  }
}

function polygonBounds(points: ReadonlyArray<SelectionPoint>): SelectionRect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function pointInPolygon(
  px: number,
  py: number,
  points: ReadonlyArray<SelectionPoint>,
): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!
    const b = points[j]!
    if (
      (a.y > py) !== (b.y > py) &&
      px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

/** Separable box blur using running sums, preserving transparent canvas edges. */
function blurA8(
  source: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  const horizontal = new Uint8Array(source.length)
  const output = new Uint8Array(source.length)
  const diameter = radius * 2 + 1
  for (let y = 0; y < height; y++) {
    let sum = 0
    for (let x = -radius; x <= radius; x++) {
      if (x >= 0 && x < width) sum += source[y * width + x]!
    }
    for (let x = 0; x < width; x++) {
      horizontal[y * width + x] = Math.round(sum / diameter)
      const remove = x - radius
      const add = x + radius + 1
      if (remove >= 0) sum -= source[y * width + remove]!
      if (add < width) sum += source[y * width + add]!
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let y = -radius; y <= radius; y++) {
      if (y >= 0 && y < height) sum += horizontal[y * width + x]!
    }
    for (let y = 0; y < height; y++) {
      output[y * width + x] = Math.round(sum / diameter)
      const remove = y - radius
      const add = y + radius + 1
      if (remove >= 0) sum -= horizontal[remove * width + x]!
      if (add < height) sum += horizontal[add * width + x]!
    }
  }
  return output
}

function boundsOfData(
  data: Uint8Array,
  width: number,
  height: number,
): SelectionRect | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      if (data[row + x]! === 0) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX || maxY < minY) return null
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

const DEG = Math.PI / 180

function documentToMaskLocal(
  docX: number,
  docY: number,
  transform: SelectionAffineTransform,
): SelectionPoint {
  let x = docX - transform.x
  let y = docY - transform.y
  const rotation = -transform.rotationDeg * DEG
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const rx = x * cos - y * sin
  const ry = x * sin + y * cos
  const skewX = Math.tan(transform.skewXDeg * DEG)
  const skewY = Math.tan(transform.skewYDeg * DEG)
  const determinant = 1 - skewX * skewY
  const sx = determinant !== 0 ? (rx - skewX * ry) / determinant : rx
  const sy = determinant !== 0 ? (ry - skewY * rx) / determinant : ry
  return {
    x: sx / (transform.scaleX || 1) + transform.pivotX,
    y: sy / (transform.scaleY || 1) + transform.pivotY,
  }
}

function bilinearSample(
  data: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sample = (sx: number, sy: number) =>
    sx < 0 || sy < 0 || sx >= width || sy >= height ? 0 : data[sy * width + sx]!
  const top = sample(x0, y0) * (1 - fx) + sample(x0 + 1, y0) * fx
  const bottom = sample(x0, y0 + 1) * (1 - fx) + sample(x0 + 1, y0 + 1) * fx
  return Math.round(top * (1 - fy) + bottom * fy)
}

/** Homography mapping src quad → dst quad (3×3 row-major, h33 = 1). */
function computeHomography(
  src: SelectionPoint[],
  dst: SelectionPoint[],
): number[] {
  const a: number[] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const sx = src[i]!.x
    const sy = src[i]!.y
    const dx = dst[i]!.x
    const dy = dst[i]!.y
    a.push(sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy)
    b.push(dx)
    a.push(0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy)
    b.push(dy)
  }
  const h = solveLinear8(a, b)
  if (!h) return [1, 0, 0, 0, 1, 0, 0, 0, 1]
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1]
}

function invertHomography(h: number[]): number[] | null {
  const [
    a, b, c,
    d, e, f,
    g, h21, h22,
  ] = h
  const det =
    a * (e * h22 - f * h21) -
    b * (d * h22 - f * g) +
    c * (d * h21 - e * g)
  if (Math.abs(det) < 1e-12) return null
  const invDet = 1 / det
  return [
    (e * h22 - f * h21) * invDet,
    (c * h21 - b * h22) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * h22) * invDet,
    (a * h22 - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h21 - e * g) * invDet,
    (b * g - a * h21) * invDet,
    (a * e - b * d) * invDet,
  ]
}

function applyHomography(h: number[], x: number, y: number): SelectionPoint {
  const w = h[6]! * x + h[7]! * y + h[8]!
  if (Math.abs(w) < 1e-12) return { x, y }
  return {
    x: (h[0]! * x + h[1]! * y + h[2]!) / w,
    y: (h[3]! * x + h[4]! * y + h[5]!) / w,
  }
}

/** Solve 8×8 linear system via Gaussian elimination (partial pivot). */
function solveLinear8(aFlat: number[], bIn: number[]): number[] | null {
  const n = 8
  const a: number[][] = []
  for (let r = 0; r < n; r++) {
    a[r] = aFlat.slice(r * n, (r + 1) * n)
    a[r]!.push(bIn[r]!)
  }
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r
    }
    if (Math.abs(a[pivot]![col]!) < 1e-12) return null
    if (pivot !== col) {
      const tmp = a[col]!
      a[col] = a[pivot]!
      a[pivot] = tmp
    }
    const div = a[col]![col]!
    for (let c = col; c <= n; c++) a[col]![c]! /= div
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = a[r]![col]!
      if (factor === 0) continue
      for (let c = col; c <= n; c++) a[r]![c]! -= factor * a[col]![c]!
    }
  }
  return a.map((row) => row[n]!)
}
