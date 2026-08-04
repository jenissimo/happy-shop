import { describe, expect, test } from 'bun:test'
import { SelectionMask } from './SelectionMask'

describe('SelectionMask', () => {
  test('fromRect samples inside/outside', () => {
    const mask = SelectionMask.fromRect(100, 80, {
      x: 10,
      y: 20,
      width: 30,
      height: 15,
    })
    expect(mask.isEmpty()).toBe(false)
    expect(mask.contains(10, 20)).toBe(true)
    expect(mask.contains(39, 34)).toBe(true)
    expect(mask.contains(40, 20)).toBe(false)
    expect(mask.contains(9, 20)).toBe(false)
    expect(mask.bounds()).toEqual({ x: 10, y: 20, width: 30, height: 15 })
  })

  test('inverse of rect covers canvas minus hole', () => {
    const mask = SelectionMask.fromRect(50, 40, {
      x: 10,
      y: 10,
      width: 10,
      height: 10,
    }).inverse()
    expect(mask.contains(0, 0)).toBe(true)
    expect(mask.contains(15, 15)).toBe(false)
    expect(mask.contains(49, 39)).toBe(true)
    expect(mask.bounds()).toEqual({ x: 0, y: 0, width: 50, height: 40 })
    const outline = mask.outline()
    expect(outline?.inverted).toBe(true)
    expect(outline?.rects).toEqual([{ x: 10, y: 10, width: 10, height: 10 }])
  })

  test('double inverse restores rect', () => {
    const rect = { x: 5, y: 5, width: 20, height: 10 }
    const restored = SelectionMask.fromRect(100, 100, rect).inverse().inverse()
    expect(restored.contains(5, 5)).toBe(true)
    expect(restored.contains(4, 5)).toBe(false)
    expect(restored.outline()?.inverted).toBe(false)
  })

  test('inverse of empty selects all', () => {
    const all = SelectionMask.empty(32, 24).inverse()
    expect(all.contains(0, 0)).toBe(true)
    expect(all.contains(31, 23)).toBe(true)
    expect(all.isEmpty()).toBe(false)
  })

  test('materialize produces A8 buffer matching rect', () => {
    const mask = SelectionMask.fromRect(8, 4, {
      x: 2,
      y: 1,
      width: 3,
      height: 2,
    })
    const data = mask.materialize()
    expect(data.length).toBe(32)
    expect(data[1 * 8 + 2]).toBe(255)
    expect(data[1 * 8 + 1]).toBe(0)
    expect(mask.contains(2, 1)).toBe(true)
  })

  test('fromEllipse covers center and excludes corners of AABB', () => {
    const mask = SelectionMask.fromEllipse(40, 40, {
      x: 0,
      y: 0,
      width: 40,
      height: 40,
    })
    expect(mask.contains(20, 20)).toBe(true)
    expect(mask.contains(0, 0)).toBe(false)
    expect(mask.outline()?.ellipses).toEqual([
      { x: 0, y: 0, width: 40, height: 40 },
    ])
  })

  test('ellipse materializes curved geometry rather than its bounding rectangle', () => {
    const mask = SelectionMask.fromEllipse(10, 8, {
      x: 1,
      y: 1,
      width: 8,
      height: 6,
    })
    const data = mask.materialize()
    // Center line reaches the AABB edges, while the top-left AABB corner remains out.
    expect(data[4 * 10 + 1]).toBe(255)
    expect(data[1 * 10 + 1]).toBe(0)
    expect(data[1 * 10 + 5]).toBe(255)
    expect(data[4 * 10 + 8]).toBe(255)
  })

  test('off-canvas ellipse keeps its shape with and without anti-aliasing', () => {
    // Drag from (-100,-100) to (200,200): a 300px circle, of which only the
    // bottom-right quarter is on canvas. Clamping the AABB would instead give a
    // full 200px ellipse squeezed into the visible box.
    const bounds = { x: -100, y: -100, width: 300, height: 300 }
    const hard = SelectionMask.fromEllipse(200, 200, bounds)
    const soft = SelectionMask.fromEllipse(200, 200, bounds, { antiAlias: true })

    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        const coverage = soft.sample(x, y)
        if (coverage === 255) expect(hard.sample(x, y)).toBe(255)
        else if (coverage === 0) expect(hard.sample(x, y)).toBe(0)
      }
    }

    // Circle centred at (50,50) with r=150: (149,50) is inside, (160,160) out.
    expect(hard.contains(149, 50)).toBe(true)
    expect(hard.contains(160, 160)).toBe(false)
    // The squashed 200px ellipse would have excluded this point.
    expect(hard.contains(10, 190)).toBe(true)
    expect(hard.bounds()).toEqual({ x: 0, y: 0, width: 200, height: 200 })
  })

  test('fromPolygon fills a triangle', () => {
    const mask = SelectionMask.fromPolygon(20, 20, [
      { x: 2, y: 2 },
      { x: 18, y: 2 },
      { x: 10, y: 16 },
    ])
    expect(mask.contains(10, 6)).toBe(true)
    expect(mask.contains(0, 0)).toBe(false)
  })

  test('anti-aliasing preserves partial coverage on an ellipse edge', () => {
    const mask = SelectionMask.fromEllipse(
      12,
      12,
      { x: 1.25, y: 1.25, width: 9, height: 9 },
      { antiAlias: true },
    )
    expect(mask.sample(5, 5)).toBe(255)
    expect(mask.sample(1, 4)).toBeGreaterThan(0)
    expect(mask.sample(1, 4)).toBeLessThan(255)
  })

  test('feather creates a soft A8 edge around the selection', () => {
    const feathered = SelectionMask.fromRect(16, 16, {
      x: 5,
      y: 5,
      width: 6,
      height: 6,
    }).feather(2)
    expect(feathered.sample(4, 8)).toBeGreaterThan(0)
    expect(feathered.sample(4, 8)).toBeLessThan(255)
    expect(feathered.sample(6, 8)).toBeGreaterThan(feathered.sample(4, 8))
  })

  test('combine add / subtract / intersect', () => {
    const a = SelectionMask.fromRect(20, 20, {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    })
    const b = SelectionMask.fromRect(20, 20, {
      x: 5,
      y: 5,
      width: 10,
      height: 10,
    })
    expect(a.combine(b, 'add').contains(12, 12)).toBe(true)
    expect(a.combine(b, 'add').contains(2, 2)).toBe(true)
    expect(a.combine(b, 'subtract').contains(2, 2)).toBe(true)
    expect(a.combine(b, 'subtract').contains(7, 7)).toBe(false)
    expect(a.combine(b, 'intersect').contains(7, 7)).toBe(true)
    expect(a.combine(b, 'intersect').contains(2, 2)).toBe(false)
  })

  test('combine retains soft coverage instead of binarizing it', () => {
    const soft = SelectionMask.fromRect(16, 16, {
      x: 5,
      y: 5,
      width: 6,
      height: 6,
    }).feather(2)
    const combined = SelectionMask.empty(16, 16).combine(soft, 'add')
    expect(combined.sample(4, 8)).toBe(soft.sample(4, 8))
  })

  test('resizeCanvas re-anchors the selection onto the new canvas', () => {
    const mask = SelectionMask.fromRect(100, 100, {
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    })
    // Grow 100→200 centered: old origin lands at (50,50).
    const grown = mask.resizeCanvas(200, 200, 50, 50)
    expect(grown.width).toBe(200)
    expect(grown.height).toBe(200)
    expect(grown.bounds()).toEqual({ x: 60, y: 60, width: 20, height: 20 })
    expect(grown.contains(65, 65)).toBe(true)
    expect(grown.contains(15, 15)).toBe(false)
  })

  test('resizeCanvas clips selection that falls outside a shrunk canvas', () => {
    const mask = SelectionMask.fromRect(100, 100, {
      x: 80,
      y: 80,
      width: 20,
      height: 20,
    })
    expect(mask.resizeCanvas(40, 40, 0, 0).isEmpty()).toBe(true)
  })

  test('resizeCanvas keeps arbitrary A8 coverage aligned to its pixels', () => {
    const soft = SelectionMask.fromRect(20, 20, {
      x: 5,
      y: 5,
      width: 6,
      height: 6,
    }).feather(2)
    const moved = soft.resizeCanvas(30, 30, 5, 5)
    expect(moved.sample(12, 12)).toBe(soft.sample(7, 7))
    expect(moved.sample(9, 12)).toBe(soft.sample(4, 7))
    expect(moved.sample(0, 0)).toBe(0)
  })

  test('resampleToCanvas scales the selection with the document', () => {
    const mask = SelectionMask.fromRect(100, 100, {
      x: 10,
      y: 20,
      width: 20,
      height: 20,
    })
    const scaled = mask.resampleToCanvas(200, 50)
    expect(scaled.width).toBe(200)
    expect(scaled.height).toBe(50)
    expect(scaled.bounds()).toEqual({ x: 20, y: 10, width: 40, height: 10 })
  })

  test('affineTransform skews a rect selection', () => {
    const mask = SelectionMask.fromRect(40, 40, {
      x: 10,
      y: 10,
      width: 10,
      height: 10,
    })
    const skewed = mask.affineTransform({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
      skewXDeg: 15,
      skewYDeg: 0,
      pivotX: 0,
      pivotY: 0,
    })
    expect(skewed.bounds()?.width).toBeGreaterThan(10)
  })

  test('resampleAffineProjective warps one corner of a rect', () => {
    const mask = SelectionMask.fromRect(40, 40, {
      x: 10,
      y: 10,
      width: 10,
      height: 10,
    })
    const identity = {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
      skewXDeg: 0,
      skewYDeg: 0,
      pivotX: 0,
      pivotY: 0,
    }
    const source = [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
      { x: 10, y: 20 },
    ]
    const dest = [
      { x: 10, y: 10 },
      { x: 24, y: 12 },
      { x: 20, y: 20 },
      { x: 10, y: 20 },
    ]
    const warped = mask.resampleAffineProjective(identity, source, dest)
    expect(warped.sample(22, 11)).toBeGreaterThan(0)
    expect(warped.sample(8, 15)).toBe(0)
  })
})
