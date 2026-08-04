import { getRasterSurface, registerRasterSurface } from '../RasterSurfaceStore'
import { createTransparentRasterSurface } from '../createBlankRasterSurface'
import { markRasterRecoveryDirty } from '../../persistence/rasterRecoveryDirty'
import { TILE_SIZE, TiledRasterSurface } from './TiledRasterSurface'

type SurfaceRuntime = {
  surface: TiledRasterSurface
  /** Persistent CPU staging canvas — dirty tiles are putImageData'd here. */
  canvas: OffscreenCanvas | null
  ctx: OffscreenCanvasRenderingContext2D | null
  /** rAF handle for coalesced mid-stroke flushes. */
  raf: number
  /** Invalidate callback scheduled with the next flush (viewport epoch bump). */
  onFlushed: ((surfaceId: string) => void) | null
  /** Monotonic id handed to each publish attempt, assigned before its await. */
  publishSeq: number
  /** Highest `publishSeq` that actually reached `registerRasterSurface`. */
  publishedSeq: number
}

const runtimes = new Map<string, SurfaceRuntime>()

function getRuntime(assetId: string): SurfaceRuntime | undefined {
  return runtimes.get(assetId)
}

function ensureRuntime(surface: TiledRasterSurface): SurfaceRuntime {
  let rt = runtimes.get(surface.id)
  if (rt) return rt
  rt = {
    surface,
    canvas: null,
    ctx: null,
    raf: 0,
    onFlushed: null,
    publishSeq: 0,
    publishedSeq: 0,
  }
  runtimes.set(surface.id, rt)
  return rt
}

/**
 * Register a freshly snapshotted bitmap unless a newer snapshot already won.
 *
 * `syncEditableSurfaceToBitmap` is async and can legitimately run twice
 * concurrently (the rAF flush plus the pointer-up flush). Each takes its own
 * `createImageBitmap` snapshot, and those promises can resolve out of order —
 * without this guard the earlier, pre-final-dab frame could land last and drop
 * the tail of a stroke from the viewport until the next edit.
 */
function publishBitmap(
  rt: SurfaceRuntime,
  assetId: string,
  seq: number,
  bitmap: ImageBitmap,
): void {
  if (seq <= rt.publishedSeq) {
    bitmap.close()
    return
  }
  rt.publishedSeq = seq
  registerRasterSurface({
    assetId,
    width: rt.surface.width,
    height: rt.surface.height,
    bitmap,
  })
}

function ensureStagingCanvas(rt: SurfaceRuntime): {
  canvas: OffscreenCanvas
  ctx: OffscreenCanvasRenderingContext2D
  /** True when the canvas was just seeded from the full surface. */
  fresh: boolean
} | null {
  if (typeof OffscreenCanvas === 'undefined') return null
  if (rt.canvas && rt.ctx) {
    return { canvas: rt.canvas, ctx: rt.ctx, fresh: false }
  }
  const canvas = new OffscreenCanvas(rt.surface.width, rt.surface.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: false })
  if (!ctx) return null
  // Seed from tiles once so subsequent flushes only touch dirty regions.
  const { data, width, height } = rt.surface.toRgbaBuffer()
  ctx.putImageData(new ImageData(data as ImageDataArray, width, height), 0, 0)
  rt.canvas = canvas
  rt.ctx = ctx
  return { canvas, ctx, fresh: true }
}

export function getEditableSurface(
  assetId: string,
): TiledRasterSurface | undefined {
  return runtimes.get(assetId)?.surface
}

export function setEditableSurface(surface: TiledRasterSurface): void {
  const prev = runtimes.get(surface.id)
  if (prev?.raf) {
    cancelAnimationFrame(prev.raf)
  }
  const rt = ensureRuntime(surface)
  rt.surface = surface
  rt.canvas = null
  rt.ctx = null
  rt.raf = 0
  rt.onFlushed = null
  // Retire every in-flight snapshot of the previous surface: they now describe
  // pixels this runtime no longer owns. Counters stay monotonic on purpose.
  rt.publishedSeq = rt.publishSeq
}

