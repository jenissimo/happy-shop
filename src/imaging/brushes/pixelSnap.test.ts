import { describe, expect, test } from 'bun:test'
import {
  snapPixelBrushSize,
  snapPixelCenter,
  snapPixelPoint,
} from './pixelSnap'

describe('pixelSnap', () => {
  test('snaps coordinates to pixel centers', () => {
    expect(snapPixelCenter(0)).toBe(0.5)
    expect(snapPixelCenter(0.4)).toBe(0.5)
    expect(snapPixelCenter(0.6)).toBe(0.5)
    expect(snapPixelCenter(1.6)).toBe(1.5)
    expect(snapPixelPoint({ x: 3.2, y: 7.8 })).toEqual({ x: 3.5, y: 7.5 })
  })

  test('rounds brush size to integer pixels', () => {
    expect(snapPixelBrushSize(1.2)).toBe(1)
    expect(snapPixelBrushSize(2.6)).toBe(3)
    expect(snapPixelBrushSize(Number.NaN)).toBe(1)
  })
})
