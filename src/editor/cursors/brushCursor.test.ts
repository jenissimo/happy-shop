import { describe, expect, test } from 'bun:test'
import {
  buildBrushTipRing,
  brushTipCursorCss,
  pencilTipSideScreenPx,
  tipDiameterScreenPx,
} from './brushCursor'

describe('brushCursor', () => {
  test('tipDiameterScreenPx scales with zoom', () => {
    expect(tipDiameterScreenPx(20, 1)).toBe(20)
    expect(tipDiameterScreenPx(20, 2)).toBe(40)
    expect(tipDiameterScreenPx(20, 0.5)).toBe(10)
  })

  test('pencil tip side snaps document size then scales by zoom', () => {
    expect(pencilTipSideScreenPx(3.2, 4)).toBe(12)
    expect(pencilTipSideScreenPx(1, 8)).toBe(8)
    expect(pencilTipSideScreenPx(0.4, 10)).toBe(10)
  })

  test('pencil ring is a hard square matching stamp footprint', () => {
    const ring = buildBrushTipRing(5.4, 3, 0.2, 'pencil')
    expect(ring).toEqual({
      diameterPx: 15,
      hardnessGhostPx: null,
      mode: 'pencil',
      shape: 'square',
    })
  })

  test('brush ring stays circular with hardness ghost', () => {
    const ring = buildBrushTipRing(20, 1, 0.5, 'brush')
    expect(ring.shape).toBe('circle')
    expect(ring.hardnessGhostPx).toBe(10)
  })

  test('square css cursor encodes a rect tip', () => {
    const ring = buildBrushTipRing(4, 1, 1, 'pencil')
    const { css, useOverlay } = brushTipCursorCss(ring)
    expect(useOverlay).toBe(false)
    expect(css).toContain('rect')
    expect(css).not.toContain('circle')
  })
})
