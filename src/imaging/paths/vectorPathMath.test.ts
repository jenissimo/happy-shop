import { describe, expect, test } from 'bun:test'
import { createPathId } from '../../core/document/ids'
import type { VectorPath } from '../../core/document/pathSchema'
import { sampleVectorPath } from './vectorPathMath'

describe('sampleVectorPath', () => {
  test('samples a straight segment', () => {
    const path: VectorPath = {
      id: createPathId(),
      name: 'Line',
      closed: false,
      knots: [
        { x: 0, y: 0, handleIn: null, handleOut: null },
        { x: 100, y: 0, handleIn: null, handleOut: null },
      ],
    }
    const points = sampleVectorPath(path, { stepPx: 25 })
    expect(points.length).toBeGreaterThan(3)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points.at(-1)?.x).toBeCloseTo(100, 0)
  })

  test('samples a cubic curve with handles', () => {
    const path: VectorPath = {
      id: createPathId(),
      name: 'Curve',
      closed: false,
      knots: [
        { x: 0, y: 0, handleIn: null, handleOut: { x: 40, y: 0 } },
        { x: 100, y: 100, handleIn: { x: -40, y: 0 }, handleOut: null },
      ],
    }
    const points = sampleVectorPath(path, { stepPx: 10 })
    expect(points.length).toBeGreaterThan(8)
    const mid = points[Math.floor(points.length / 2)]!
    expect(mid.y).toBeGreaterThan(10)
  })
})
