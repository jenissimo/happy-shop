import { describe, expect, test } from 'bun:test'
import {
  MAX_CANVAS_SIDE,
  SOFT_MEGAPIXEL_LIMIT,
  computeMegapixels,
  exceedsMaxSide,
  exceedsSoftMegapixelLimit,
} from './limits'

describe('canvas limits', () => {
  test('computeMegapixels', () => {
    expect(computeMegapixels(1000, 1000)).toBe(1)
    expect(computeMegapixels(8192, 8192)).toBeCloseTo(67.108864)
  })

  test('exceedsMaxSide is exclusive at the boundary', () => {
    expect(exceedsMaxSide(MAX_CANVAS_SIDE, 100)).toBe(false)
    expect(exceedsMaxSide(MAX_CANVAS_SIDE + 1, 100)).toBe(true)
  })

  test('exceedsSoftMegapixelLimit flags large documents without hard-failing', () => {
    expect(exceedsSoftMegapixelLimit(1000, 1000)).toBe(false)
    expect(exceedsSoftMegapixelLimit(8192, 8192)).toBe(true)
    expect(computeMegapixels(8192, 8192)).toBeGreaterThan(SOFT_MEGAPIXEL_LIMIT)
  })
})
