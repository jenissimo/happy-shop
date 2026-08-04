import { describe, expect, test } from 'bun:test'
import { tipAlphaFromRgba } from './tipRegistry'

/** Build RGBA from per-pixel [gray, alpha] pairs. */
function rgba(pixels: Array<[number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach(([gray, a], i) => {
    data[i * 4] = gray
    data[i * 4 + 1] = gray
    data[i * 4 + 2] = gray
    data[i * 4 + 3] = a
  })
  return data
}

describe('tipAlphaFromRgba', () => {
  test('reads coverage from luminance for opaque grayscale tip PNGs', () => {
    // Bundled packs are 8-bit grayscale: the canvas decodes them fully opaque
    // and the mask lives in the gray channel. Reading alpha gives a solid block.
    const source = rgba([
      [0, 255],
      [128, 255],
      [255, 255],
      [64, 255],
    ])
    const alpha = tipAlphaFromRgba(source, 2, 2)
    expect(alpha.width).toBe(2)
    expect(alpha.height).toBe(2)
    expect([...alpha.data]).toEqual([0, 128, 255, 64])
  })

  test('keeps the alpha channel when the source carries transparency', () => {
    const source = rgba([
      [255, 0],
      [255, 128],
      [0, 255],
      [255, 255],
    ])
    expect([...tipAlphaFromRgba(source, 2, 2).data]).toEqual([0, 128, 255, 255])
  })

  test('an opaque grayscale tip does not collapse to a solid square', () => {
    const size = 8
    const source = new Uint8ClampedArray(size * size * 4)
    for (let i = 0; i < size * size; i++) {
      const gray = i % 2 === 0 ? 0 : 255
      source[i * 4] = gray
      source[i * 4 + 1] = gray
      source[i * 4 + 2] = gray
      source[i * 4 + 3] = 255
    }
    const alpha = tipAlphaFromRgba(source, size, size)
    expect(alpha.data.some((value) => value === 0)).toBe(true)
    expect(alpha.data.some((value) => value === 255)).toBe(true)
  })
})
