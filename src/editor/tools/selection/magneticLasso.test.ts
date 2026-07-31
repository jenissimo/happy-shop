import { describe, expect, test } from 'bun:test'
import {
  computeEdgeField,
  snapPointToEdge,
  traceMagneticSegment,
} from './magneticLasso'

describe('magnetic lasso edge helpers', () => {
  test('snapPointToEdge prefers the strongest gradient in the search window', () => {
    const width = 5
    const height = 5
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = x < 2 ? 0 : 255
        const i = (y * width + x) * 4
        rgba[i] = v
        rgba[i + 1] = v
        rgba[i + 2] = v
        rgba[i + 3] = 255
      }
    }
    const field = computeEdgeField(rgba, width, height)
    const snapped = snapPointToEdge(1.5, 2, field, 2)
    expect(snapped.x).toBeGreaterThanOrEqual(1)
    expect(snapped.x).toBeLessThanOrEqual(3)
  })

  test('traceMagneticSegment advances toward the target', () => {
    const width = 20
    const height = 10
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = x < 10 ? 0 : 255
        const i = (y * width + x) * 4
        rgba[i] = v
        rgba[i + 1] = v
        rgba[i + 2] = v
        rgba[i + 3] = 255
      }
    }
    const field = computeEdgeField(rgba, width, height)
    const segment = traceMagneticSegment(
      { x: 2, y: 5 },
      { x: 18, y: 5 },
      field,
      2,
    )
    expect(segment.length).toBeGreaterThan(0)
    const last = segment[segment.length - 1]!
    expect(last.x).toBeGreaterThan(2)
  })
})
