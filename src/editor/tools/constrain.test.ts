import { describe, expect, test } from 'bun:test'
import {
  constrainToAxis,
  isDrag,
  rectFromCenter,
  rectFromDrag,
  squareFromDrag,
} from './constrain'

describe('constrain', () => {
  test('snaps either side of the 22.5° 45-degree boundary', () => {
    const shallow = constrainToAxis({ x: 0, y: 0 }, { x: 10, y: 4.12 })
    expect(shallow.y).toBeCloseTo(0, 6)
    const diagonal = constrainToAxis({ x: 0, y: 0 }, { x: 10, y: 4.15 })
    expect(diagonal.x).toBeCloseTo(diagonal.y, 6)
  })

  test('preserves drag direction when making a square', () => {
    expect(squareFromDrag({ x: 10, y: 10 }, { x: 3, y: 8 })).toEqual({
      x: 3,
      y: 3,
      width: 7,
      height: 7,
    })
  })

  test('creates center and combined constraint rectangles', () => {
    expect(rectFromCenter({ x: 10, y: 10 }, { x: 14, y: 7 })).toEqual({
      x: 6,
      y: 7,
      width: 8,
      height: 6,
    })
    expect(
      rectFromDrag(
        { x: 10, y: 10 },
        { x: 14, y: 7 },
        { square: true, fromCenter: true },
      ),
    ).toEqual({ x: 6, y: 6, width: 8, height: 8 })
  })

  test('uses screen-space threshold', () => {
    expect(isDrag({ x: 0, y: 0 }, { x: 3, y: 0 }, 1)).toBe(false)
    expect(isDrag({ x: 0, y: 0 }, { x: 3, y: 0 }, 2)).toBe(true)
  })
})
