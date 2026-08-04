import { dabCoverage, tipDistance } from '../brushes/dabKernel'
import { getTip } from '../brushes/tipRegistry'
import { createGaussianKernel } from '../kernels/gaussian'
import { solvePoissonHealLite } from './poissonHeal'

export type TipAlpha = {
  data: Uint8ClampedArray
  width: number
  height: number
}

/**
 * Tile-backed mutable raster surface (SPEC §9). v0.1 may keep small surfaces
 * as one buffer but still exposes a tile API so brush/history/render share
 * the same invalidation model.
 */

export const TILE_SIZE = 512 as const

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export type RasterTile = {
  tileX: number
  tileY: number
  /** Width/height of this tile (edge tiles may be smaller than TILE_SIZE). */
  width: number
  height: number
  /** Straight RGBA8 bytes, row-major. */
  data: Uint8ClampedArray
  revision: number
}

export type TileCoord = { tileX: number; tileY: number }

export type RasterPatch = {
  surfaceId: string
  tiles: Array<{
    tileX: number
    tileY: number
    before: Uint8ClampedArray
    after: Uint8ClampedArray
    width: number
    height: number
  }>
}

function tileKey(tx: number, ty: number): string {
  return `${tx},${ty}`
}

function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(width, Math.floor(rect.x)))
  const y = Math.max(0, Math.min(height, Math.floor(rect.y)))
  const right = Math.max(x, Math.min(width, Math.ceil(rect.x + rect.width)))
  const bottom = Math.max(y, Math.min(height, Math.ceil(rect.y + rect.height)))
  return { x, y, width: right - x, height: bottom - y }
}

function buildTipMip(
  source: TipAlpha,
  diameter: number,
  angle: number,
  roundness: number,
  hardness = 1,
): TipAlpha {
  const axis = Math.max(0.05, Math.min(1, roundness))
  const radians = (angle * Math.PI) / 180
  const boundsW = Math.max(1, Math.ceil(diameter * (Math.abs(Math.cos(radians)) + axis * Math.abs(Math.sin(radians)))))
  const boundsH = Math.max(1, Math.ceil(diameter * (Math.abs(Math.sin(radians)) + axis * Math.abs(Math.cos(radians)))))
  const data = new Uint8ClampedArray(boundsW * boundsH)
  const halfW = boundsW / 2
  const halfH = boundsH / 2
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  for (let y = 0; y < boundsH; y++) {
    for (let x = 0; x < boundsW; x++) {
      const dx = x + 0.5 - halfW
      const dy = y + 0.5 - halfH
      const localX = dx * cos + dy * sin
      const localY = -dx * sin + dy * cos
      const d = tipDistance(localX, localY, diameter / 2, 0, axis)
      if (d > 1) continue
      const sx = Math.min(source.width - 1, Math.max(0, Math.floor((localX / diameter + 0.5) * source.width)))
      const sy = Math.min(source.height - 1, Math.max(0, Math.floor((localY / (diameter * axis) + 0.5) * source.height)))
      data[y * boundsW + x] = Math.round(
        source.data[sy * source.width + sx]! * dabCoverage(d, hardness),
      )
    }
  }
  return { data, width: boundsW, height: boundsH }
}

/**
 * In-memory tiled surface. Owns canonical CPU pixels for a raster layer.
 */
/**
 * Lerp a straight-RGBA texel toward `src` in PREMULTIPLIED space.
 *
 * Blending straight RGB toward a transparent `(0,0,0,0)` neighbour darkens the
 * surviving colour instead of only lowering its alpha — the classic black
 * fringe at a transparency edge. Premultiplying first keeps the hue and lets
 * alpha carry the fade.
 */
function lerpTexelPremultiplied(
  data: Uint8ClampedArray,
  i: number,
  src: readonly [number, number, number, number],
  amount: number,
): void {
  const dstA = data[i + 3]! / 255
  const srcA = src[3] / 255
  const outA = dstA + (srcA - dstA) * amount
  if (outA <= 0) {
    data[i + 3] = 0
    return
  }
  for (let c = 0; c < 3; c++) {
    const dstPremultiplied = data[i + c]! * dstA
    const srcPremultiplied = src[c]! * srcA
    data[i + c] = Math.round(
      (dstPremultiplied + (srcPremultiplied - dstPremultiplied) * amount) / outA,
    )
  }
  data[i + 3] = Math.round(outA * 255)
}

export class TiledRasterSurface {
  readonly id: string
  readonly width: number
  readonly height: number
  readonly tileSize = TILE_SIZE
  private readonly tiles = new Map<string, RasterTile>()
  private revision = 1
  /** Dirty tile keys since last `takeDirtyTiles()` (GPU upload batching). */
  private readonly dirtyKeys = new Set<string>()
  /** Pre-rotated/resized stamp masks; bounded by the surface lifetime. */
  private readonly tipMipCache = new Map<string, TipAlpha>()
  /**
   * Active stroke capture: earliest `before` per tile. When set, `stampBrush`
   * skips per-dab before/after copies; call `endStrokeCapture()` on pointer-up.
   */
  private strokeCapture: Map<
    string,
    {
      tileX: number
      tileY: number
      width: number
      height: number
      before: Uint8ClampedArray
    }
  > | null = null
  /**
   * Gesture-local source coverage by tile. This is allocated only for tiles
   * whose dab AABB is touched and is discarded at pointer-up; it is never
   * scanned outside the existing stamp loops.
   */
  private strokeCoverage: Map<string, Float32Array> | null = null
  private strokeOpacityCeiling: number | null = null

  constructor(id: string, width: number, height: number) {
    if (width < 1 || height < 1) throw new Error('invalid surface size')
    this.id = id
    this.width = width
    this.height = height
  }

  /** Start coalescing history for an interactive stroke (one entry on end). */
  beginStrokeCapture(options: { opacityCeiling?: number } = {}): void {
    this.strokeCapture = new Map()
    this.strokeOpacityCeiling =
      typeof options.opacityCeiling === 'number'
        ? Math.max(0, Math.min(1, options.opacityCeiling))
        : null
    // Only the map shell is created here; the 1 MiB per-tile Float32Array is
    // allocated lazily in `capStrokeAlpha`, and only for pixels where the
    // ceiling (scaled by selection coverage) can actually bind.
    this.strokeCoverage =
      this.strokeOpacityCeiling === null ? null : new Map()
  }

  /** Build before/after patch for tiles touched during the stroke. */
  endStrokeCapture(): RasterPatch {
    const capture = this.strokeCapture
    this.strokeCapture = null
    this.strokeCoverage = null
    this.strokeOpacityCeiling = null
    if (!capture || capture.size === 0) {
      return { surfaceId: this.id, tiles: [] }
    }
    const tiles: RasterPatch['tiles'] = []
    for (const snap of capture.values()) {
      const tile = this.ensureTile(snap.tileX, snap.tileY)
      let changed = false
      for (let i = 0; i < tile.data.length; i++) {
        if (tile.data[i] !== snap.before[i]) {
          changed = true
          break
        }
      }
      if (!changed) continue
      tiles.push({
        tileX: snap.tileX,
        tileY: snap.tileY,
        width: snap.width,
        height: snap.height,
        before: snap.before,
        after: tile.data.slice(),
      })
    }
    return { surfaceId: this.id, tiles }
  }

  isCapturingStroke(): boolean {
    return this.strokeCapture !== null
  }

  getTile(tx: number, ty: number): RasterTile | undefined {
    return this.tiles.get(tileKey(tx, ty))
  }

  /** Read one local pixel for cross-surface retouch sampling. */
  sampleRgba(x: number, y: number): [number, number, number, number] {
    const px = Math.max(0, Math.min(this.width - 1, Math.floor(x)))
    const py = Math.max(0, Math.min(this.height - 1, Math.floor(y)))
    const tx = Math.floor(px / TILE_SIZE), ty = Math.floor(py / TILE_SIZE)
    const tile = this.ensureTile(tx, ty)
    const i = ((py - ty * TILE_SIZE) * tile.width + (px - tx * TILE_SIZE)) * 4
    return [tile.data[i]!, tile.data[i + 1]!, tile.data[i + 2]!, tile.data[i + 3]!]
  }

