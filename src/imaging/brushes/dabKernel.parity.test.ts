import { describe, expect, test } from 'bun:test'
import { dabCoverage } from './dabKernel'
import { TiledRasterSurface } from '../surfaces/TiledRasterSurface'

function stampWithCurrentKernel(
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
  hardness: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  const r2 = radius * radius
  const pad = Math.ceil(radius) + 1
  const x0 = Math.floor(x - pad)
  const y0 = Math.floor(y - pad)
  const x1 = Math.ceil(x + pad)
  const y1 = Math.ceil(y + pad)

  for (let py = Math.max(0, y0); py < Math.min(height, y1); py++) {
    for (let px = Math.max(0, x0); px < Math.min(width, x1); px++) {
      const dx = px + 0.5 - x
      const dy = py + 0.5 - y
      const d2 = dx * dx + dy * dy
      if (d2 > r2) continue
      const d = Math.sqrt(d2) / radius
      const cover = dabCoverage(d, hardness)
      if (cover <= 0) continue
      const i = (py * width + px) * 4
      data[i] = 24
      data[i + 1] = 128
      data[i + 2] = 240
      data[i + 3] = Math.round(cover * 255)
    }
  }

  return data
}

describe('dab kernel parity', () => {
  test('soft tips have no opaque plateau outside their center', () => {
    expect(dabCoverage(0, 0.35)).toBe(1)
    expect(dabCoverage(0.01, 0.35)).toBeLessThan(1)
    expect(dabCoverage(0.35, 0.35)).toBeLessThan(1)
    expect(dabCoverage(0.85, 0.85)).toBeLessThan(1)
    expect(dabCoverage(0.85, 1)).toBe(1)
  })

  for (const radius of [2, 7, 20, 64]) {
    for (const hardness of [0, 0.35, 0.85, 1]) {
      test(`matches the shared kernel for radius ${radius}, hardness ${hardness}`, () => {
        const width = radius * 2 + 8
        const height = radius * 2 + 8
        const x = radius + 3.25
        const y = radius + 3.75
        const surface = new TiledRasterSurface('parity', width, height)

        surface.stampBrush({
          x,
          y,
          radius,
          hardness,
          opacity: 1,
          color: { r: 24, g: 128, b: 240 },
          mode: 'paint',
        })

        expect(surface.toRgbaBuffer().data).toEqual(
          stampWithCurrentKernel(width, height, x, y, radius, hardness),
        )
      })
    }
  }
})
