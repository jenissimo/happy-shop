import { describe, expect, test } from 'bun:test'
import { TiledRasterSurface } from './TiledRasterSurface'

function pixel(surface: TiledRasterSurface, x: number, y: number): number[] {
  const data = surface.toRgbaBuffer().data
  const i = (y * surface.width + x) * 4
  return [...data.slice(i, i + 4)]
}

describe('retouch dabs', () => {
  test('clone maps source offset deterministically', () => {
    const surface = new TiledRasterSurface('clone', 16, 16)
    surface.writeRegion({ x: 2, y: 2, width: 1, height: 1 }, new Uint8ClampedArray([250, 20, 10, 255]))
    surface.retouchDab({ kind: 'clone', x: 10, y: 10, radius: 1, strength: 1, source: { x: 2, y: 2 } })
    expect(pixel(surface, 10, 10)).toEqual([250, 20, 10, 255])
  })

  test('clone can sample a different tiled surface', () => {
    const destination = new TiledRasterSurface('destination', 16, 16)
    const source = new TiledRasterSurface('source', 16, 16)
    source.writeRegion({ x: 2, y: 2, width: 1, height: 1 }, new Uint8ClampedArray([20, 180, 90, 255]))

    destination.retouchDab({
      kind: 'clone',
      x: 10,
      y: 10,
      radius: 1,
      strength: 1,
      sourceSample: (x, y) => source.sampleRgba(x - 8, y - 8),
    })

    expect(pixel(destination, 10, 10)).toEqual([20, 180, 90, 255])
  })

  test('same-layer healing uses offset source sampling', () => {
    const surface = new TiledRasterSurface('heal-same', 16, 16)
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      surface.writeRegion({ x, y, width: 1, height: 1 }, new Uint8ClampedArray([180, 130, 80, 255]))
    }
    surface.writeRegion({ x: 4, y: 4, width: 1, height: 1 }, new Uint8ClampedArray([255, 70, 180, 255]))

    surface.retouchDab({
      kind: 'heal',
      x: 10,
      y: 10,
      radius: 1,
      strength: 1,
      source: { x: 4, y: 4 },
    })

    const healed = pixel(surface, 10, 10)
    const warm = [180, 130, 80, 255]
    const detail = [255, 70, 180, 255]
    expect(healed).not.toEqual(warm)
    expect(healed).not.toEqual(detail)
    expect(healed[0]).toBeGreaterThan(warm[0]!)
  })

  test('source-aware healing transfers detail without cloning source tone', () => {
    const surface = new TiledRasterSurface('heal', 16, 16)
    // Destination is a flat warm tone; source is cool with a red detail pixel.
    surface.writeRegion({ x: 0, y: 0, width: 16, height: 16 }, new Uint8ClampedArray(16 * 16 * 4).fill(255))
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      surface.writeRegion({ x, y, width: 1, height: 1 }, new Uint8ClampedArray([180, 130, 80, 255]))
    }
    const source = new TiledRasterSurface('heal-source', 16, 16)
    source.writeRegion({ x: 0, y: 0, width: 16, height: 16 }, new Uint8ClampedArray(16 * 16 * 4).fill(255))
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      source.writeRegion({ x, y, width: 1, height: 1 }, new Uint8ClampedArray([20, 70, 180, 255]))
    }
    source.writeRegion({ x: 4, y: 4, width: 1, height: 1 }, new Uint8ClampedArray([255, 70, 180, 255]))

    surface.retouchDab({
      kind: 'heal',
      x: 10,
      y: 10,
      radius: 3,
      strength: 1,
      sourceSample: (x, y) => source.sampleRgba(x - 6, y - 6),
    })

    const healed = pixel(surface, 10, 10)
    expect(healed[0]).toBeGreaterThan(180)
    expect(healed[1]).toBe(130)
    expect(healed[2]).toBe(80)
  })

  test('spot healing still uses local blur without a source', () => {
    const surface = new TiledRasterSurface('spot-heal', 16, 16)
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      surface.writeRegion({ x, y, width: 1, height: 1 }, new Uint8ClampedArray([180, 130, 80, 255]))
    }
    surface.writeRegion({ x: 8, y: 8, width: 1, height: 1 }, new Uint8ClampedArray([255, 0, 0, 255]))

    surface.retouchDab({ kind: 'heal', x: 8, y: 8, radius: 1, strength: 1 })

    const healed = pixel(surface, 8, 8)
    expect(healed[0]).toBeGreaterThan(180)
    expect(healed[0]).toBeLessThan(255)
  })

  test('source-aware healing captures tile patches for undo', () => {
    const surface = new TiledRasterSurface('heal-undo', 32, 32)
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      surface.writeRegion({ x, y, width: 1, height: 1 }, new Uint8ClampedArray([180, 130, 80, 255]))
    }
    const source = new TiledRasterSurface('heal-undo-source', 32, 32)
    source.writeRegion({ x: 10, y: 10, width: 1, height: 1 }, new Uint8ClampedArray([255, 70, 180, 255]))

    surface.beginStrokeCapture()
    surface.retouchDab({
      kind: 'heal',
      x: 20,
      y: 20,
      radius: 3,
      strength: 1,
      sourceSample: (x, y) => source.sampleRgba(x - 10, y - 10),
    })
    const patch = surface.endStrokeCapture()

    expect(patch.tiles.length).toBeGreaterThanOrEqual(1)
    expect(pixel(surface, 20, 20)[0]).toBeGreaterThan(180)
    surface.applyPatch(patch, 'undo')
    expect(pixel(surface, 20, 20)).toEqual([180, 130, 80, 255])
  })

  test('blur is deterministic and softens a local impulse', () => {
    const surface = new TiledRasterSurface('blur', 16, 16)
    surface.writeRegion({ x: 8, y: 8, width: 1, height: 1 }, new Uint8ClampedArray([255, 255, 255, 255]))
    surface.retouchDab({ kind: 'blur', x: 8, y: 8, radius: 3, strength: 1 })
    expect(pixel(surface, 8, 8)[0]).toBeGreaterThan(0)
    expect(pixel(surface, 8, 8)[0]).toBeLessThan(255)
    expect(pixel(surface, 7, 8)[0]).toBeGreaterThan(0)
  })

  test('sharpen applies a local high-pass mask without changing alpha', () => {
    const surface = new TiledRasterSurface('sharpen', 16, 16)
    surface.writeRegion({ x: 8, y: 8, width: 1, height: 1 }, new Uint8ClampedArray([180, 180, 180, 96]))
    surface.writeRegion({ x: 7, y: 8, width: 1, height: 1 }, new Uint8ClampedArray([60, 60, 60, 255]))
    surface.retouchDab({ kind: 'sharpen', x: 8, y: 8, radius: 3, strength: 1 })
    expect(pixel(surface, 8, 8)[0]).toBeGreaterThan(180)
    expect(pixel(surface, 8, 8)[3]).toBe(96)
  })

  test('smudge pulls pixels from the previous dab direction', () => {
    const surface = new TiledRasterSurface('smudge', 16, 16)
    surface.writeRegion({ x: 5, y: 8, width: 1, height: 1 }, new Uint8ClampedArray([0, 0, 255, 255]))
    surface.retouchDab({ kind: 'smudge', x: 7, y: 8, previous: { x: 5, y: 8 }, radius: 1, strength: 1 })
    expect(pixel(surface, 7, 8)[2]).toBeGreaterThan(200)
  })

  test('dodge and burn only affect their requested tonal band', () => {
    const surface = new TiledRasterSurface('tone', 16, 16)
    surface.writeRegion({ x: 5, y: 8, width: 1, height: 1 }, new Uint8ClampedArray([30, 30, 30, 255]))
    surface.writeRegion({ x: 10, y: 8, width: 1, height: 1 }, new Uint8ClampedArray([225, 225, 225, 255]))

    surface.retouchDab({ kind: 'dodge', x: 5, y: 8, radius: 1, strength: 1, range: 'shadows' })
    surface.retouchDab({ kind: 'burn', x: 10, y: 8, radius: 1, strength: 1, range: 'highlights' })

    expect(pixel(surface, 5, 8)[0]).toBeGreaterThan(200)
    expect(pixel(surface, 10, 8)[0]).toBeLessThan(50)
  })

  test('sponge desaturates without changing alpha', () => {
    const surface = new TiledRasterSurface('sponge', 16, 16)
    surface.writeRegion({ x: 8, y: 8, width: 1, height: 1 }, new Uint8ClampedArray([255, 0, 0, 123]))

    surface.retouchDab({ kind: 'sponge', x: 8, y: 8, radius: 1, strength: 1 })

    const result = pixel(surface, 8, 8)
    expect(result[0]).toBeCloseTo(result[1], 0)
    expect(result[1]).toBeCloseTo(result[2], 0)
    expect(result[3]).toBe(123)
  })

  test('sponge saturates by amplifying distance from local luminance', () => {
    const surface = new TiledRasterSurface('sponge-saturate', 16, 16)
    surface.writeRegion({ x: 8, y: 8, width: 1, height: 1 }, new Uint8ClampedArray([200, 140, 140, 255]))

    surface.retouchDab({ kind: 'sponge', x: 8, y: 8, radius: 1, strength: 1, spongeMode: 'saturate' })

    const result = pixel(surface, 8, 8)
    expect(result[0]).toBeGreaterThan(200)
    expect(result[1]).toBeLessThan(140)
    expect(result[2]).toBeLessThan(140)
  })

  test('dodge protect tones preserves hue better than linear exposure', () => {
    const linear = new TiledRasterSurface('dodge-linear', 16, 16)
    const protectedSurface = new TiledRasterSurface('dodge-protect', 16, 16)
    const color = new Uint8ClampedArray([200, 40, 40, 255])
    linear.writeRegion({ x: 8, y: 8, width: 1, height: 1 }, color)
    protectedSurface.writeRegion({ x: 8, y: 8, width: 1, height: 1 }, color)

    linear.retouchDab({ kind: 'dodge', x: 8, y: 8, radius: 1, strength: 1, range: 'midtones' })
    protectedSurface.retouchDab({
      kind: 'dodge',
      x: 8,
      y: 8,
      radius: 1,
      strength: 1,
      range: 'midtones',
      protectTones: true,
    })

    const linearResult = pixel(linear, 8, 8)
    const protectedResult = pixel(protectedSurface, 8, 8)
    expect(protectedResult[0]).toBeGreaterThan(linearResult[0]!)
    expect(protectedResult[1]).toBeLessThan(linearResult[1]!)
    expect(protectedResult[2]).toBeLessThan(linearResult[2]!)
  })

  test('history brush restores pixels from a captured layer snapshot', () => {
    const surface = new TiledRasterSurface('history', 16, 16)
    const snapshot = new Uint8ClampedArray(16 * 16 * 4)
    snapshot.fill(255)
    const i = (8 * 16 + 8) * 4
    snapshot[i] = 240
    snapshot[i + 1] = 20
    snapshot[i + 2] = 10
    snapshot[i + 3] = 255

    surface.writeRegion({ x: 8, y: 8, width: 1, height: 1 }, new Uint8ClampedArray([255, 255, 255, 255]))
    surface.retouchDab({
      kind: 'history',
      x: 8,
      y: 8,
      radius: 1,
      strength: 1,
      historySnapshot: snapshot,
    })

    expect(pixel(surface, 8, 8)).toEqual([240, 20, 10, 255])
  })

  test('pattern stamp paints a stable woven checker in layer space', () => {
    const surface = new TiledRasterSurface('pattern', 32, 32)
    surface.retouchDab({ kind: 'pattern', x: 6, y: 6, radius: 1, strength: 1 })
    surface.retouchDab({ kind: 'pattern', x: 18, y: 6, radius: 1, strength: 1 })

    expect(pixel(surface, 6, 6)).toEqual([234, 217, 177, 255])
    expect(pixel(surface, 18, 6)).toEqual([92, 73, 54, 255])
  })

  test('toning strokes capture only touched tile patches for history', () => {
    const surface = new TiledRasterSurface('toning-stroke', 64, 64)
    surface.writeRegion({ x: 20, y: 20, width: 1, height: 1 }, new Uint8ClampedArray([30, 30, 30, 255]))

    surface.beginStrokeCapture()
    surface.retouchDab({ kind: 'dodge', x: 20, y: 20, radius: 3, strength: 1, range: 'shadows' })
    surface.retouchDab({ kind: 'burn', x: 24, y: 20, radius: 3, strength: 1, range: 'highlights' })
    surface.retouchDab({ kind: 'sponge', x: 28, y: 20, radius: 3, strength: 1, spongeMode: 'saturate' })
    const patch = surface.endStrokeCapture()

    expect(patch.tiles.length).toBeGreaterThanOrEqual(1)
    expect(pixel(surface, 20, 20)[0]).toBeGreaterThan(200)
    surface.applyPatch(patch, 'undo')
    expect(pixel(surface, 20, 20)).toEqual([30, 30, 30, 255])
  })
})
