import { describe, expect, test } from 'bun:test'
import { TiledRasterSurface } from './TiledRasterSurface'

/** Fully covered square stamp source, so results isolate the stamping math. */
function solidTipAlpha(size: number) {
  return { data: new Uint8ClampedArray(size * size).fill(255), width: size, height: size }
}

/**
 * Counts Float32Array constructions during `run`. The only Float32Array a
 * brush stroke can allocate is the per-tile stroke coverage buffer, so this
 * observes the lazy-allocation guard without exposing surface internals.
 */
function countFloat32Allocations(run: () => void): number {
  const globals = globalThis as typeof globalThis & {
    Float32Array: Float32ArrayConstructor
  }
  const original = globals.Float32Array
  let allocations = 0
  class CountingFloat32Array extends original {
    constructor(length: number) {
      super(length)
      allocations++
    }
  }
  globals.Float32Array = CountingFloat32Array as unknown as Float32ArrayConstructor
  try {
    run()
  } finally {
    globals.Float32Array = original
  }
  return allocations
}

describe('TiledRasterSurface', () => {
  test('writeRegion and readTiles round-trip a small rect', () => {
    const surface = new TiledRasterSurface('s1', 64, 64)
    const rgba = new Uint8ClampedArray(4 * 4 * 4)
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 255
      rgba[i + 3] = 255
    }
    surface.writeRegion({ x: 10, y: 10, width: 4, height: 4 }, rgba)
    const tiles = surface.readTiles({ x: 10, y: 10, width: 4, height: 4 })
    expect(tiles.length).toBe(1)
    const img = surface.toRgbaBuffer()
    const i = (10 * 64 + 10) * 4
    expect(img.data[i]).toBe(255)
    expect(img.data[i + 3]).toBe(255)
  })

  test('stampBrush returns only touched tile patches', () => {
    const surface = new TiledRasterSurface('s1', 100, 100)
    const patch = surface.stampBrush({
      x: 20,
      y: 20,
      radius: 5,
      hardness: 1,
      opacity: 1,
      color: { r: 0, g: 255, b: 0 },
      mode: 'paint',
    })
    expect(patch.tiles.length).toBeGreaterThanOrEqual(1)
    expect(patch.tiles.length).toBeLessThanOrEqual(4)
    const img = surface.toRgbaBuffer()
    const i = (20 * 100 + 20) * 4
    expect(img.data[i + 1]).toBeGreaterThan(200)
  })

  test('undo patch restores prior tiles', () => {
    const surface = new TiledRasterSurface('s1', 32, 32)
    const patch = surface.stampBrush({
      x: 16,
      y: 16,
      radius: 4,
      hardness: 1,
      opacity: 1,
      color: { r: 255, g: 0, b: 0 },
      mode: 'paint',
    })
    surface.applyPatch(patch, 'undo')
    const img = surface.toRgbaBuffer()
    const i = (16 * 32 + 16) * 4
    expect(img.data[i + 3]).toBe(0)
  })

  test('stampBrush clip suppresses dabs outside the mask', () => {
    const surface = new TiledRasterSurface('clip', 32, 32)
    const patch = surface.stampBrush({
      x: 16,
      y: 16,
      radius: 8,
      hardness: 1,
      opacity: 1,
      color: { r: 255, g: 0, b: 0 },
      mode: 'paint',
      clip: (lx, ly) => (lx < 16 ? 1 : 0),
    })
    expect(patch.tiles.length).toBeGreaterThanOrEqual(1)
    const img = surface.toRgbaBuffer()
    expect(img.data[(16 * 32 + 12) * 4 + 3]).toBeGreaterThan(200)
    expect(img.data[(16 * 32 + 20) * 4 + 3]).toBe(0)
  })

  test('gaussianBlur changes only clipped pixels and returns one undo patch', () => {
    const surface = new TiledRasterSurface('gaussian', 16, 16)
    surface.writeRegion(
      { x: 8, y: 8, width: 1, height: 1 },
      new Uint8ClampedArray([255, 0, 0, 255]),
    )
    const patch = surface.gaussianBlur({
      region: { x: 6, y: 6, width: 5, height: 5 },
      radius: 2,
      clip: (x) => (x < 9 ? 1 : 0),
    })

    expect(patch.tiles).toHaveLength(1)
    const blurred = surface.toRgbaBuffer().data
    // Premultiplied convolution: alpha spreads, hue survives.
    expect(blurred[(8 * 16 + 8) * 4]).toBe(255)
    expect(blurred[(8 * 16 + 8) * 4 + 3]).toBeGreaterThan(0)
    expect(blurred[(8 * 16 + 8) * 4 + 3]).toBeLessThan(255)
    expect(blurred[(8 * 16 + 9) * 4]).toBe(0)
    expect(blurred[(8 * 16 + 9) * 4 + 3]).toBe(0)

    surface.applyPatch(patch, 'undo')
    expect(surface.toRgbaBuffer().data[(8 * 16 + 8) * 4]).toBe(255)
  })

  test('paintSelection fill and clear honor sampleDoc', () => {
    const surface = new TiledRasterSurface('sel', 16, 16)
    surface.paintSelection({
      region: { x: 0, y: 0, width: 16, height: 16 },
      mode: 'fill',
      color: { r: 0, g: 0, b: 255 },
      sampleDoc: (lx, ly) => (lx >= 4 && lx < 8 && ly >= 4 && ly < 8 ? 255 : 0),
    })
    let img = surface.toRgbaBuffer()
    expect(img.data[(5 * 16 + 5) * 4 + 2]).toBe(255)
    expect(img.data[(5 * 16 + 5) * 4 + 3]).toBe(255)
    expect(img.data[(1 * 16 + 1) * 4 + 3]).toBe(0)

    surface.paintSelection({
      region: { x: 0, y: 0, width: 16, height: 16 },
      mode: 'clear',
      sampleDoc: (lx, ly) => (lx >= 4 && lx < 8 && ly >= 4 && ly < 8 ? 255 : 0),
    })
    img = surface.toRgbaBuffer()
    expect(img.data[(5 * 16 + 5) * 4 + 3]).toBe(0)
  })

  test('mergePatches keeps earliest before and latest after', () => {
    const surface = new TiledRasterSurface('s1', 32, 32)
    const a = surface.stampBrush({
      x: 8,
      y: 8,
      radius: 3,
      hardness: 1,
      opacity: 1,
      color: { r: 255, g: 0, b: 0 },
      mode: 'paint',
    })
    const b = surface.stampBrush({
      x: 9,
      y: 9,
      radius: 3,
      hardness: 1,
      opacity: 1,
      color: { r: 0, g: 0, b: 255 },
      mode: 'paint',
    })
    const merged = TiledRasterSurface.mergePatches('s1', [a, b])
    expect(merged.tiles.length).toBeGreaterThanOrEqual(1)
    surface.applyPatch(merged, 'undo')
    const img = surface.toRgbaBuffer()
    expect(img.data[(8 * 32 + 8) * 4 + 3]).toBe(0)
  })

  test('stroke capture defers history copies until endStrokeCapture', () => {
    const surface = new TiledRasterSurface('stroke', 64, 64)
    surface.beginStrokeCapture()
    const mid = surface.stampBrush({
      x: 20,
      y: 20,
      radius: 4,
      hardness: 1,
      opacity: 1,
      color: { r: 0, g: 255, b: 0 },
      mode: 'paint',
    })
    expect(mid.tiles.length).toBe(0)
    surface.stampBrush({
      x: 24,
      y: 20,
      radius: 4,
      hardness: 1,
      opacity: 1,
      color: { r: 0, g: 255, b: 0 },
      mode: 'paint',
    })
    const patch = surface.endStrokeCapture()
    expect(patch.tiles.length).toBeGreaterThanOrEqual(1)
    const img = surface.toRgbaBuffer()
    expect(img.data[(20 * 64 + 20) * 4 + 1]).toBeGreaterThan(200)
    surface.applyPatch(patch, 'undo')
    const undone = surface.toRgbaBuffer()
    expect(undone.data[(20 * 64 + 20) * 4 + 3]).toBe(0)
  })

  test('takeDirtyTiles reports only changed tiles after stamps', () => {
    const surface = new TiledRasterSurface('dirty', 600, 600)
    surface.takeDirtyTiles()
    surface.stampBrush({
      x: 10,
      y: 10,
      radius: 3,
      hardness: 1,
      opacity: 1,
      color: { r: 255, g: 0, b: 0 },
      mode: 'paint',
    })
    const dirty = surface.takeDirtyTiles()
    expect(dirty.length).toBe(1)
    expect(dirty[0]).toEqual({ tileX: 0, tileY: 0 })
    expect(surface.takeDirtyTiles().length).toBe(0)
  })

  test('stampTip analytic path is byte-identical to stampBrush', () => {
    const options = {
      x: 24,
      y: 20,
      radius: 9,
      hardness: 0.55,
      opacity: 0.7,
      color: { r: 18, g: 80, b: 190 },
      mode: 'paint' as const,
    }
    const brush = new TiledRasterSurface('brush', 64, 64)
    const tip = new TiledRasterSurface('tip', 64, 64)
    brush.stampBrush(options)
    tip.stampTip({ ...options, angle: 0, roundness: 1, alpha: null })
    expect(tip.toRgbaBuffer().data).toEqual(brush.toRgbaBuffer().data)
  })

  test('stampTip analytic path rotates an elliptical tip', () => {
    const options = {
      x: 32,
      y: 32,
      radius: 12,
      roundness: 0.25,
      hardness: 1,
      opacity: 1,
      color: { r: 18, g: 80, b: 190 },
      mode: 'paint' as const,
      alpha: null,
    }
    const horizontal = new TiledRasterSurface('horizontal', 64, 64)
    const vertical = new TiledRasterSurface('vertical', 64, 64)
    horizontal.stampTip({ ...options, angle: 0 })
    vertical.stampTip({ ...options, angle: 90 })

    const h = horizontal.toRgbaBuffer().data
    const v = vertical.toRgbaBuffer().data
    const alphaAt = (data: Uint8ClampedArray, x: number, y: number) =>
      data[(y * 64 + x) * 4 + 3]!

    expect(alphaAt(h, 42, 32)).toBeGreaterThan(200)
    expect(alphaAt(h, 32, 42)).toBe(0)
    expect(alphaAt(v, 42, 32)).toBe(0)
    expect(alphaAt(v, 32, 42)).toBeGreaterThan(200)
  })

  test('stampTip textured path re-bakes the mip when hardness changes', () => {
    // Same tip id, angle and roundness: only hardness differs. A cache key that
    // ignores hardness would replay the first stamp's baked falloff.
    const alpha = solidTipAlpha(64)
    const surface = new TiledRasterSurface('hardness', 128, 128)
    const options = {
      radius: 16,
      angle: 0,
      roundness: 1,
      opacity: 1,
      color: { r: 0, g: 0, b: 0 },
      mode: 'paint' as const,
      alpha,
      tipId: 'test.solid',
    }
    surface.stampTip({ ...options, x: 32, y: 32, hardness: 1 })
    surface.stampTip({ ...options, x: 96, y: 96, hardness: 0 })
    const data = surface.toRgbaBuffer().data
    const alphaAt = (x: number, y: number) => data[(y * 128 + x) * 4 + 3]!
    // 12 px from centre on a 16 px radius: hard stays opaque, soft feathers.
    const hard = alphaAt(32 + 12, 32)
    const soft = alphaAt(96 + 12, 96)
    expect(hard).toBeGreaterThan(200)
    expect(soft).toBeLessThan(hard - 20)
    // And re-stamping the hard variant still yields the hard falloff.
    surface.stampTip({ ...options, x: 32, y: 96, hardness: 1 })
    expect(surface.toRgbaBuffer().data[(96 * 128 + 32 + 12) * 4 + 3]).toBe(hard)
  })

  test('stampTip textured path honours the requested radius, not the mip bucket', () => {
    // radius 10 → diameter 20 → power-of-two mip bucket 32. Blitting the mip 1:1
    // would paint a 32 px dab for every size in the 17..32 octave.
    const alpha = solidTipAlpha(32)
    const surface = new TiledRasterSurface('radius', 64, 64)
    surface.stampTip({
      x: 32,
      y: 32,
      radius: 10,
      angle: 0,
      roundness: 1,
      hardness: 1,
      opacity: 1,
      color: { r: 0, g: 0, b: 0 },
      mode: 'paint',
      alpha,
      tipId: 'test.solid',
    })
    const data = surface.toRgbaBuffer().data
    const alphaAt = (x: number, y: number) => data[(y * 64 + x) * 4 + 3]!
    expect(alphaAt(32 + 8, 32)).toBeGreaterThan(200)
    expect(alphaAt(32 + 12, 32)).toBe(0)
    expect(alphaAt(32, 32 + 12)).toBe(0)

    // Two sizes inside one octave must differ.
    const bigger = new TiledRasterSurface('radius-2', 64, 64)
    bigger.stampTip({
      x: 32,
      y: 32,
      radius: 15,
      angle: 0,
      roundness: 1,
      hardness: 1,
      opacity: 1,
      color: { r: 0, g: 0, b: 0 },
      mode: 'paint',
      alpha,
      tipId: 'test.solid',
    })
    expect(bigger.toRgbaBuffer().data[(32 * 64 + 32 + 12) * 4 + 3]).toBeGreaterThan(200)
  })

  test('stampSquare paints a hard block without fringe alpha', () => {
    const surface = new TiledRasterSurface('square', 16, 16)
    surface.stampSquare({
      x: 8.5,
      y: 8.5,
      size: 2,
      opacity: 1,
      color: { r: 255, g: 0, b: 0 },
      mode: 'paint',
    })
    const img = surface.toRgbaBuffer()
    expect(img.data[(7 * 16 + 7) * 4 + 3]).toBe(255)
    expect(img.data[(7 * 16 + 8) * 4 + 3]).toBe(255)
    expect(img.data[(8 * 16 + 7) * 4 + 3]).toBe(255)
    expect(img.data[(8 * 16 + 8) * 4 + 3]).toBe(255)
    expect(img.data[(6 * 16 + 7) * 4 + 3]).toBe(0)
  })

  test('gaussianBlur keeps the hue of an isolated blob at its faded edge', () => {
    const surface = new TiledRasterSurface('halo', 32, 32)
    const yellow = new Uint8ClampedArray(6 * 6 * 4)
    for (let i = 0; i < yellow.length; i += 4) {
      yellow[i] = 255
      yellow[i + 1] = 220
      yellow[i + 2] = 0
      yellow[i + 3] = 255
    }
    surface.writeRegion({ x: 12, y: 12, width: 6, height: 6 }, yellow)

    surface.gaussianBlur({ region: { x: 6, y: 6, width: 18, height: 18 }, radius: 3 })

    const data = surface.toRgbaBuffer().data
    const at = (x: number, y: number) => {
      const i = (y * 32 + x) * 4
      return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
    }

    // Every pixel the blur reached must still read as the same yellow: only
    // alpha may fall off. A straight-alpha convolution would drag these toward
    // olive/black by mixing in the (0,0,0) of transparent neighbours.
    const outside = at(10, 15)
    expect(outside[3]).toBeGreaterThan(0)
    expect(outside[3]).toBeLessThan(255)
    expect(outside[0]).toBe(255)
    expect(outside[1]).toBe(220)
    expect(outside[2]).toBe(0)

    const edge = at(12, 15)
    expect(edge[0]).toBe(255)
    expect(edge[1]).toBe(220)
    expect(edge[2]).toBe(0)

    // The core stays fully opaque-ish and unshifted as well.
    expect(at(15, 15)[0]).toBe(255)
    expect(at(15, 15)[1]).toBe(220)
  })

  test('retouch blur keeps the hue of an isolated blob at its faded edge', () => {
    const surface = new TiledRasterSurface('retouch-halo', 32, 32)
    const yellow = new Uint8ClampedArray(6 * 6 * 4)
    for (let i = 0; i < yellow.length; i += 4) {
      yellow[i] = 255
      yellow[i + 1] = 220
      yellow[i + 2] = 0
      yellow[i + 3] = 255
    }
    surface.writeRegion({ x: 12, y: 12, width: 6, height: 6 }, yellow)

    surface.retouchDab({ kind: 'blur', x: 12, y: 15, radius: 4, strength: 1 })

    const data = surface.toRgbaBuffer().data
    const i = (15 * 32 + 11) * 4
    expect(data[i + 3]!).toBeGreaterThan(0)
    expect(data[i + 3]!).toBeLessThan(255)
    expect(data[i]).toBe(255)
    expect(data[i + 1]).toBe(220)
    expect(data[i + 2]).toBe(0)
  })

  test('the stroke ceiling is scaled by selection coverage', () => {
    const surface = new TiledRasterSurface('feather', 32, 32)
    // A 25%-feathered selection band across the whole surface.
    const clip = () => 0.25
    surface.beginStrokeCapture({ opacityCeiling: 1 })
    // Scrub back and forth over the same band many times.
    for (let pass = 0; pass < 12; pass++) {
      surface.stampBrush({
        x: pass % 2 === 0 ? 14 : 18,
        y: 16,
        radius: 6,
        hardness: 1,
        opacity: 1,
        color: { r: 255, g: 0, b: 0 },
        mode: 'paint',
        clip,
      })
    }
    surface.endStrokeCapture()

    const alpha = surface.toRgbaBuffer().data[(16 * 32 + 16) * 4 + 3]!
    // coverage x opacity = 0.25 -> 64/255, never the full 255 of a raw ceiling.
    expect(alpha).toBeLessThanOrEqual(65)
    expect(alpha).toBeGreaterThan(60)
  })

  test('a partial opacity ceiling still binds under a full selection', () => {
    const surface = new TiledRasterSurface('ceiling', 32, 32)
    surface.beginStrokeCapture({ opacityCeiling: 0.4 })
    for (let pass = 0; pass < 12; pass++) {
      surface.stampBrush({
        x: pass % 2 === 0 ? 14 : 18,
        y: 16,
        radius: 6,
        hardness: 1,
        opacity: 0.4,
        color: { r: 255, g: 0, b: 0 },
        mode: 'paint',
      })
    }
    surface.endStrokeCapture()
    const alpha = surface.toRgbaBuffer().data[(16 * 32 + 16) * 4 + 3]!
    expect(alpha).toBeLessThanOrEqual(103)
    expect(alpha).toBeGreaterThan(98)
  })

  test('a ceiling that cannot bind allocates no coverage buffer', () => {
    const stroke = (options: { opacityCeiling: number; clip?: () => number }) =>
      countFloat32Allocations(() => {
        const surface = new TiledRasterSurface('alloc', 1024, 1024)
        surface.beginStrokeCapture({ opacityCeiling: options.opacityCeiling })
        for (let x = 8; x < 1000; x += 64) {
          surface.stampBrush({
            x,
            y: 16,
            radius: 6,
            hardness: 1,
            opacity: options.opacityCeiling,
            color: { r: 255, g: 0, b: 0 },
            mode: 'paint',
            clip: options.clip,
          })
        }
        surface.endStrokeCapture()
      })

    // Ceiling 1 with no selection is mathematically a no-op — it must not cost
    // a 1 MiB Float32Array per touched tile.
    expect(stroke({ opacityCeiling: 1 })).toBe(0)
    // A feathered selection makes the same ceiling bind again (item 3).
    expect(stroke({ opacityCeiling: 1, clip: () => 0.25 })).toBeGreaterThan(0)
    expect(stroke({ opacityCeiling: 0.5 })).toBeGreaterThan(0)
  })
})
