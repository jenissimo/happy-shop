import { describe, expect, test } from 'bun:test'
import { walkStroke } from './strokeWalk'

describe('walkStroke', () => {
  test('emits dabs at spacing and retains the remaining distance', () => {
    const points: Array<{ x: number; y: number }> = []
    const result = walkStroke(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      4,
      0,
      (point) => points.push(point),
    )

    expect(points).toEqual([
      { x: 4, y: 0 },
      { x: 8, y: 0 },
    ])
    expect(result.residual).toBeCloseTo(2, 6)
    expect(result.end).toEqual({ x: 10, y: 0 })
  })

  test('uses the incoming residual before emitting a dab', () => {
    const points: Array<{ x: number; y: number }> = []
    const result = walkStroke(
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      4,
      2,
      (point) => points.push(point),
    )

    expect(points).toEqual([{ x: 2, y: 0 }])
    expect(result.residual).toBeCloseTo(1, 6)
  })
})
