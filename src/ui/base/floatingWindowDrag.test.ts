import { describe, expect, test } from 'bun:test'
import { clampFloatingPosition, floatingPositionFromDrag } from './floatingWindowDrag'

describe('clampFloatingPosition', () => {
  test('keeps top edge on-screen and allows partial horizontal overhang', () => {
    expect(clampFloatingPosition(-1000, -50, 400, 1000, 800)).toEqual({ x: -344, y: 8 })
    expect(clampFloatingPosition(2000, 2000, 400, 1000, 800)).toEqual({ x: 952, y: 752 })
  })

  test('passes through in-bounds positions', () => {
    expect(clampFloatingPosition(120, 80, 400, 1000, 800)).toEqual({ x: 120, y: 80 })
  })
})

describe('floatingPositionFromDrag', () => {
  test('applies client delta without jump when origin matches left/top', () => {
    expect(
      floatingPositionFromDrag(
        { x: 100, y: 50 },
        { x: 150, y: 60 },
        { x: 180, y: 90 },
        400,
        1000,
        800,
      ),
    ).toEqual({ x: 130, y: 80 })
  })

  test('clamps after large drag', () => {
    expect(
      floatingPositionFromDrag(
        { x: 100, y: 50 },
        { x: 0, y: 0 },
        { x: 5000, y: 5000 },
        400,
        1000,
        800,
      ),
    ).toEqual({ x: 952, y: 752 })
  })
})
