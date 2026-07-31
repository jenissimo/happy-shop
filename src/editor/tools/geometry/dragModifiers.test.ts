import { describe, expect, test } from 'bun:test'
import {
  constrainTo45,
  constrainedDragRect,
  sampleLinePoints,
} from './dragModifiers'

describe('constrainedDragRect', () => {
  test('plain drag is min/abs rect from corner', () => {
    expect(constrainedDragRect({ x: 10, y: 20 }, { x: 40, y: 50 })).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 30,
    })
    expect(constrainedDragRect({ x: 40, y: 50 }, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 30,
    })
  })

  test('Shift locks 1:1 using the dominant axis', () => {
    expect(
      constrainedDragRect(
        { x: 0, y: 0 },
        { x: 40, y: 10 },
        { shiftKey: true },
      ),
    ).toEqual({ x: 0, y: 0, width: 40, height: 40 })
    expect(
      constrainedDragRect(
        { x: 0, y: 0 },
        { x: 10, y: -30 },
        { shiftKey: true },
      ),
    ).toEqual({ x: 0, y: -30, width: 30, height: 30 })
  })

  test('Alt draws from center', () => {
    expect(
      constrainedDragRect(
        { x: 50, y: 50 },
        { x: 80, y: 60 },
        { altKey: true },
      ),
    ).toEqual({ x: 20, y: 40, width: 60, height: 20 })
  })

  test('Shift+Alt is square / circle from center', () => {
    expect(
      constrainedDragRect(
        { x: 100, y: 100 },
        { x: 130, y: 110 },
        { shiftKey: true, altKey: true },
      ),
    ).toEqual({ x: 70, y: 70, width: 60, height: 60 })
  })
})

describe('constrainTo45', () => {
  test('snaps to horizontal', () => {
    const p = constrainTo45({ x: 0, y: 0 }, { x: 10, y: 1 })
    expect(p.y).toBeCloseTo(0, 6)
    expect(p.x).toBeCloseTo(Math.hypot(10, 1), 6)
  })

  test('snaps to 45° diagonal', () => {
    const p = constrainTo45({ x: 0, y: 0 }, { x: 10, y: 9 })
    expect(p.x).toBeCloseTo(p.y, 6)
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(Math.hypot(10, 9), 6)
  })

  test('zero length stays at origin', () => {
    expect(constrainTo45({ x: 3, y: 4 }, { x: 3, y: 4 })).toEqual({
      x: 3,
      y: 4,
    })
  })
})

describe('sampleLinePoints', () => {
  test('samples at spacing and tracks residual', () => {
    const { points, residual, end } = sampleLinePoints(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      4,
      0,
    )
    expect(points).toEqual([
      { x: 4, y: 0 },
      { x: 8, y: 0 },
    ])
    expect(residual).toBeCloseTo(2, 6)
    expect(end).toEqual({ x: 10, y: 0 })
  })

  test('honors incoming residual', () => {
    const { points, residual } = sampleLinePoints(
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      4,
      2,
    )
    expect(points).toEqual([{ x: 2, y: 0 }])
    expect(residual).toBeCloseTo(1, 6)
  })

  test('empty when below spacing', () => {
    const { points, residual } = sampleLinePoints(
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      4,
      0,
    )
    expect(points).toEqual([])
    expect(residual).toBeCloseTo(2, 6)
  })
})
