import { describe, expect, test } from 'bun:test'
import { sampleGradientStops } from '../../../core/gradient/gradientSampling'
import { TiledRasterSurface } from '../../../imaging/surfaces/TiledRasterSurface'
import { gradientOffset } from './GradientToolController'

describe('Gradient Tool sampling', () => {
  test('interpolates every N-stop color and opacity stop', () => {
    const sample = sampleGradientStops(
      [
        { offset: 0, color: '#000000', opacity: 0 },
        { offset: 0.5, color: '#ff0000', opacity: 0.5 },
        { offset: 1, color: '#ffffff', opacity: 1 },
      ],
      0.75,
    )

    expect(sample.r).toBeCloseTo(255)
    expect(sample.g).toBeCloseTo(127.5)
    expect(sample.b).toBeCloseTo(127.5)
    expect(sample.opacity).toBeCloseTo(0.75)
  })

  test('maps linear and radial drags in document space', () => {
    expect(gradientOffset('linear', { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 4 })).toBeCloseTo(0.5)
    expect(gradientOffset('radial', { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 })).toBeCloseTo(0.5)
  })

  test('records a clipped fill as one tile patch', () => {
    const surface = new TiledRasterSurface('gradient-test', 3, 1)
    surface.beginStrokeCapture()
    surface.applyGradient({
      opacity: 1,
      clip: (x) => (x < 1 ? 1 : 0),
      sample: () => ({ r: 255, g: 0, b: 0, opacity: 1 }),
    })
    const patch = surface.endStrokeCapture()
    const tile = surface.getTile(0, 0)!

    expect(patch.tiles).toHaveLength(1)
    expect(tile.data.slice(0, 4)).toEqual(new Uint8ClampedArray([255, 0, 0, 255]))
    expect(tile.data.slice(4, 12)).toEqual(new Uint8ClampedArray(8))
  })

  test('fills a horizontal linear drag left-to-right', () => {
    const surface = new TiledRasterSurface('gradient-linear', 4, 1)
    const stops = [
      { offset: 0, color: '#000000', opacity: 1 },
      { offset: 1, color: '#ffffff', opacity: 1 },
    ] as const

    surface.beginStrokeCapture()
    surface.applyGradient({
      opacity: 1,
      sample: (x) => {
        const offset = gradientOffset('linear', { x: 0, y: 0 }, { x: 3, y: 0 }, { x, y: 0 })
        return sampleGradientStops(stops, offset)
      },
    })
    const patch = surface.endStrokeCapture()
    const tile = surface.getTile(0, 0)!

    expect(patch.tiles).toHaveLength(1)
    // applyGradient samples pixel centers (x + 0.5).
    expect(tile.data[0]).toBeCloseTo(43, 0)
    expect(tile.data[4]).toBeCloseTo(128, 0)
    expect(tile.data[8]).toBeCloseTo(213, 0)
    expect(tile.data[12]).toBe(255)
  })

  test('fills a radial drag from center to edge', () => {
    const surface = new TiledRasterSurface('gradient-radial', 3, 3)
    const stops = [
      { offset: 0, color: '#ff0000', opacity: 1 },
      { offset: 1, color: '#0000ff', opacity: 1 },
    ] as const

    surface.beginStrokeCapture()
    surface.applyGradient({
      opacity: 1,
      sample: (x, y) => {
        const offset = gradientOffset('radial', { x: 1, y: 1 }, { x: 3, y: 1 }, { x, y })
        return sampleGradientStops(stops, offset)
      },
    })
    const patch = surface.endStrokeCapture()
    const tile = surface.getTile(0, 0)!

    expect(patch.tiles).toHaveLength(1)
    expect(tile.data[0]).toBeCloseTo(165, 0)
    expect(tile.data[1]).toBeCloseTo(0, 0)
    expect(tile.data[2]).toBeCloseTo(90, 0)
    expect(tile.data[32]).toBe(0)
    expect(tile.data[33]).toBe(0)
    expect(tile.data[34]).toBe(255)
  })
})
