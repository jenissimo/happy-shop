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

  test('crosses erased pixels that kept their RGB behind alpha 0', () => {
    // The eraser only clears alpha on a straight-RGBA surface, so an erased
    // red stroke leaves (255,0,0,0) inside otherwise virgin transparency.
    const mask = floodFillMask(
      pixels([
        [0, 0, 0, 0],
        [255, 0, 0, 0],
        [0, 0, 0, 0],
        [255, 0, 0, 255],
      ]),
      { width: 4, height: 1, seedX: 0, seedY: 0, tolerance: 0 },
    )
    expect([...mask]).toEqual([255, 255, 255, 0])
  })

  test('scales colour distance by alpha for partially transparent pixels', () => {
    // Half-alpha red is premultiplied to 128, so it stays outside a small
    // tolerance from transparent but inside a generous one.
    const tight = floodFillMask(
      pixels([[0, 0, 0, 0], [255, 0, 0, 128]]),
      { width: 2, height: 1, seedX: 0, seedY: 0, tolerance: 32 },
    )
    expect([...tight]).toEqual([255, 0])

    const loose = floodFillMask(
      pixels([[0, 0, 0, 0], [255, 0, 0, 128]]),
      { width: 2, height: 1, seedX: 0, seedY: 0, tolerance: 200 },
    )
    expect([...loose]).toEqual([255, 255])
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