  /** Consume dirty tile coords for a batched GPU / bitmap flush. */
  takeDirtyTiles(): TileCoord[] {
    if (this.dirtyKeys.size === 0) return []
    const out: TileCoord[] = []
    for (const key of this.dirtyKeys) {
      const [tx, ty] = key.split(',').map(Number) as [number, number]
      out.push({ tileX: tx, tileY: ty })
    }
    this.dirtyKeys.clear()
    return out
  }

  private markDirty(tx: number, ty: number): void {
    this.dirtyKeys.add(tileKey(tx, ty))
  }

  private noteStrokeBefore(tile: RasterTile): void {
    const capture = this.strokeCapture
    if (!capture) return
    const key = tileKey(tile.tileX, tile.tileY)
    if (capture.has(key)) return
    capture.set(key, {
      tileX: tile.tileX,
      tileY: tile.tileY,
      width: tile.width,
      height: tile.height,
      before: tile.data.slice(),
    })
  }

  /**
   * Turns a dab alpha into its remaining gesture contribution. For an opaque
   * destination, sequential source-over compositing has source influence
   * `C + a * (1 - C)`; limiting C therefore limits self-overlap without a
   * full-tile postprocess.
   *
   * `clipCover` is the selection coverage already folded into `alpha`. The
   * ceiling has to be scaled by it as well, otherwise scrubbing back and forth
   * over a feathered selection edge accumulates each pixel toward the raw
   * ceiling and flattens the feather into a hard edge.
   */
  private capStrokeAlpha(
    tile: RasterTile,
    pixel: number,
    alpha: number,
    clipCover: number,
  ): number {
    const coverageByTile = this.strokeCoverage
    const ceiling = this.strokeOpacityCeiling
    if (!coverageByTile || ceiling === null || alpha <= 0) return alpha
    const limit = ceiling * clipCover
    if (limit <= 0) return 0
    // A limit of 1 can never bind (`alpha <= 1`), so returning early keeps the
    // 1 MiB per-tile coverage buffer unallocated for the common case of a
    // 100%-opacity stroke outside any feathered selection.
    if (limit >= 1) return alpha
    const key = tileKey(tile.tileX, tile.tileY)
    let coverage = coverageByTile.get(key)
    if (!coverage) {
      coverage = new Float32Array(tile.width * tile.height)
      coverageByTile.set(key, coverage)
    }
    const accumulated = coverage[pixel]!
    if (accumulated >= limit) return 0
    const remaining = (limit - accumulated) / Math.max(1e-6, 1 - accumulated)
    const effective = Math.min(alpha, remaining)
    coverage[pixel] = accumulated + effective * (1 - accumulated)
    return effective
  }

  static fromImageData(
    id: string,
    imageData: ImageData,
  ): TiledRasterSurface {
    const surface = new TiledRasterSurface(id, imageData.width, imageData.height)
    surface.writeRegion(
      { x: 0, y: 0, width: imageData.width, height: imageData.height },
      imageData.data,
    )
    return surface
  }

  static async fromBitmap(
    id: string,
    bitmap: ImageBitmap,
  ): Promise<TiledRasterSurface> {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    ctx.drawImage(bitmap, 0, 0)
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    return TiledRasterSurface.fromImageData(id, imageData)
  }

  get tilesX(): number {
    return Math.ceil(this.width / TILE_SIZE)
  }

  get tilesY(): number {
    return Math.ceil(this.height / TILE_SIZE)
  }

  private ensureTile(tx: number, ty: number): RasterTile {
    const key = tileKey(tx, ty)
    let tile = this.tiles.get(key)
    if (tile) return tile
    const originX = tx * TILE_SIZE
    const originY = ty * TILE_SIZE
    const width = Math.min(TILE_SIZE, this.width - originX)
    const height = Math.min(TILE_SIZE, this.height - originY)
    tile = {
      tileX: tx,
      tileY: ty,
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
      revision: 0,
    }
    this.tiles.set(key, tile)
    return tile
  }

