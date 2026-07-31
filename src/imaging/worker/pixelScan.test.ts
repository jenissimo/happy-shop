import { describe, expect, test } from 'bun:test'
import { applyChromaKeyBuffer, buildChromaFloodMask, scanOpaqueBounds } from './pixelScan'

describe('scanOpaqueBounds', () => {
  test('returns null for fully transparent', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4)
    expect(scanOpaqueBounds(data, 4, 4)).toBeNull()
  })

  test('finds opaque island', () => {
    const data = new Uint8ClampedArray(8 * 8 * 4)
    // opaque pixel at (2,3)
    const i = (3 * 8 + 2) * 4
    data[i] = 255
    data[i + 1] = 0
    data[i + 2] = 0
    data[i + 3] = 255
    expect(scanOpaqueBounds(data, 8, 8)).toEqual({
      minX: 2,
      minY: 3,
      maxX: 2,
      maxY: 3,
    })
  })
})

describe('applyChromaKeyBuffer', () => {
  test('clears key green within tolerance', () => {
    const data = new Uint8ClampedArray([0, 255, 0, 255, 255, 0, 0, 255])
    applyChromaKeyBuffer(data, {
      keyR: 0,
      keyG: 255,
      keyB: 0,
      tolerance: 30,
      softness: 0,
    })
    expect(data[3]).toBe(0)
    expect(data[7]).toBe(255)
  })

  test('flood mode only keys connected region', () => {
    // 3×1: green | red | green — seed on left green only keys left.
    const w = 3
    const h = 1
    const data = new Uint8ClampedArray([
      0, 255, 0, 255,
      255, 0, 0, 255,
      0, 255, 0, 255,
    ])
    applyChromaKeyBuffer(data, {
      keyR: 0,
      keyG: 255,
      keyB: 0,
      tolerance: 30,
      softness: 0,
      mode: 'flood',
      width: w,
      height: h,
      floodOrigins: [{ x: 0, y: 0 }],
    })
    expect(data[3]).toBe(0)
    expect(data[7]).toBe(255)
    expect(data[11]).toBe(255)
  })

  test('builds A8 connectivity mask with the CPU flood predicate', () => {
    // 3×1: matching green pixels split by an unmatched red barrier.
    const data = new Uint8ClampedArray([
      0, 255, 0, 255,
      255, 0, 0, 255,
      0, 255, 0, 255,
    ])
    const result = buildChromaFloodMask(data, {
      keyR: 0,
      keyG: 255,
      keyB: 0,
      tolerance: 30,
      softness: 0,
      width: 3,
      height: 1,
      floodOrigins: [{ x: 0, y: 0 }],
    })
    expect(result.width).toBe(3)
    expect(result.height).toBe(1)
    expect([...result.data]).toEqual([255, 0, 0])
  })

  test('despill unmixed fringe and choke erodes keyed alpha', () => {
    // The center is a soft-green fringe; choke sees transparent keyed neighbors.
    const data = new Uint8ClampedArray([
      0, 255, 0, 255,
      80, 220, 80, 255,
      0, 255, 0, 255,
    ])
    applyChromaKeyBuffer(data, {
      keyR: 0,
      keyG: 255,
      keyB: 0,
      tolerance: 20,
      softness: 80,
      despill: 1,
      choke: 1,
      width: 3,
      height: 1,
    })
    expect(data[7]).toBe(0)
    expect(data[5]).toBeLessThan(220)
  })
})

