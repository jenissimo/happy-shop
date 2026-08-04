import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  clearRasterSurfaceStore,
  getRasterSurface,
} from '../RasterSurfaceStore'
import {
  clearEditableSurfaces,
  setEditableSurface,
  syncEditableSurfaceToBitmap,
} from './EditableSurfaceStore'
import { TiledRasterSurface } from './TiledRasterSurface'

type StubBitmap = ImageBitmap & { readonly token: number; closed: boolean }

class TestCanvas {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  getContext() {
    return { putImageData() {} }
  }
}

class TestImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

/**
 * Deferred `createImageBitmap` so the test controls resolve order — the whole
 * point of the publish guard is that resolve order may not match call order.
 */
type BitmapQueue = {
  pending: Array<{ bitmap: StubBitmap; resolve: () => void }>
  restore: () => void
}

function installDeferredBitmaps(): BitmapQueue {
  const globals = globalThis as typeof globalThis & {
    OffscreenCanvas?: typeof OffscreenCanvas
    ImageData?: typeof ImageData
    createImageBitmap?: typeof createImageBitmap
  }
  const prior = {
    OffscreenCanvas: globals.OffscreenCanvas,
    ImageData: globals.ImageData,
    createImageBitmap: globals.createImageBitmap,
  }
  const pending: BitmapQueue['pending'] = []
  let token = 0
  globals.OffscreenCanvas = TestCanvas as unknown as typeof OffscreenCanvas
  globals.ImageData = TestImageData as unknown as typeof ImageData
  globals.createImageBitmap = (() => {
    const bitmap = {
      token: ++token,
      closed: false,
      close() {
        bitmap.closed = true
      },
    } as unknown as StubBitmap
    return new Promise<StubBitmap>((resolveBitmap) => {
      pending.push({ bitmap, resolve: () => resolveBitmap(bitmap) })
    })
  }) as typeof createImageBitmap

  return {
    pending,
    restore: () => {
      globals.OffscreenCanvas = prior.OffscreenCanvas
      globals.ImageData = prior.ImageData
      globals.createImageBitmap = prior.createImageBitmap
    },
  }
}

/** Let queued microtasks settle after resolving a deferred bitmap. */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve()
}

describe('syncEditableSurfaceToBitmap publish ordering', () => {
  let queue: BitmapQueue

  beforeEach(() => {
    clearEditableSurfaces()
    clearRasterSurfaceStore()
    queue = installDeferredBitmaps()
  })

  afterEach(() => {
    clearEditableSurfaces()
    clearRasterSurfaceStore()
    queue.restore()
  })

  function stamp(surface: TiledRasterSurface, x: number): void {
    surface.stampBrush({
      x,
      y: 8,
      radius: 3,
      hardness: 1,
      opacity: 1,
      color: { r: 255, g: 0, b: 0 },
      mode: 'paint',
    })
  }

  test('an out-of-order resolve cannot overwrite a newer frame', async () => {
    const surface = new TiledRasterSurface('publish', 32, 32)
    setEditableSurface(surface)

    // Seed publish (staging canvas creation) — resolve it so later flushes take
    // the dirty-tile path a real stroke would.
    const seed = syncEditableSurfaceToBitmap('publish')
    queue.pending[0]!.resolve()
    await seed
    expect((getRasterSurface('publish')?.bitmap as StubBitmap).token).toBe(1)

    // Mid-stroke rAF flush.
    stamp(surface, 8)
    const midStroke = syncEditableSurfaceToBitmap('publish')
    // Final dab, then the pointer-up flush.
    stamp(surface, 20)
    const final = syncEditableSurfaceToBitmap('publish')

    expect(queue.pending).toHaveLength(3)
    const midBitmap = queue.pending[1]!.bitmap
    const finalBitmap = queue.pending[2]!.bitmap

    // Resolve the newer snapshot first, the stale one second.
    queue.pending[2]!.resolve()
    await settle()
    queue.pending[1]!.resolve()
    await settle()
    await Promise.all([midStroke, final])

    const published = getRasterSurface('publish')?.bitmap as StubBitmap
    expect(published.token).toBe(finalBitmap.token)
    // The loser is disposed rather than leaked.
    expect(midBitmap.closed).toBe(true)
    expect(finalBitmap.closed).toBe(false)
  })

  test('in-order resolves publish the newest frame', async () => {
    const surface = new TiledRasterSurface('ordered', 32, 32)
    setEditableSurface(surface)

    const seed = syncEditableSurfaceToBitmap('ordered')
    queue.pending[0]!.resolve()
    await seed

    stamp(surface, 8)
    const first = syncEditableSurfaceToBitmap('ordered')
    stamp(surface, 20)
    const second = syncEditableSurfaceToBitmap('ordered')

    queue.pending[1]!.resolve()
    await settle()
    queue.pending[2]!.resolve()
    await settle()
    await Promise.all([first, second])

    const published = getRasterSurface('ordered')?.bitmap as StubBitmap
    expect(published.token).toBe(queue.pending[2]!.bitmap.token)
  })
})
