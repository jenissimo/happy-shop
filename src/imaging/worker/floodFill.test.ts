import { describe, expect, test } from 'bun:test'
import { floodFillMask } from './floodFill'

function pixels(values: Array<[number, number, number, number]>): Uint8ClampedArray {
  return new Uint8ClampedArray(values.flat())
}

describe('floodFillMask', () => {
  test('only includes the contiguous region inside tolerance', () => {
    const mask = floodFillMask(
      pixels([
        [10, 10, 10, 255],
        [11, 10, 10, 255],
        [200, 200, 200, 255],
        [10, 10, 10, 255],
        [10, 10, 10, 255],
        [200, 200, 200, 255],
      ]),
      { width: 3, height: 2, seedX: 0, seedY: 0, tolerance: 2 },
    )
    expect([...mask]).toEqual([255, 255, 0, 255, 255, 0])
  })

  test('can fill a transparent contiguous region', () => {
    const mask = floodFillMask(
      pixels([
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [1, 1, 1, 255],
      ]),
      { width: 3, height: 1, seedX: 0, seedY: 0, tolerance: 0 },
    )
    expect([...mask]).toEqual([255, 255, 0])
  })

  test('does not cross a selection clip', () => {
    const mask = floodFillMask(
      pixels([
        [20, 20, 20, 255],
        [20, 20, 20, 255],
        [20, 20, 20, 255],
      ]),
      {
        width: 3,
        height: 1,
        seedX: 0,
        seedY: 0,
        tolerance: 0,
        allowed: (x) => x < 1.5 ? 1 : 0,
      },
    )
    expect([...mask]).toEqual([255, 0, 0])
  })

  test('adds a partial tolerance fringe only with anti-aliasing', () => {
    const mask = floodFillMask(
      pixels([
        [20, 20, 20, 255],
        [22, 20, 20, 255],
      ]),
      {
        width: 2,
        height: 1,
        seedX: 0,
        seedY: 0,
        tolerance: 1,
        antiAlias: true,
      },
    )
    expect([...mask]).toEqual([255, 128])
  })
})
