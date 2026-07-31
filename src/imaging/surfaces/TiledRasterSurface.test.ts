import { describe, expect, test } from 'bun:test'
import { TiledRasterSurface } from './TiledRasterSurface'

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
    expect(blurred[(8 * 16 + 8) * 4]).toBeGreaterThan(0)
    expect(blurred[(8 * 16 + 8) * 4]).toBeLessThan(255)
    expect(blurred[(8 * 16 + 9) * 4]).toBe(0)

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
})
