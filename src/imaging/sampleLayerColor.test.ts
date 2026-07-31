import { describe, expect, test } from 'bun:test'
import { rgbToCssHex, sampleRgbaAverage } from './sampleLayerColor'

describe('sampleRgbaAverage', () => {
  test('averages 3×3 neighborhood', () => {
    const w = 3
    const h = 3
    const data = new Uint8ClampedArray(w * h * 4)
    // Fill all opaque red except center green.
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255
      data[i + 1] = 0
      data[i + 2] = 0
      data[i + 3] = 255
    }
    const c = (1 * w + 1) * 4
    data[c] = 0
    data[c + 1] = 255
    data[c + 2] = 0
    const rgb = sampleRgbaAverage(data, w, h, 1, 1)
    expect(rgb).not.toBeNull()
    // 8 red + 1 green → avg r≈226, g≈28
    expect(rgb!.r).toBeGreaterThan(200)
    expect(rgb!.g).toBeGreaterThan(0)
    expect(rgbToCssHex(rgb!)).toMatch(/^#[0-9a-f]{6}$/)
  })
})
