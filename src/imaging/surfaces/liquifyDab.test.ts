import { describe, expect, test } from 'bun:test'
import { TiledRasterSurface } from './TiledRasterSurface'

/**
 * A displaced pixel is "vacated" via ALPHA, not by its RGB going black.
 * Liquify lerps in premultiplied space, so the colour stays put while the
 * coverage drains — asserting on the colour channel would re-encode the old
 * dark-fringe bug.
 */
function vacated(surface: TiledRasterSurface, x: number, y: number): boolean {
  return pixel(surface, x, y)[3]! < 50
}

function pixel(surface: TiledRasterSurface, x: number, y: number): number[] {
  const data = surface.toRgbaBuffer().data
  const i = (y * surface.width + x) * 4
  return [...data.slice(i, i + 4)]
}

describe('liquify dabs', () => {
  test('forward warp pushes pixels along stroke direction', () => {
    const surface = new TiledRasterSurface('liquify-warp', 32, 32)
    surface.writeRegion({ x: 10, y: 16, width: 1, height: 1 }, new Uint8ClampedArray([0, 0, 255, 255]))

    surface.liquifyDab({
      kind: 'warp',
      x: 14,
      y: 16,
      previous: { x: 10, y: 16 },
      radius: 6,
      strength: 1,
    })

    expect(pixel(surface, 14, 16)[2]).toBeGreaterThan(200)
    expect(vacated(surface, 10, 16)).toBe(true)
    // Hue survives the vacate — the pixel goes transparent, not black.
    expect(pixel(surface, 10, 16)[2]).toBe(255)
  })

  test('reconstruct blends back toward stroke-start snapshot', () => {
    const surface = new TiledRasterSurface('liquify-reconstruct', 16, 16)
    const snapshot = new Uint8ClampedArray(16 * 16 * 4)
    snapshot.fill(255)
    const i = (8 * 16 + 8) * 4
    snapshot[i] = 240
    snapshot[i + 1] = 20
    snapshot[i + 2] = 10
    snapshot[i + 3] = 255

    surface.writeRegion({ x: 8, y: 8, width: 1, height: 1 }, new Uint8ClampedArray([255, 255, 255, 255]))
    surface.liquifyDab({
      kind: 'reconstruct',
      x: 8,
      y: 8,
      radius: 3,
      strength: 1,
      strokeSnapshot: snapshot,
    })

    expect(pixel(surface, 8, 8)).toEqual([240, 20, 10, 255])
  })

  test('bloat bulges pixels outward from brush center', () => {
    const surface = new TiledRasterSurface('liquify-bloat', 32, 32)
    surface.writeRegion({ x: 16, y: 14, width: 1, height: 1 }, new Uint8ClampedArray([0, 0, 255, 255]))

    surface.liquifyDab({
      kind: 'bloat',
      x: 16,
      y: 16,
      radius: 8,
      strength: 1,
    })

    expect(pixel(surface, 16, 12)[2]).toBeGreaterThan(200)
    expect(vacated(surface, 16, 14)).toBe(true)
  })

  test('pucker pinches pixels inward toward brush center', () => {
    const surface = new TiledRasterSurface('liquify-pucker', 32, 32)
    surface.writeRegion({ x: 16, y: 12, width: 1, height: 1 }, new Uint8ClampedArray([0, 0, 255, 255]))

    surface.liquifyDab({
      kind: 'pucker',
      x: 16,
      y: 16,
      radius: 8,
      strength: 1,
    })

    expect(pixel(surface, 16, 14)[2]).toBeGreaterThan(200)
    expect(vacated(surface, 16, 12)).toBe(true)
  })

  test('twirl rotates pixels around brush center', () => {
    const surface = new TiledRasterSurface('liquify-twirl', 32, 32)
    surface.writeRegion({ x: 18, y: 16, width: 1, height: 1 }, new Uint8ClampedArray([0, 0, 255, 255]))

    surface.liquifyDab({
      kind: 'twirl',
      x: 16,
      y: 16,
      radius: 8,
      strength: 1,
    })

    expect(vacated(surface, 18, 16)).toBe(true)
    expect(pixel(surface, 16, 18)[2]).toBeGreaterThan(200)
  })

  test('warp respects zero strength as a no-op', () => {
    const surface = new TiledRasterSurface('liquify-noop', 16, 16)
    surface.writeRegion({ x: 8, y: 8, width: 1, height: 1 }, new Uint8ClampedArray([100, 50, 25, 255]))
    const before = pixel(surface, 8, 8)

    surface.liquifyDab({
      kind: 'warp',
      x: 8,
      y: 8,
      previous: { x: 4, y: 8 },
      radius: 4,
      strength: 0,
    })

    expect(pixel(surface, 8, 8)).toEqual(before)
  })

  test('freeze paints session A8 pin mask', () => {
    const surface = new TiledRasterSurface('liquify-freeze', 16, 16)
    const mask = new Uint8Array(16 * 16)

    surface.liquifyDab({
      kind: 'freeze',
      x: 8,
      y: 8,
      radius: 4,
      strength: 1,
      freezeMaskWrite: mask,
    })

    expect(mask[8 * 16 + 8]).toBeGreaterThan(200)
    expect(mask[0]).toBe(0)
  })

  test('thaw clears painted pin mask', () => {
    const surface = new TiledRasterSurface('liquify-thaw', 16, 16)
    const mask = new Uint8Array(16 * 16)
    mask.fill(255)

    surface.liquifyDab({
      kind: 'thaw',
      x: 8,
      y: 8,
      radius: 4,
      strength: 1,
      freezeMaskWrite: mask,
    })

    expect(mask[8 * 16 + 8]).toBeLessThan(50)
    expect(mask[0]).toBe(255)
  })

  test('warp skips destination pixels covered by freeze mask', () => {
    const surface = new TiledRasterSurface('liquify-freeze-warp', 32, 32)
    surface.writeRegion({ x: 10, y: 16, width: 1, height: 1 }, new Uint8ClampedArray([0, 0, 255, 255]))
    const freezeMask = new Uint8Array(32 * 32)
    freezeMask[16 * 32 + 14] = 255

    surface.liquifyDab({
      kind: 'warp',
      x: 14,
      y: 16,
      previous: { x: 10, y: 16 },
      radius: 6,
      strength: 1,
      freezeMask,
    })

    expect(pixel(surface, 14, 16)[3]).toBe(0)
    expect(vacated(surface, 10, 16)).toBe(true)
  })
})
