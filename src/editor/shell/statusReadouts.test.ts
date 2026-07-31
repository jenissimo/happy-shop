import { describe, expect, test } from 'bun:test'
import {
  formatCursorCoord,
  formatSelectionSize,
  formatZoomPercent,
} from './statusReadouts'

describe('statusReadouts', () => {
  test('formatSelectionSize', () => {
    expect(formatSelectionSize({ x: 0, y: 0, width: 10, height: 10 })).toBe('10 × 10')
  })

  test('formatCursorCoord', () => {
    expect(formatCursorCoord(5.5)).toBe('6')
  })

  test('formatZoomPercent', () => {
    expect(formatZoomPercent(75)).toBe('75%')
  })
})
