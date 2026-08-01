import { describe, expect, test } from 'bun:test'
import {
  pickTouchPair,
  resolveTouchNavigation,
  type TouchNavPoint,
} from './touchNavigation'

function pt(id: number, x: number, y: number): TouchNavPoint {
  return { id, x, y }
}

describe('pickTouchPair', () => {
  test('returns null with fewer than two pointers', () => {
    expect(pickTouchPair(new Map())).toBeNull()
    expect(pickTouchPair(new Map([[1, pt(1, 0, 0)]]))).toBeNull()
  })

  test('returns the first two pointers in insertion order', () => {
    const map = new Map<number, TouchNavPoint>([
      [10, pt(10, 0, 0)],
      [20, pt(20, 10, 0)],
      [30, pt(30, 20, 0)],
    ])
    expect(pickTouchPair(map)).toEqual([pt(10, 0, 0), pt(20, 10, 0)])
  })
})

describe('resolveTouchNavigation', () => {
  test('midpoint delta pans without zoom when distance is unchanged', () => {
    const prev = [pt(1, 0, 0), pt(2, 100, 0)] as const
    const next = [pt(1, 20, 10), pt(2, 120, 10)] as const
    expect(resolveTouchNavigation(prev, next)).toEqual({
      dx: 20,
      dy: 10,
      factor: 1,
      anchorX: 70,
      anchorY: 10,
    })
  })

  test('distance ratio pinches toward the new midpoint', () => {
    const prev = [pt(1, 0, 0), pt(2, 100, 0)] as const
    // Same midpoint (50,0), distance doubled → zoom in 2×
    const next = [pt(1, -50, 0), pt(2, 150, 0)] as const
    expect(resolveTouchNavigation(prev, next)).toEqual({
      dx: 0,
      dy: 0,
      factor: 2,
      anchorX: 50,
      anchorY: 0,
    })
  })

  test('combined pan + pinch in one sample', () => {
    const prev = [pt(1, 0, 0), pt(2, 80, 0)] as const
    // Midpoint 40→60 (+20), distance 80→40 (0.5×)
    const next = [pt(1, 40, 0), pt(2, 80, 0)] as const
    expect(resolveTouchNavigation(prev, next)).toEqual({
      dx: 20,
      dy: 0,
      factor: 0.5,
      anchorX: 60,
      anchorY: 0,
    })
  })

  test('degenerate near-zero distance skips zoom (factor 1)', () => {
    const prev = [pt(1, 0, 0), pt(2, 0.0001, 0)] as const
    const next = [pt(1, 5, 3), pt(2, 5.0001, 3)] as const
    const action = resolveTouchNavigation(prev, next)
    expect(action.factor).toBe(1)
    expect(action.dx).toBeCloseTo(5)
    expect(action.dy).toBeCloseTo(3)
  })
})
