import { describe, expect, test } from 'bun:test'
import { floodSelectMask } from './floodSelect'

function solid(
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  }
  return data
}

describe('floodSelectMask', () => {
  test('selects contiguous region within tolerance', () => {
    const w = 4
    const h = 2
    const rgba = solid(w, h, 10, 10, 10)
    // Right half different color, disconnected by column gap of different pixels.
    for (let y = 0; y < h; y++) {
      for (let x = 2; x < w; x++) {
        const i = (y * w + x) * 4
        rgba[i] = 200
        rgba[i + 1] = 200
        rgba[i + 2] = 200
      }
    }
    const mask = floodSelectMask(rgba, {
      width: w,
      height: h,
      seedX: 0,
      seedY: 0,
      tolerance: 5,
    })
    expect(mask[0]).toBe(255)
    expect(mask[1]).toBe(255)
    expect(mask[2]).toBe(0)
    expect(mask[3]).toBe(0)
  })

  test('skips transparent seed', () => {
    const rgba = solid(2, 2, 0, 0, 0, 0)
    const mask = floodSelectMask(rgba, {
      width: 2,
      height: 2,
      seedX: 0,
      seedY: 0,
      tolerance: 32,
    })
    expect(mask.every((v) => v === 0)).toBe(true)
  })

  test('adds a partial tolerance fringe only with anti-aliasing', () => {
    const rgba = solid(2, 1, 20, 20, 20)
    rgba[4] = 22
    rgba[5] = 20
    rgba[6] = 20
    const mask = floodSelectMask(rgba, {
      width: 2,
      height: 1,
      seedX: 0,
      seedY: 0,
      tolerance: 1,
      antiAlias: true,
    })
    expect([...mask]).toEqual([255, 128])
  })

  test('crosses a soft eraser edge that kept its RGB under reduced alpha', () => {
    // Red row; the middle pixel was half-erased, so it still holds (255,0,0)
    // but at alpha 128. Straight-RGBA comparison saw |255-255|,|0-0|,|128-255|
    // = 127 and stopped there; premultiplied it is 127 on RGB too, but the
    // seed is compared premultiplied as well, so a mid-tolerance wand crosses.
    const w = 3
    const rgba = solid(w, 1, 255, 0, 0)
    rgba[4 + 3] = 128
    const mask = floodSelectMask(rgba, {
      width: w,
      height: 1,
      seedX: 0,
      seedY: 0,
      tolerance: 200,
    })
    expect([...mask]).toEqual([255, 255, 255])
  })

  test('still refuses a genuinely different colour at low tolerance', () => {
    const w = 3
    const rgba = solid(w, 1, 255, 0, 0)
    rgba[4] = 0
    rgba[4 + 2] = 255
    const mask = floodSelectMask(rgba, {
      width: w,
      height: 1,
      seedX: 0,
      seedY: 0,
      tolerance: 10,
    })
    expect([...mask]).toEqual([255, 0, 0])
  })
})
