import { describe, expect, test } from 'bun:test'
import {
  applyResize,
  boundsToBox,
  boxToBounds,
  DEFAULT_SNAP,
  MIN_NODE_SIZE,
  snapResize,
  snapTranslate,
} from './geometry'

describe('applyResize', () => {
  const box = { x: 100, y: 100, w: 80, h: 40 }

  test('free se resize', () => {
    expect(applyResize(box, 'se', 20, 10)).toEqual({
      x: 100,
      y: 100,
      w: 100,
      h: 50,
    })
  })

  test('shift se preserves aspect', () => {
    const r = applyResize(box, 'se', 40, 0, true)
    expect(r.w / r.h).toBeCloseTo(2, 1)
    expect(r.x).toBe(100)
    expect(r.y).toBe(100)
  })

  test('shift nw preserves aspect and opposite corner', () => {
    const r = applyResize(box, 'nw', -40, -20, true)
    expect(r.w / r.h).toBeCloseTo(2, 1)
    expect(r.x + r.w).toBe(180)
    expect(r.y + r.h).toBe(140)
  })

  test('shift e scales height about center', () => {
    const r = applyResize(box, 'e', 40, 0, true)
    expect(r.w).toBe(120)
    expect(r.h).toBe(60)
    expect(r.x).toBe(100)
    expect(r.y).toBe(90)
  })

  test('enforces min size', () => {
    const r = applyResize(box, 'se', -200, -200)
    expect(r.w).toBe(MIN_NODE_SIZE)
    expect(r.h).toBe(MIN_NODE_SIZE)
  })
})

describe('snap', () => {
  const canvasW = 640
  const canvasH = 360

  test('boxToBounds / boundsToBox round-trip', () => {
    const box = { x: 10, y: 20, w: 40, h: 50 }
    expect(boundsToBox(boxToBounds(box))).toEqual(box)
  })

  test('snapTranslate to canvas edge', () => {
    const rect = { left: 3, top: 10, right: 23, bottom: 30 }
    const { rect: out, guides } = snapTranslate(
      rect,
      DEFAULT_SNAP,
      [],
      canvasW,
      canvasH,
    )
    expect(out.left).toBe(0)
    expect(guides.some((g) => g.axis === 'x' && g.pos === 0)).toBe(true)
  })

  test('snapTranslate to grid', () => {
    const rect = { left: 10, top: 10, right: 30, bottom: 30 }
    const { rect: out } = snapTranslate(
      rect,
      { ...DEFAULT_SNAP, toCanvas: false, toNodes: false },
      [],
      canvasW,
      canvasH,
    )
    expect(out.left).toBe(8)
    expect(out.top).toBe(8)
  })

  test('snapResize east edge to node', () => {
    const start = { left: 10, top: 10, right: 50, bottom: 40 }
    const others = [{ left: 100, top: 0, right: 140, bottom: 40 }]
    const { rect } = snapResize(
      start,
      'e',
      48,
      0,
      DEFAULT_SNAP,
      others,
      canvasW,
      canvasH,
    )
    expect(rect.right).toBe(100)
  })

  test('disabled snap is a no-op', () => {
    const rect = { left: 3, top: 10, right: 23, bottom: 30 }
    const { rect: out, guides } = snapTranslate(
      rect,
      { ...DEFAULT_SNAP, enabled: false },
      [],
      canvasW,
      canvasH,
    )
    expect(out).toEqual(rect)
    expect(guides).toEqual([])
  })
})
