import { describe, expect, test } from 'bun:test'
import {
  trackingToLetterSpacingPx,
  trackingPxToEm,
  justifyGapExtra,
  pointTextAlignOffset,
} from './textLayout'

describe('textLayout helpers', () => {
  test('converts tracking between px and 1/1000 em', () => {
    expect(trackingPxToEm(4.8, 48)).toBe(100)
    expect(trackingToLetterSpacingPx(100, 48)).toBeCloseTo(4.8)
  })

  test('pointTextAlignOffset matches anchors', () => {
    expect(pointTextAlignOffset('left', 100)).toBe(0)
    expect(pointTextAlignOffset('center', 100)).toBe(-50)
    expect(pointTextAlignOffset('right', 100)).toBe(-100)
    expect(pointTextAlignOffset('justify', 100)).toBe(0)
  })

  test('justifyGapExtra skips last paragraph line', () => {
    expect(justifyGapExtra('hello world', 80, 120, true)).toBe(0)
    expect(justifyGapExtra('hello world', 80, 120, false)).toBeGreaterThan(0)
  })
})
