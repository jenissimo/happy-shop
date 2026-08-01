import { describe, expect, test } from 'bun:test'
import {
  TOOLS_STRIP_DOUBLE_WIDTH,
  TOOLS_STRIP_SINGLE_WIDTH,
  TOOLS_STRIP_SNAP_THRESHOLD,
  toolsStripLayoutFromDragWidth,
  toolsStripWidthForLayout,
} from './toolsStripLayout'

describe('toolsStripWidthForLayout', () => {
  test('maps discrete layouts to CSS widths', () => {
    expect(toolsStripWidthForLayout('single')).toBe(TOOLS_STRIP_SINGLE_WIDTH)
    expect(toolsStripWidthForLayout('double')).toBe(TOOLS_STRIP_DOUBLE_WIDTH)
  })
})

describe('toolsStripLayoutFromDragWidth', () => {
  test('snaps at and below the midpoint to single', () => {
    expect(toolsStripLayoutFromDragWidth(TOOLS_STRIP_SNAP_THRESHOLD)).toBe('single')
    expect(toolsStripLayoutFromDragWidth(TOOLS_STRIP_SINGLE_WIDTH)).toBe('single')
    expect(toolsStripLayoutFromDragWidth(0)).toBe('single')
  })

  test('snaps above the midpoint to double', () => {
    expect(toolsStripLayoutFromDragWidth(TOOLS_STRIP_SNAP_THRESHOLD + 0.1)).toBe('double')
    expect(toolsStripLayoutFromDragWidth(TOOLS_STRIP_DOUBLE_WIDTH)).toBe('double')
    expect(toolsStripLayoutFromDragWidth(200)).toBe('double')
  })
})
