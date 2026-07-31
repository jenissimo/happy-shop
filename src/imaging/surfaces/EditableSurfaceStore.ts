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
  }
  runtimes.set(surface.id, rt)
  return rt
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

  if (staging?.fresh) {
    // Full seed already mirrors tile memory — drop dirty flags and publish.
    surface.takeDirtyTiles()
    const bitmap = await createImageBitmap(staging.canvas)
    registerRasterSurface({
      assetId,
      width: surface.width,
      height: surface.height,
      bitmap,
    })
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
    const bitmap = await createImageBitmap(staging.canvas)
    registerRasterSurface({
      assetId,
      width: surface.width,
      height: surface.height,
      bitmap,
    })
    return
  }

  if (dirty.length === 0 && staging && getRasterSurface(assetId)) {
    // Nothing changed since last flush.
    return
  }

  // Fallback when OffscreenCanvas / ImageData staging is unavailable (tests).
  const bitmap = await surface.toImageBitmap()
  registerRasterSurface({
    assetId,
    width: surface.width,
    height: surface.height,
    bitmap,
  })
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
