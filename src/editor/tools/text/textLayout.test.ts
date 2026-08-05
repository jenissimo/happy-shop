import { describe, expect, test } from 'bun:test'
import { createTextLayer } from '../../../core/document'
import {
  trackingToLetterSpacingPx,
  trackingPxToEm,
  justifyGapExtra,
  layoutTextLines,
  lineRunSegments,
  pointTextAlignOffset,
} from './textLayout'

/**
 * Every glyph advances 10px, and each pair measured together saves 2px — the
 * stand-in for kerning that a glyph-by-glyph measure would throw away.
 */
function kerningContext(): CanvasRenderingContext2D {
  return {
    font: '',
    measureText: (text: string) => ({
      width: text.length * 10 - Math.max(0, text.length - 1) * 2,
    }),
  } as unknown as CanvasRenderingContext2D
}

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

describe('line measurement', () => {
  test('measures same-style stretches whole, so kerning survives', () => {
    const layer = createTextLayer({ content: 'abcd', tracking: 0 })
    const [line] = layoutTextLines(kerningContext(), layer)
    // 4 glyphs, 3 kerned pairs: 40 - 6. Per glyph it would have been 40.
    expect(line!.width).toBe(34)
  })

  test('tracking places glyphs one by one, and is measured that way', () => {
    // 1000/1000 em at 10px = 10px after each of the first three glyphs.
    const layer = createTextLayer({ content: 'abcd', fontSize: 10, tracking: 1000 })
    const [line] = layoutTextLines(kerningContext(), layer)
    expect(line!.width).toBe(40 + 30)
  })

  test('splits a line at run boundaries', () => {
    const layer = createTextLayer({
      content: 'abcd',
      runs: [
        { start: 0, end: 2, fontFamily: 'A', fontSize: 10, fontWeight: 400, italic: false, color: '#000000' },
        { start: 2, end: 4, fontFamily: 'B', fontSize: 20, fontWeight: 400, italic: false, color: '#000000' },
      ],
    })
    const segments = lineRunSegments(layer.runs, layer, 'abcd', 0)
    expect(segments.map((segment) => segment.text)).toEqual(['ab', 'cd'])
    expect(segments.map((segment) => segment.run?.fontSize)).toEqual([10, 20])
  })
})