  /** Overwrite a region from a packed RGBA buffer matching rect size. */
  writeRegion(rect: Rect, rgba: Uint8ClampedArray | Uint8Array): void {
    const r = clampRect(rect, this.width, this.height)
    if (r.width <= 0 || r.height <= 0) return
    const expected = r.width * r.height * 4
    if (rgba.length < expected) throw new Error('buffer too small for region')

    const x0 = Math.floor(r.x / TILE_SIZE)
    const y0 = Math.floor(r.y / TILE_SIZE)
    const x1 = Math.floor((r.x + r.width - 1) / TILE_SIZE)
    const y1 = Math.floor((r.y + r.height - 1) / TILE_SIZE)

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = this.ensureTile(tx, ty)
        const tileOriginX = tx * TILE_SIZE
        const tileOriginY = ty * TILE_SIZE
        const copyX = Math.max(r.x, tileOriginX)
        const copyY = Math.max(r.y, tileOriginY)
        const copyR = Math.min(r.x + r.width, tileOriginX + tile.width)
        const copyB = Math.min(r.y + r.height, tileOriginY + tile.height)
        for (let y = copyY; y < copyB; y++) {
          for (let x = copyX; x < copyR; x++) {
            const srcI = ((y - r.y) * r.width + (x - r.x)) * 4
            const dstI = ((y - tileOriginY) * tile.width + (x - tileOriginX)) * 4
            tile.data[dstI] = rgba[srcI]!
            tile.data[dstI + 1] = rgba[srcI + 1]!
            tile.data[dstI + 2] = rgba[srcI + 2]!
            tile.data[dstI + 3] = rgba[srcI + 3]!
          }
        }
        tile.revision = ++this.revision
        this.markDirty(tx, ty)
      }
    }
  }

  /**
   * Composite a sampled gradient over every pixel in `region`. Callers own the
   * stroke capture so a drag remains one undoable raster transaction.
   */
  applyGradient(options: {
    region?: Rect
    sample: (localX: number, localY: number) => {
      r: number
      g: number
      b: number
      opacity: number
    }
    opacity: number
    clip?: (localX: number, localY: number) => number
  }): void {
    const region = clampRect(
      options.region ?? { x: 0, y: 0, width: this.width, height: this.height },
      this.width,
      this.height,
    )
    if (region.width <= 0 || region.height <= 0) return
    const tiles = this.readTiles(region)
    const opacity = Math.max(0, Math.min(1, options.opacity))

    for (const tile of tiles) {
      this.noteStrokeBefore(tile)
      const originX = tile.tileX * TILE_SIZE
      const originY = tile.tileY * TILE_SIZE
      const x0 = Math.max(0, region.x - originX)
      const y0 = Math.max(0, region.y - originY)
      const x1 = Math.min(tile.width, region.x + region.width - originX)
      const y1 = Math.min(tile.height, region.y + region.height - originY)
      let changed = false

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const localX = originX + x + 0.5
          const localY = originY + y + 0.5
          const clip = options.clip ? options.clip(localX, localY) : 1
          if (clip <= 0) continue
          const sampled = options.sample(localX, localY)
          const alpha = Math.max(0, Math.min(1, sampled.opacity * opacity * clip))
          if (alpha <= 0) continue

          const index = (y * tile.width + x) * 4
          const dstA = tile.data[index + 3]! / 255
          const outA = alpha + dstA * (1 - alpha)
          if (outA <= 0) continue
          const nextR = Math.round((sampled.r * alpha + tile.data[index]! * dstA * (1 - alpha)) / outA)
          const nextG = Math.round((sampled.g * alpha + tile.data[index + 1]! * dstA * (1 - alpha)) / outA)
          const nextB = Math.round((sampled.b * alpha + tile.data[index + 2]! * dstA * (1 - alpha)) / outA)
          const nextA = Math.round(outA * 255)
          if (
            nextR === tile.data[index] &&
            nextG === tile.data[index + 1] &&
            nextB === tile.data[index + 2] &&
            nextA === tile.data[index + 3]
          ) continue
          tile.data[index] = nextR
          tile.data[index + 1] = nextG
          tile.data[index + 2] = nextB
          tile.data[index + 3] = nextA
          changed = true
        }
      }
      if (changed) {
        tile.revision = ++this.revision
        this.markDirty(tile.tileX, tile.tileY)
      }
    }
  }

  readTiles(region: Rect): RasterTile[] {
    const r = clampRect(region, this.width, this.height)
    if (r.width <= 0 || r.height <= 0) return []
    const x0 = Math.floor(r.x / TILE_SIZE)
    const y0 = Math.floor(r.y / TILE_SIZE)
    const x1 = Math.floor((r.x + r.width - 1) / TILE_SIZE)
    const y1 = Math.floor((r.y + r.height - 1) / TILE_SIZE)
    const out: RasterTile[] = []
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        out.push(this.ensureTile(tx, ty))
      }
    }
    return out
  }

  /**
   * Stamp an analytic soft brush dab, optionally elliptical and rotated.
   *
   * Hot path: iterates only the dab AABB inside each tile (not full 512²).
   * During `beginStrokeCapture()` history copies are deferred to
   * `endStrokeCapture()` so pointermove does not allocate per dab.
   */
  stampBrush(options: {
    x: number
    y: number
    radius: number
    /** Rotation in degrees for the analytic elliptical tip. */
    angle?: number
    /** Minor/major axis ratio for the analytic elliptical tip. */
    roundness?: number
    hardness: number
    opacity: number
    color: { r: number; g: number; b: number }
    mode: 'paint' | 'erase'
    /**
     * Optional layer-local clip: returns 0..1 coverage multiplier per pixel
     * center (used to constrain stamps to the active selection).
     */
    clip?: (localX: number, localY: number) => number
  }): RasterPatch {
    const {
      x,
      y,
      radius,
      angle = 0,
      roundness = 1,
      hardness,
      opacity,
      color,
      mode,
      clip,
    } = options
    const pad = Math.ceil(radius) + 1
    const region: Rect = {
      x: Math.floor(x - pad),
      y: Math.floor(y - pad),
      width: Math.ceil(pad * 2),
      height: Math.ceil(pad * 2),
    }
    const touched = this.readTiles(region)
    const capturing = this.strokeCapture !== null
    if (capturing) {
      for (const t of touched) this.noteStrokeBefore(t)
    }
    const beforeSnapshots = capturing
      ? null
      : touched.map((t) => ({
          tileX: t.tileX,
          tileY: t.tileY,
          width: t.width,
          height: t.height,
          before: t.data.slice(),
        }))

    const op = Math.max(0, Math.min(1, opacity))
    const axis = Math.max(0.05, Math.min(1, roundness))
    // Dab AABB in surface space (inclusive min, exclusive max via floor/ceil).
    const dabX0 = Math.floor(x - pad)
    const dabY0 = Math.floor(y - pad)
    const dabX1 = Math.ceil(x + pad)
    const dabY1 = Math.ceil(y + pad)

    for (const tile of touched) {
      const originX = tile.tileX * TILE_SIZE
      const originY = tile.tileY * TILE_SIZE
      const px0 = Math.max(0, dabX0 - originX)
      const py0 = Math.max(0, dabY0 - originY)
      const px1 = Math.min(tile.width, dabX1 - originX)
      const py1 = Math.min(tile.height, dabY1 - originY)
      if (px0 >= px1 || py0 >= py1) continue

      let changed = false
      for (let py = py0; py < py1; py++) {
        for (let px = px0; px < px1; px++) {
          const lx = originX + px + 0.5
          const ly = originY + py + 0.5
          const dx = lx - x
          const dy = ly - y
          const d = tipDistance(dx, dy, radius, angle, axis)
          if (d > 1) continue
          const clipCover = Math.max(0, Math.min(1, clip ? clip(lx, ly) : 1))
          if (clipCover <= 0) continue
          const cover = dabCoverage(d, hardness)
          const a = this.capStrokeAlpha(
            tile,
            py * tile.width + px,
            cover * op * clipCover,
            clipCover,
          )
          if (a <= 0) continue
          const i = (py * tile.width + px) * 4
          if (mode === 'erase') {
            tile.data[i + 3] = Math.round(tile.data[i + 3]! * (1 - a))
          } else {
            const dstA = tile.data[i + 3]! / 255
            const outA = a + dstA * (1 - a)
            const srcR = color.r
            const srcG = color.g
            const srcB = color.b
            if (outA > 0) {
              tile.data[i] = Math.round(
                (srcR * a + tile.data[i]! * dstA * (1 - a)) / outA,
              )
              tile.data[i + 1] = Math.round(
                (srcG * a + tile.data[i + 1]! * dstA * (1 - a)) / outA,
              )
              tile.data[i + 2] = Math.round(
                (srcB * a + tile.data[i + 2]! * dstA * (1 - a)) / outA,
              )
              tile.data[i + 3] = Math.round(outA * 255)
            }
          }
          changed = true
        }
      }
      if (changed) {
        tile.revision = ++this.revision
        this.markDirty(tile.tileX, tile.tileY)
      }
    }

    if (capturing || !beforeSnapshots) {
      return { surfaceId: this.id, tiles: [] }
    }

    const tiles = beforeSnapshots.map((snap) => {
      const tile = this.ensureTile(snap.tileX, snap.tileY)
      return {
        tileX: snap.tileX,
        tileY: snap.tileY,
        width: snap.width,
        height: snap.height,
        before: snap.before,
        after: tile.data.slice(),
      }
    })

    return { surfaceId: this.id, tiles }
  }

  /**
   * Stamp a procedural or textured tip. Passing `alpha: null` intentionally
   * delegates to stampBrush so the analytic path remains byte-identical.
   */
  stampTip(options: {
    x: number
    y: number
    radius: number
    angle: number
    roundness: number
    hardness: number
    opacity: number
    color: { r: number; g: number; b: number }
    mode: 'paint' | 'erase'
    alpha: TipAlpha | null
    tipId?: string
    clip?: (localX: number, localY: number) => number
  }): RasterPatch {
    if (!options.alpha) {
      const shape = options.tipId ? getTip(options.tipId)?.shape : undefined
      if (shape === 'square') {
        return this.stampSquare({
          x: options.x,
          y: options.y,
          size: Math.max(1, Math.round(options.radius * 2)),
          opacity: options.opacity,
          color: options.color,
          mode: options.mode,
          clip: options.clip,
        })
      }
      return this.stampBrush(options)
    }
    const { x, y, radius, angle, roundness, hardness, opacity, color, mode, alpha, clip } =
      options
    const bucket = Math.min(512, 2 ** Math.ceil(Math.log2(Math.max(1, radius * 2))))
    // `buildTipMip` bakes `dabCoverage(d, hardness)` into the cached texels, so
    // hardness is part of the cache identity — omitting it made every hardness
    // change reuse the first-stamped falloff.
    const hardnessKey = Math.round(Math.max(0, Math.min(1, hardness)) * 100)
    const key = `${options.tipId ?? 'anonymous'}:${bucket}:${Math.round(angle * 10)}:${Math.round(roundness * 1000)}:${hardnessKey}`
    let mip = this.tipMipCache.get(key)
    if (!mip) {
      mip = buildTipMip(alpha, bucket, angle, roundness, hardness)
      this.tipMipCache.set(key, mip)
      // Avoid retaining unbounded user-installed tip variants on long sessions.
      if (this.tipMipCache.size > 64) this.tipMipCache.delete(this.tipMipCache.keys().next().value!)
    }
    // The mip is built at the power-of-two bucket diameter; the dab must still
    // land at the requested radius, so sample it scaled instead of 1:1.
    const mipScale = Math.max(1e-6, (radius * 2) / bucket)
    const halfW = (mip.width * mipScale) / 2
    const halfH = (mip.height * mipScale) / 2
    const region: Rect = {
      x: Math.floor(x - halfW - 1),
      y: Math.floor(y - halfH - 1),
      width: Math.ceil(halfW * 2 + 2),
      height: Math.ceil(halfH * 2 + 2),
    }
    const touched = this.readTiles(region)
    const capturing = this.strokeCapture !== null
    if (capturing) for (const tile of touched) this.noteStrokeBefore(tile)
    const beforeSnapshots = capturing
      ? null
      : touched.map((tile) => ({
          tileX: tile.tileX,
          tileY: tile.tileY,
          width: tile.width,
          height: tile.height,
          before: tile.data.slice(),
        }))
    const op = Math.max(0, Math.min(1, opacity))
    const x0 = Math.floor(x - halfW)
    const y0 = Math.floor(y - halfH)
    const x1 = Math.ceil(x + halfW)
    const y1 = Math.ceil(y + halfH)
    for (const tile of touched) {
      const originX = tile.tileX * TILE_SIZE
      const originY = tile.tileY * TILE_SIZE
      const px0 = Math.max(0, x0 - originX)
      const py0 = Math.max(0, y0 - originY)
      const px1 = Math.min(tile.width, x1 - originX)
      const py1 = Math.min(tile.height, y1 - originY)
      let changed = false
      for (let py = py0; py < py1; py++) {
        for (let px = px0; px < px1; px++) {
          const lx = originX + px + 0.5
          const ly = originY + py + 0.5
          const mx = Math.floor((lx - x) / mipScale + mip.width / 2)
          const my = Math.floor((ly - y) / mipScale + mip.height / 2)
          if (mx < 0 || my < 0 || mx >= mip.width || my >= mip.height) continue
          const textureAlpha = mip.data[my * mip.width + mx]! / 255
          const clipCover = Math.max(0, Math.min(1, clip ? clip(lx, ly) : 1))
          const a = this.capStrokeAlpha(
            tile,
            py * tile.width + px,
            textureAlpha * op * clipCover,
            clipCover,
          )
          if (a <= 0) continue
          const i = (py * tile.width + px) * 4
          if (mode === 'erase') {
            tile.data[i + 3] = Math.round(tile.data[i + 3]! * (1 - a))
          } else {
            const dstA = tile.data[i + 3]! / 255
            const outA = a + dstA * (1 - a)
            tile.data[i] = Math.round((color.r * a + tile.data[i]! * dstA * (1 - a)) / outA)
            tile.data[i + 1] = Math.round((color.g * a + tile.data[i + 1]! * dstA * (1 - a)) / outA)
            tile.data[i + 2] = Math.round((color.b * a + tile.data[i + 2]! * dstA * (1 - a)) / outA)
            tile.data[i + 3] = Math.round(outA * 255)
          }
          changed = true
        }
      }
      if (changed) {
        tile.revision = ++this.revision
        this.markDirty(tile.tileX, tile.tileY)
      }
    }
    if (capturing || !beforeSnapshots) return { surfaceId: this.id, tiles: [] }
    return {
      surfaceId: this.id,
      tiles: beforeSnapshots.map((snapshot) => {
        const tile = this.ensureTile(snapshot.tileX, snapshot.tileY)
        return { ...snapshot, after: tile.data.slice() }
      }),
    }
  }

  /**
   * Hard square stamp for pixel-art pencil. Center is a snapped pixel center;
   * `size` is an integer side length with no analytic falloff or fringe.
   */
  stampSquare(options: {
    x: number
    y: number
    size: number
    opacity: number
    color: { r: number; g: number; b: number }
    mode: 'paint' | 'erase'
    clip?: (localX: number, localY: number) => number
  }): RasterPatch {
    const { x, y, opacity, color, mode, clip } = options
    const side = Math.max(1, Math.round(options.size))
    const half = Math.floor(side / 2)
    const x0 = Math.floor(x - half)
    const y0 = Math.floor(y - half)
    const region: Rect = { x: x0, y: y0, width: side, height: side }
    const touched = this.readTiles(region)
    const capturing = this.strokeCapture !== null
    if (capturing) for (const tile of touched) this.noteStrokeBefore(tile)
    const beforeSnapshots = capturing
      ? null
      : touched.map((snapshot) => ({
          tileX: snapshot.tileX,
          tileY: snapshot.tileY,
          width: snapshot.width,
          height: snapshot.height,
          before: snapshot.data.slice(),
        }))

    const op = Math.max(0, Math.min(1, opacity))
    const x1 = x0 + side
    const y1 = y0 + side

    for (const tile of touched) {
      const originX = tile.tileX * TILE_SIZE
      const originY = tile.tileY * TILE_SIZE
      const px0 = Math.max(0, x0 - originX)
      const py0 = Math.max(0, y0 - originY)
      const px1 = Math.min(tile.width, x1 - originX)
      const py1 = Math.min(tile.height, y1 - originY)
      if (px0 >= px1 || py0 >= py1) continue

      let changed = false
      for (let py = py0; py < py1; py++) {
        for (let px = px0; px < px1; px++) {
          const lx = originX + px + 0.5
          const ly = originY + py + 0.5
          const clipCover = Math.max(0, Math.min(1, clip ? clip(lx, ly) : 1))
          if (clipCover <= 0) continue
          const a = this.capStrokeAlpha(
            tile,
            py * tile.width + px,
            op * clipCover,
            clipCover,
          )
          if (a <= 0) continue
          const i = (py * tile.width + px) * 4
          if (mode === 'erase') {
            tile.data[i + 3] = Math.round(tile.data[i + 3]! * (1 - a))
          } else {
            const dstA = tile.data[i + 3]! / 255
            const outA = a + dstA * (1 - a)
            tile.data[i] = Math.round((color.r * a + tile.data[i]! * dstA * (1 - a)) / outA)
            tile.data[i + 1] = Math.round(
              (color.g * a + tile.data[i + 1]! * dstA * (1 - a)) / outA,
            )
            tile.data[i + 2] = Math.round(
              (color.b * a + tile.data[i + 2]! * dstA * (1 - a)) / outA,
            )
            tile.data[i + 3] = Math.round(outA * 255)
          }
          changed = true
        }
      }
      if (changed) {
        tile.revision = ++this.revision
        this.markDirty(tile.tileX, tile.tileY)
      }
    }

    if (capturing || !beforeSnapshots) return { surfaceId: this.id, tiles: [] }
    return {
      surfaceId: this.id,
      tiles: beforeSnapshots.map((snapshot) => {
        const tile = this.ensureTile(snapshot.tileX, snapshot.tileY)
        return { ...snapshot, after: tile.data.slice() }
      }),
    }
  }

  /**
   * Tile-local destructive retouch dab. All source reads are bounded to the
   * dab AABB (plus the small blur kernel), never the document surface.
   */
  retouchDab(options: {
    kind: 'clone' | 'history' | 'pattern' | 'smudge' | 'blur' | 'sharpen' | 'heal' | 'dodge' | 'burn' | 'sponge'
    x: number
    y: number
    radius: number
    strength: number
    /** Source position for clone/heal, in this surface's local coordinates. */
    source?: { x: number; y: number }
    /**
     * Optional source sampler for a different surface. Coordinates are the
     * destination surface's local pixels; callers map them to their source.
     */
    sourceSample?: (destinationX: number, destinationY: number) => [number, number, number, number]
    /** Immutable full-layer pixels captured by the History Brush. */
    historySnapshot?: Uint8ClampedArray
    /** Optional procedural pattern sampler for Pattern Stamp. */
    patternSample?: (localX: number, localY: number) => [number, number, number, number]
    /** Previous dab position; gives Smudge its directional pickup. */
    previous?: { x: number; y: number }
    /** Tonal band affected by Dodge and Burn. */
    range?: 'shadows' | 'midtones' | 'highlights'
    /** Dodge/Burn: preserve hue by scaling RGB instead of lerping toward white/black. */
    protectTones?: boolean
    /** Sponge: push color toward or away from local luminance. */
    spongeMode?: 'desaturate' | 'saturate'
    clip?: (localX: number, localY: number) => number
  }): RasterPatch {
    const { kind, x, y, radius, source, previous, clip } = options
    const strength = Math.max(0, Math.min(1, options.strength))
    if (radius <= 0 || strength <= 0) return { surfaceId: this.id, tiles: [] }
    const pad = Math.ceil(radius) + (
      kind === 'blur' || kind === 'sharpen' ? 2
        : kind === 'heal' && (options.sourceSample ?? options.source) ? 4
          : kind === 'heal' ? 2
            : 1
    )
    const region = clampRect(
      { x: Math.floor(x - pad), y: Math.floor(y - pad), width: pad * 2, height: pad * 2 },
      this.width,
      this.height,
    )
    if (region.width <= 0 || region.height <= 0) return { surfaceId: this.id, tiles: [] }
    const touched = this.readTiles(region)
    const capturing = this.strokeCapture !== null
    if (capturing) for (const tile of touched) this.noteStrokeBefore(tile)
    const before = capturing
      ? null
      : touched.map((tile) => ({ tileX: tile.tileX, tileY: tile.tileY, width: tile.width, height: tile.height, before: tile.data.slice() }))
    const sourceRegion = source
      ? clampRect(
          { x: source.x - radius - 2, y: source.y - radius - 2, width: radius * 2 + 4, height: radius * 2 + 4 },
          this.width,
          this.height,
        )
      : region
    // Copy only destination/source tiles needed by this dab. This preserves
    // deterministic reads while keeping pointer-move work AABB/tile-local.
    const snapshotTiles = new Map<string, Uint8ClampedArray>()
    for (const tile of [...touched, ...this.readTiles(sourceRegion)]) {
      const key = tileKey(tile.tileX, tile.tileY)
      if (!snapshotTiles.has(key)) snapshotTiles.set(key, tile.data.slice())
    }
    const sample = (sx: number, sy: number): [number, number, number, number] => {
      const px = Math.max(0, Math.min(this.width - 1, Math.floor(sx)))
      const py = Math.max(0, Math.min(this.height - 1, Math.floor(sy)))
      const tx = Math.floor(px / TILE_SIZE), ty = Math.floor(py / TILE_SIZE)
      const tile = this.ensureTile(tx, ty)
      const pixels = snapshotTiles.get(tileKey(tx, ty)) ?? tile.data
      const i = ((py - ty * TILE_SIZE) * tile.width + (px - tx * TILE_SIZE)) * 4
      return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, pixels[i + 3]!]
    }
    const sampleHistory = (sx: number, sy: number): [number, number, number, number] => {
      const pixels = options.historySnapshot
      if (!pixels) return sample(sx, sy)
      const px = Math.max(0, Math.min(this.width - 1, Math.floor(sx)))
      const py = Math.max(0, Math.min(this.height - 1, Math.floor(sy)))
      const i = (py * this.width + px) * 4
      return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, pixels[i + 3]!]
    }
    const patternSample = options.patternSample ?? ((sx: number, sy: number): [number, number, number, number] => {
      const cell = 12
      const ix = Math.floor(sx / cell)
      const iy = Math.floor(sy / cell)
      // Legacy woven checker when no pattern sampler is supplied.
      return (ix + iy) % 2 === 0 ? [234, 217, 177, 255] : [92, 73, 54, 255]
    })
    // Averaging straight RGB pulls the (0,0,0) carried by transparent pixels
    // into the result, so an isolated coloured shape blurs toward black.
    // Premultiply, average, then unpremultiply by the averaged alpha.
    const blurSample = (sx: number, sy: number): [number, number, number, number] => {
      let r = 0, g = 0, b = 0, a = 0, count = 0
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const p = sample(sx + ox, sy + oy)
        const weight = p[3] / 255
        r += p[0] * weight; g += p[1] * weight; b += p[2] * weight; a += p[3]; count++
      }
      if (a <= 0) return [0, 0, 0, 0]
      return [(r * 255) / a, (g * 255) / a, (b * 255) / a, a / count]
    }
    const dx = previous ? x - previous.x : 0
    const dy = previous ? y - previous.y : 0
    const healSource = source ?? { x, y }
    const sourceSample = options.sourceSample ?? (source
      ? (destinationX: number, destinationY: number) =>
          sample(healSource.x + (destinationX - x), healSource.y + (destinationY - y))
      : undefined)
    const poissonHealRgb = kind === 'heal' && sourceSample
      ? solvePoissonHealLite({
          region,
          centerX: x,
          centerY: y,
          radius,
          destSample: (sx, sy) => {
            const p = sample(sx, sy)
            return [p[0], p[1], p[2]]
          },
          sourceSample: (sx, sy) => {
            const p = sourceSample(sx, sy)
            return [p[0], p[1], p[2]]
          },
        })
      : null
    for (const tile of touched) {
      const ox = tile.tileX * TILE_SIZE, oy = tile.tileY * TILE_SIZE
      let changed = false
      for (let py = Math.max(0, region.y - oy); py < Math.min(tile.height, region.y + region.height - oy); py++) {
        for (let px = Math.max(0, region.x - ox); px < Math.min(tile.width, region.x + region.width - ox); px++) {
          const lx = ox + px + .5, ly = oy + py + .5
          const distance = Math.hypot(lx - x, ly - y) / radius
          if (distance > 1) continue
          const amount = dabCoverage(distance, 1) * strength * Math.max(0, Math.min(1, clip?.(lx, ly) ?? 1))
          if (amount <= 0) continue
          let picked: [number, number, number, number]
          if (kind === 'clone') picked = sourceSample
            ? sourceSample(lx, ly)
            : sample(healSource.x + (lx - x), healSource.y + (ly - y))
          else if (kind === 'history') picked = sampleHistory(lx, ly)
          else if (kind === 'pattern') picked = patternSample(lx, ly)
          else if (kind === 'smudge') picked = sample(lx - dx, ly - dy)
          else if (kind === 'blur') picked = blurSample(lx, ly)
          else if (kind === 'sharpen') {
            const original = sample(lx, ly)
            const blurred = blurSample(lx, ly)
            // A compact local unsharp mask: original + (original - blurred).
            // Preserve alpha so edge transparency remains untouched.
            picked = [
              Math.max(0, Math.min(255, original[0] * 2 - blurred[0])),
              Math.max(0, Math.min(255, original[1] * 2 - blurred[1])),
              Math.max(0, Math.min(255, original[2] * 2 - blurred[2])),
              original[3],
            ]
          }
          else if (kind === 'heal') {
            if (!sourceSample) {
              // Spot-heal: borrow the local ring, preserving destination alpha.
              picked = blurSample(lx, ly)
            } else {
              // Source-aware heal: local tile Poisson-lite solve under the tip.
              const regionPx = Math.floor(lx) - region.x
              const regionPy = Math.floor(ly) - region.y
              const pi = (regionPy * region.width + regionPx) * 3
              const destination = sample(lx, ly)
              picked = [
                poissonHealRgb![pi]!,
                poissonHealRgb![pi + 1]!,
                poissonHealRgb![pi + 2]!,
                destination[3],
              ]
            }
          } else {
            picked = sample(lx, ly)
          }
          const i = (py * tile.width + px) * 4
          if (kind === 'dodge' || kind === 'burn') {
            const luminance = (picked[0] * 0.2126 + picked[1] * 0.7152 + picked[2] * 0.0722) / 255
            const tonalWeight = options.range === 'shadows'
              ? 1 - luminance
              : options.range === 'highlights'
                ? luminance
                : 1 - Math.abs(luminance * 2 - 1)
            const adjusted = amount * tonalWeight
            if (options.protectTones) {
              const luma = picked[0] * 0.2126 + picked[1] * 0.7152 + picked[2] * 0.0722
              const targetLuma = kind === 'dodge'
                ? luma + (255 - luma) * adjusted
                : luma * (1 - adjusted)
              const scale = luma > 0 ? targetLuma / luma : 0
              tile.data[i] = Math.round(Math.max(0, Math.min(255, picked[0] * scale)))
              tile.data[i + 1] = Math.round(Math.max(0, Math.min(255, picked[1] * scale)))
              tile.data[i + 2] = Math.round(Math.max(0, Math.min(255, picked[2] * scale)))
            } else {
              const target = kind === 'dodge' ? 255 : 0
              tile.data[i] = Math.round(picked[0] + (target - picked[0]) * adjusted)
              tile.data[i + 1] = Math.round(picked[1] + (target - picked[1]) * adjusted)
              tile.data[i + 2] = Math.round(picked[2] + (target - picked[2]) * adjusted)
            }
          } else if (kind === 'sponge') {
            const luma = picked[0] * 0.2126 + picked[1] * 0.7152 + picked[2] * 0.0722
            const saturate = options.spongeMode === 'saturate'
            tile.data[i] = Math.round(saturate
              ? luma + (picked[0] - luma) * (1 + amount)
              : picked[0] + (luma - picked[0]) * amount)
            tile.data[i + 1] = Math.round(saturate
              ? luma + (picked[1] - luma) * (1 + amount)
              : picked[1] + (luma - picked[1]) * amount)
            tile.data[i + 2] = Math.round(saturate
              ? luma + (picked[2] - luma) * (1 + amount)
              : picked[2] + (luma - picked[2]) * amount)
          } else {
            lerpTexelPremultiplied(tile.data, i, picked, amount)
          }
          changed = true
        }
      }
      if (changed) { tile.revision = ++this.revision; this.markDirty(tile.tileX, tile.tileY) }
    }
    if (capturing || !before) return { surfaceId: this.id, tiles: [] }
    return { surfaceId: this.id, tiles: before.map((snap) => ({ ...snap, after: this.ensureTile(snap.tileX, snap.tileY).data.slice() })) }
  }

  /**
   * Tile-local liquify dab. Forward Warp displaces pixels along stroke motion;
   * Reconstruct blends back toward an immutable stroke-start snapshot.
   * Freeze / Thaw paint a session A8 pin mask; warp kinds skip writes where mask > 0.
   */
  liquifyDab(options: {
    kind: 'warp' | 'reconstruct' | 'bloat' | 'pucker' | 'twirl' | 'freeze' | 'thaw'
    x: number
    y: number
    radius: number
    strength: number
    previous?: { x: number; y: number }
    strokeSnapshot?: Uint8ClampedArray
    clip?: (localX: number, localY: number) => number
    /** A8 pin mask — warp kinds skip destination pixels where value > 0. */
    freezeMask?: Uint8Array
    /** Writable A8 buffer for freeze/thaw kinds (width × height). */
    freezeMaskWrite?: Uint8Array
  }): RasterPatch {
    const { kind, x, y, radius, previous, clip, freezeMask, freezeMaskWrite } = options
    const strength = Math.max(0, Math.min(1, options.strength))
    if (radius <= 0 || strength <= 0) return { surfaceId: this.id, tiles: [] }

    if (kind === 'freeze' || kind === 'thaw') {
      const mask = freezeMaskWrite
      if (!mask || mask.length !== this.width * this.height) {
        return { surfaceId: this.id, tiles: [] }
      }
      const pad = Math.ceil(radius) + 1
      const region = clampRect(
        { x: Math.floor(x - pad), y: Math.floor(y - pad), width: pad * 2, height: pad * 2 },
        this.width,
        this.height,
      )
      for (let py = region.y; py < region.y + region.height; py++) {
        for (let px = region.x; px < region.x + region.width; px++) {
          const lx = px + 0.5
          const ly = py + 0.5
          const distance = Math.hypot(lx - x, ly - y) / radius
          if (distance > 1) continue
          const amount = dabCoverage(distance, 1) * strength * Math.max(0, Math.min(1, clip?.(lx, ly) ?? 1))
          if (amount <= 0) continue
          const mi = py * this.width + px
          if (kind === 'freeze') {
            mask[mi] = Math.max(mask[mi]!, Math.round(amount * 255))
          } else {
            mask[mi] = Math.min(mask[mi]!, Math.round((1 - amount) * 255))
          }
        }
      }
      return { surfaceId: this.id, tiles: [] }
    }

    const dx = previous ? x - previous.x : 0
    const dy = previous ? y - previous.y : 0
    const dispPad =
      kind === 'warp'
        ? Math.ceil(Math.hypot(dx, dy) * strength) + 1
        : kind === 'reconstruct'
          ? 0
          : kind === 'twirl'
            ? Math.ceil(radius * strength * 0.5) + 1
            : Math.ceil(radius * strength * 0.5) + 1
    const pad = Math.ceil(radius) + dispPad + 1
    const region = clampRect(
      { x: Math.floor(x - pad), y: Math.floor(y - pad), width: pad * 2, height: pad * 2 },
      this.width,
      this.height,
    )
    if (region.width <= 0 || region.height <= 0) return { surfaceId: this.id, tiles: [] }
    const touched = this.readTiles(region)
    const capturing = this.strokeCapture !== null
    if (capturing) for (const tile of touched) this.noteStrokeBefore(tile)
    const before = capturing
      ? null
      : touched.map((tile) => ({
          tileX: tile.tileX,
          tileY: tile.tileY,
          width: tile.width,
          height: tile.height,
          before: tile.data.slice(),
        }))
    const snapshotTiles = new Map<string, Uint8ClampedArray>()
    for (const tile of touched) {
      const key = tileKey(tile.tileX, tile.tileY)
      if (!snapshotTiles.has(key)) snapshotTiles.set(key, tile.data.slice())
    }
    const sample = (sx: number, sy: number): [number, number, number, number] => {
      const px = Math.max(0, Math.min(this.width - 1, Math.floor(sx)))
      const py = Math.max(0, Math.min(this.height - 1, Math.floor(sy)))
      const tx = Math.floor(px / TILE_SIZE)
      const ty = Math.floor(py / TILE_SIZE)
      const tile = this.ensureTile(tx, ty)
      const pixels = snapshotTiles.get(tileKey(tx, ty)) ?? tile.data
      const i = ((py - ty * TILE_SIZE) * tile.width + (px - tx * TILE_SIZE)) * 4
      return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, pixels[i + 3]!]
    }
    const sampleSnapshot = (sx: number, sy: number): [number, number, number, number] => {
      const pixels = options.strokeSnapshot
      if (!pixels) return sample(sx, sy)
      const px = Math.max(0, Math.min(this.width - 1, Math.floor(sx)))
      const py = Math.max(0, Math.min(this.height - 1, Math.floor(sy)))
      const i = (py * this.width + px) * 4
      return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, pixels[i + 3]!]
    }
    for (const tile of touched) {
      const ox = tile.tileX * TILE_SIZE
      const oy = tile.tileY * TILE_SIZE
      let changed = false
      for (let py = Math.max(0, region.y - oy); py < Math.min(tile.height, region.y + region.height - oy); py++) {
        for (let px = Math.max(0, region.x - ox); px < Math.min(tile.width, region.x + region.width - ox); px++) {
          const lx = ox + px + 0.5
          const ly = oy + py + 0.5
          const distance = Math.hypot(lx - x, ly - y) / radius
          if (distance > 1) continue
          const amount = dabCoverage(distance, 1) * strength * Math.max(0, Math.min(1, clip?.(lx, ly) ?? 1))
          if (amount <= 0) continue
          if (freezeMask) {
            const mi = Math.floor(ly) * this.width + Math.floor(lx)
            if (freezeMask[mi]! > 0) continue
          }
          let picked: [number, number, number, number]
          if (kind === 'warp') {
            picked = sample(lx - dx * amount, ly - dy * amount)
          } else if (kind === 'reconstruct') {
            picked = sampleSnapshot(lx, ly)
          } else {
            const rox = Math.floor(lx) - Math.floor(x)
            const roy = Math.floor(ly) - Math.floor(y)
            const radial = Math.hypot(rox, roy)
            if (radial <= 0) continue
            const cx = Math.floor(x) + 0.5
            const cy = Math.floor(y) + 0.5
            if (kind === 'bloat') {
              const scale = 1 / (1 + amount)
              picked = sample(cx + rox * scale, cy + roy * scale)
            } else if (kind === 'pucker') {
              const scale = 1 + amount
              picked = sample(cx + rox * scale, cy + roy * scale)
            } else {
              const theta = amount * (Math.PI / 2)
              const cos = Math.cos(-theta)
              const sin = Math.sin(-theta)
              picked = sample(cx + rox * cos - roy * sin, cy + rox * sin + roy * cos)
            }
          }
          const i = (py * tile.width + px) * 4
          // Same premultiplied rule as the retouch lerp — a Liquify dab that
          // pulls in a transparent neighbour must fade, not darken.
          lerpTexelPremultiplied(tile.data, i, picked, amount)
          changed = true
        }
      }
      if (changed) {
        tile.revision = ++this.revision
        this.markDirty(tile.tileX, tile.tileY)
      }
    }
    if (capturing || !before) return { surfaceId: this.id, tiles: [] }
    return {
      surfaceId: this.id,
      tiles: before.map((snap) => ({
        ...snap,
        after: this.ensureTile(snap.tileX, snap.tileY).data.slice(),
      })),
    }
  }

  /**
   * Destructively blur a local region in one patch. Source pixels beyond the
   * selection are sampled normally; only pixels covered by `clip` are written.
   */
  gaussianBlur(options: {
    region: Rect
    radius: number
    clip?: (localX: number, localY: number) => number
  }): RasterPatch {
    const target = clampRect(options.region, this.width, this.height)
    const kernel = createGaussianKernel(options.radius)
    if (target.width <= 0 || target.height <= 0 || kernel.radius === 0) {
      return { surfaceId: this.id, tiles: [] }
    }
    const source = clampRect(
      {
        x: target.x - kernel.radius,
        y: target.y - kernel.radius,
        width: target.width + kernel.radius * 2,
        height: target.height + kernel.radius * 2,
      },
      this.width,
      this.height,
    )
    const touched = this.readTiles(target)
    const before = touched.map((tile) => ({
      tileX: tile.tileX,
      tileY: tile.tileY,
      width: tile.width,
      height: tile.height,
      before: tile.data.slice(),
    }))
    const snapshots = new Map<string, Uint8ClampedArray>()
    for (const tile of this.readTiles(source)) {
      snapshots.set(tileKey(tile.tileX, tile.tileY), tile.data.slice())
    }
    const read = (x: number, y: number, channel: number): number => {
      const px = Math.max(0, Math.min(this.width - 1, x))
      const py = Math.max(0, Math.min(this.height - 1, y))
      const tx = Math.floor(px / TILE_SIZE), ty = Math.floor(py / TILE_SIZE)
      const tile = this.ensureTile(tx, ty)
      const data = snapshots.get(tileKey(tx, ty)) ?? tile.data
      return data[((py - ty * TILE_SIZE) * tile.width + (px - tx * TILE_SIZE)) * 4 + channel]!
    }
    const width = source.width, height = source.height
    const tmp = new Float32Array(width * height)
    /** Horizontal pass of the separable kernel into `tmp`. */
    const horizontal = (readSample: (x: number, y: number) => number) => {
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        let sum = 0
        for (let k = -kernel.radius; k <= kernel.radius; k++) {
          sum += readSample(source.x + x + k, source.y + y) * kernel.weights[k + kernel.radius]!
        }
        tmp[y * width + x] = sum
      }
    }
    /** Vertical pass at one source-local column/row. */
    const vertical = (sx: number, sy: number): number => {
      let sum = 0
      for (let k = -kernel.radius; k <= kernel.radius; k++) {
        const yy = Math.max(0, Math.min(height - 1, sy + k))
        sum += tmp[yy * width + sx]! * kernel.weights[k + kernel.radius]!
      }
      return sum
    }
    /** Visit every writable target pixel once, tile-local. */
    const forEachTarget = (
      visit: (tile: RasterTile, index: number, sx: number, sy: number, targetIndex: number, coverage: number) => void,
    ) => {
      for (const tile of touched) {
        const ox = tile.tileX * TILE_SIZE, oy = tile.tileY * TILE_SIZE
        for (let py = Math.max(0, target.y - oy); py < Math.min(tile.height, target.y + target.height - oy); py++) {
          for (let px = Math.max(0, target.x - ox); px < Math.min(tile.width, target.x + target.width - ox); px++) {
            const lx = ox + px, ly = oy + py
            const coverage = Math.max(0, Math.min(1, options.clip?.(lx + .5, ly + .5) ?? 1))
            if (coverage === 0) continue
            visit(
              tile,
              (py * tile.width + px) * 4,
              lx - source.x,
              ly - source.y,
              (ly - target.y) * target.width + (lx - target.x),
              coverage,
            )
          }
        }
      }
    }

    // Convolving straight RGB mixes in the (0,0,0) held by transparent pixels,
    // so an isolated coloured shape grows a dark halo. Blur premultiplied and
    // unpremultiply by the blurred alpha instead. Alpha is resolved first (into
    // a target-sized buffer) because RGB needs it before it is written back.
    const blurredAlpha = new Float32Array(Math.max(1, target.width * target.height))
    horizontal((x, y) => read(x, y, 3))
    forEachTarget((_tile, _index, sx, sy, targetIndex) => {
      blurredAlpha[targetIndex] = vertical(sx, sy)
    })

    for (let channel = 0; channel < 3; channel++) {
      horizontal((x, y) => read(x, y, channel) * (read(x, y, 3) / 255))
      forEachTarget((tile, index, sx, sy, targetIndex, coverage) => {
        const dstAlpha = tile.data[index + 3]! / 255
        const outAlpha = dstAlpha + (blurredAlpha[targetIndex]! / 255 - dstAlpha) * coverage
        if (outAlpha <= 0) return
        const dstPremultiplied = tile.data[index + channel]! * dstAlpha
        const blurPremultiplied = vertical(sx, sy)
        tile.data[index + channel] = Math.round(
          (dstPremultiplied + (blurPremultiplied - dstPremultiplied) * coverage) / outAlpha,
        )
      })
    }
    forEachTarget((tile, index, _sx, _sy, targetIndex, coverage) => {
      const dstAlpha = tile.data[index + 3]!
      tile.data[index + 3] = Math.round(dstAlpha + (blurredAlpha[targetIndex]! - dstAlpha) * coverage)
    })
    for (const tile of touched) {
      tile.revision = ++this.revision
      this.markDirty(tile.tileX, tile.tileY)
    }
    return {
      surfaceId: this.id,
      tiles: before.map((snapshot) => ({
        ...snapshot,
        after: this.ensureTile(snapshot.tileX, snapshot.tileY).data.slice(),
      })),
    }
  }

  /**
   * Fill or clear pixels under a document-space selection, mapped through
   * `localToDoc`. Returns a history patch of touched tiles.
   */
  paintSelection(options: {
    /** Inclusive layer-local AABB to scan. */
    region: Rect
    mode: 'fill' | 'clear'
    color?: { r: number; g: number; b: number }
    /** Document-space coverage 0..255 at layer-local pixel center. */
    sampleDoc: (localX: number, localY: number) => number
  }): RasterPatch {
    const { region, mode, color, sampleDoc } = options
    const r = clampRect(region, this.width, this.height)
    if (r.width <= 0 || r.height <= 0) {
      return { surfaceId: this.id, tiles: [] }
    }
    const touched = this.readTiles(r)
    const beforeSnapshots = touched.map((t) => ({
      tileX: t.tileX,
      tileY: t.tileY,
      width: t.width,
      height: t.height,
      before: t.data.slice(),
    }))

    for (const tile of touched) {
      const originX = tile.tileX * TILE_SIZE
      const originY = tile.tileY * TILE_SIZE
      let changed = false
      for (let py = 0; py < tile.height; py++) {
        for (let px = 0; px < tile.width; px++) {
          const lx = originX + px
          const ly = originY + py
          if (
            lx < r.x ||
            ly < r.y ||
            lx >= r.x + r.width ||
            ly >= r.y + r.height
          ) {
            continue
          }
          const cover = sampleDoc(lx + 0.5, ly + 0.5) / 255
          if (cover <= 0) continue
          const i = (py * tile.width + px) * 4
          if (mode === 'clear') {
            tile.data[i + 3] = Math.round(tile.data[i + 3]! * (1 - cover))
          } else {
            const srcR = color?.r ?? 0
            const srcG = color?.g ?? 0
            const srcB = color?.b ?? 0
            const a = cover
            const dstA = tile.data[i + 3]! / 255
            const outA = a + dstA * (1 - a)
            if (outA > 0) {
              tile.data[i] = Math.round(
                (srcR * a + tile.data[i]! * dstA * (1 - a)) / outA,
              )
              tile.data[i + 1] = Math.round(
                (srcG * a + tile.data[i + 1]! * dstA * (1 - a)) / outA,
              )
              tile.data[i + 2] = Math.round(
                (srcB * a + tile.data[i + 2]! * dstA * (1 - a)) / outA,
              )
              tile.data[i + 3] = Math.round(outA * 255)
            }
          }
          changed = true
        }
      }
      if (changed) {
        tile.revision = ++this.revision
        this.markDirty(tile.tileX, tile.tileY)
      }
    }

    return {
      surfaceId: this.id,
      tiles: beforeSnapshots.map((snap) => {
        const tile = this.ensureTile(snap.tileX, snap.tileY)
        return {
          tileX: snap.tileX,
          tileY: snap.tileY,
          width: snap.width,
          height: snap.height,
          before: snap.before,
          after: tile.data.slice(),
        }
      }),
    }
  }

  /** Snapshot current tile bytes in `region` (before = after). */
  snapshotRegion(region: Rect): RasterPatch {
    const r = clampRect(region, this.width, this.height)
    if (r.width <= 0 || r.height <= 0) {
      return { surfaceId: this.id, tiles: [] }
    }
    const touched = this.readTiles(r)
    return {
      surfaceId: this.id,
      tiles: touched.map((t) => ({
        tileX: t.tileX,
        tileY: t.tileY,
        width: t.width,
        height: t.height,
        before: t.data.slice(),
        after: t.data.slice(),
      })),
    }
  }

  /**
   * Replace pixels in `region` by sampling a callback at layer-local centers.
   * Skips pixels when the callback returns null or alpha 0.
   */
  paintDocPixels(options: {
    region: Rect
    sample: (localX: number, localY: number) => [number, number, number, number] | null
  }): RasterPatch {
    const { region, sample } = options
    const r = clampRect(region, this.width, this.height)
    if (r.width <= 0 || r.height <= 0) {
      return { surfaceId: this.id, tiles: [] }
    }
    const touched = this.readTiles(r)
    const beforeSnapshots = touched.map((t) => ({
      tileX: t.tileX,
      tileY: t.tileY,
      width: t.width,
      height: t.height,
      before: t.data.slice(),
    }))

    for (const tile of touched) {
      const originX = tile.tileX * TILE_SIZE
      const originY = tile.tileY * TILE_SIZE
      let changed = false
      for (let py = 0; py < tile.height; py++) {
        for (let px = 0; px < tile.width; px++) {
          const lx = originX + px
          const ly = originY + py
          if (
            lx < r.x ||
            ly < r.y ||
            lx >= r.x + r.width ||
            ly >= r.y + r.height
          ) {
            continue
          }
          const src = sample(lx + 0.5, ly + 0.5)
          if (!src || src[3] <= 0) continue
          const [srcR, srcG, srcB, srcA] = src
          const i = (py * tile.width + px) * 4
          const dstA = tile.data[i + 3]! / 255
          const a = srcA / 255
          const outA = a + dstA * (1 - a)
          if (outA > 0) {
            tile.data[i] = Math.round((srcR * a + tile.data[i]! * dstA * (1 - a)) / outA)
            tile.data[i + 1] = Math.round(
              (srcG * a + tile.data[i + 1]! * dstA * (1 - a)) / outA,
            )
            tile.data[i + 2] = Math.round(
              (srcB * a + tile.data[i + 2]! * dstA * (1 - a)) / outA,
            )
            tile.data[i + 3] = Math.round(outA * 255)
          }
          changed = true
        }
      }
      if (changed) {
        tile.revision = ++this.revision
        this.markDirty(tile.tileX, tile.tileY)
      }
    }

    return {
      surfaceId: this.id,
      tiles: beforeSnapshots.map((snap) => {
        const tile = this.ensureTile(snap.tileX, snap.tileY)
        return {
          tileX: snap.tileX,
          tileY: snap.tileY,
          width: snap.width,
          height: snap.height,
          before: snap.before,
          after: tile.data.slice(),
        }
      }),
    }
  }

  applyPatch(patch: RasterPatch, direction: 'undo' | 'redo'): void {
    for (const t of patch.tiles) {
      const tile = this.ensureTile(t.tileX, t.tileY)
      const src = direction === 'undo' ? t.before : t.after
      tile.data.set(src)
      tile.revision = ++this.revision
      this.markDirty(t.tileX, t.tileY)
    }
  }

  /** Merge multiple dab patches into one history entry (touched union). */
  static mergePatches(surfaceId: string, patches: RasterPatch[]): RasterPatch {
    const byKey = new Map<
      string,
      RasterPatch['tiles'][number]
    >()
    for (const patch of patches) {
      for (const t of patch.tiles) {
        const key = tileKey(t.tileX, t.tileY)
        const existing = byKey.get(key)
        if (!existing) {
          byKey.set(key, {
            tileX: t.tileX,
            tileY: t.tileY,
            width: t.width,
            height: t.height,
            before: t.before.slice(),
            after: t.after.slice(),
          })
        } else {
          // Keep earliest before, latest after.
          existing.after = t.after.slice()
        }
      }
    }
    return { surfaceId, tiles: [...byKey.values()] }
  }

  /** Packed RGBA buffer — avoids relying on DOM `ImageData` in Bun tests. */
  toRgbaBuffer(): {
    data: Uint8ClampedArray
    width: number
    height: number
  } {
    const data = new Uint8ClampedArray(this.width * this.height * 4)
    for (const tile of this.tiles.values()) {
      const originX = tile.tileX * TILE_SIZE
      const originY = tile.tileY * TILE_SIZE
      for (let py = 0; py < tile.height; py++) {
        for (let px = 0; px < tile.width; px++) {
          const srcI = (py * tile.width + px) * 4
          const dstI = ((originY + py) * this.width + (originX + px)) * 4
          data[dstI] = tile.data[srcI]!
          data[dstI + 1] = tile.data[srcI + 1]!
          data[dstI + 2] = tile.data[srcI + 2]!
          data[dstI + 3] = tile.data[srcI + 3]!
        }
      }
    }
    return { data, width: this.width, height: this.height }
  }

  toImageData(): ImageData {
    const { data, width, height } = this.toRgbaBuffer()
    if (typeof ImageData === 'undefined') {
      return { data, width, height } as ImageData
    }
    return new ImageData(data as ImageDataArray, width, height)
  }

  async toPngBlob(): Promise<Blob> {
    const { data, width, height } = this.toRgbaBuffer()
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d unavailable')
    ctx.putImageData(new ImageData(data as ImageDataArray, width, height), 0, 0)
    return canvas.convertToBlob({ type: 'image/png' })
  }

  async toImageBitmap(): Promise<ImageBitmap> {
    const { data, width, height } = this.toRgbaBuffer()
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d unavailable')
    ctx.putImageData(new ImageData(data as ImageDataArray, width, height), 0, 0)
    return createImageBitmap(canvas)
  }
}