export function releaseEditableSurface(assetId: string): void {
  const rt = runtimes.get(assetId)
  if (rt?.raf) cancelAnimationFrame(rt.raf)
  runtimes.delete(assetId)
}

export function clearEditableSurfaces(): void {
  for (const rt of runtimes.values()) {
    if (rt.raf) cancelAnimationFrame(rt.raf)
  }
  runtimes.clear()
}

/**
 * Ensure a tiled editable surface exists for an asset, hydrating from the
 * registered ImageBitmap when needed.
 */
export async function ensureEditableSurface(
  assetId: string,
  dimensions?: { width: number; height: number },
): Promise<TiledRasterSurface | null> {
  const existing = runtimes.get(assetId)?.surface
  if (existing) return existing
  let entry = getRasterSurface(assetId)
  if (!entry && dimensions) {
    entry = await createTransparentRasterSurface(
      assetId,
      dimensions.width,
      dimensions.height,
    )
    registerRasterSurface(entry)
  }
  if (!entry) return null
  const surface = await TiledRasterSurface.fromBitmap(assetId, entry.bitmap)
  setEditableSurface(surface)
  return surface
}

/**
 * Push only dirty tiles into the staging canvas, then publish one ImageBitmap.
 * Untouched tiles are not re-packed from the tiled surface.
 */
export async function syncEditableSurfaceToBitmap(
  assetId: string,
): Promise<void> {
  markRasterRecoveryDirty(assetId)
  const rt = getRuntime(assetId)
  if (!rt) return
  const surface = rt.surface
  const staging = ensureStagingCanvas(rt)
  // Claimed before any await so publish order follows call order, not the
  // order in which `createImageBitmap` happens to resolve.
  const seq = ++rt.publishSeq

  if (staging?.fresh) {
    // Full seed already mirrors tile memory — drop dirty flags and publish.
    surface.takeDirtyTiles()
    publishBitmap(rt, assetId, seq, await createImageBitmap(staging.canvas))
    return
  }

  const dirty = surface.takeDirtyTiles()

  if (staging && dirty.length > 0) {
    for (const { tileX, tileY } of dirty) {
      const tile = surface.getTile(tileX, tileY)
      if (!tile) continue
      // Copy — ImageData may take ownership of the buffer in some engines.
      const copy = new Uint8ClampedArray(tile.data)
      staging.ctx.putImageData(
        new ImageData(copy as ImageDataArray, tile.width, tile.height),
        tileX * TILE_SIZE,
        tileY * TILE_SIZE,
      )
    }
    publishBitmap(rt, assetId, seq, await createImageBitmap(staging.canvas))
    return
  }

  if (dirty.length === 0 && staging && getRasterSurface(assetId)) {
    // Nothing changed since last flush.
    return
  }

  // Fallback when OffscreenCanvas / ImageData staging is unavailable (tests).
  publishBitmap(rt, assetId, seq, await surface.toImageBitmap())
}

/**
 * Coalesce mid-stroke bitmap + viewport invalidation to once per animation
 * frame (SPEC §11.3 interactive stroke / dirty tile uploads).
 */
export function scheduleEditableSurfaceFlush(
  assetId: string,
  onFlushed?: (surfaceId: string) => void,
): void {
  const rt = getRuntime(assetId)
  if (!rt) return
  if (onFlushed) rt.onFlushed = onFlushed
  if (rt.raf) return
  const rafFn =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number
  rt.raf = rafFn(() => {
    rt.raf = 0
    const cb = rt.onFlushed
    void syncEditableSurfaceToBitmap(assetId).then(() => {
      cb?.(assetId)
    })
  }) as number
}

/** Cancel a pending rAF flush (e.g. before a synchronous commit on pointer-up). */
export function cancelEditableSurfaceFlush(assetId: string): void {
  const rt = getRuntime(assetId)
  if (!rt?.raf) return
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(rt.raf)
  } else {
    clearTimeout(rt.raf)
  }
  rt.raf = 0
}

export function listEditableSurfaceIds(): string[] {
  return [...runtimes.keys()]
}
