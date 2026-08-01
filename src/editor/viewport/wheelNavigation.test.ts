import { describe, expect, test } from 'bun:test'
import {
  resolveWheelNavigation,
  ZOOM_WHEEL_SENSITIVITY,
} from './wheelNavigation'

const PIXEL = 0
const LINE = 1

describe('resolveWheelNavigation', () => {
  test('plain pixel scroll pans (negated for natural scrolling)', () => {
    expect(
      resolveWheelNavigation({
        deltaX: 30,
        deltaY: -12,
        deltaMode: PIXEL,
        ctrlKey: false,
        metaKey: false,
      }),
    ).toEqual({ type: 'pan', dx: -30, dy: 12 })
  })

  test('horizontal-only scroll pans on X', () => {
    expect(
      resolveWheelNavigation({
        deltaX: 40,
        deltaY: 0,
        deltaMode: PIXEL,
        ctrlKey: false,
        metaKey: false,
      }),
    ).toEqual({ type: 'pan', dx: -40, dy: 0 })
  })

  test('ctrlKey (pinch) zooms from deltaY', () => {
    const deltaY = 100
    expect(
      resolveWheelNavigation({
        deltaX: 5,
        deltaY,
        deltaMode: PIXEL,
        ctrlKey: true,
        metaKey: false,
      }),
    ).toEqual({
      type: 'zoom',
      factor: Math.exp(-deltaY * ZOOM_WHEEL_SENSITIVITY),
    })
  })

  test('metaKey (Cmd+scroll) zooms', () => {
    const deltaY = -50
    expect(
      resolveWheelNavigation({
        deltaX: 0,
        deltaY,
        deltaMode: PIXEL,
        ctrlKey: false,
        metaKey: true,
      }),
    ).toEqual({
      type: 'zoom',
      factor: Math.exp(-deltaY * ZOOM_WHEEL_SENSITIVITY),
    })
  })

  test('DOM_DELTA_LINE scales pan deltas by ~16px', () => {
    expect(
      resolveWheelNavigation({
        deltaX: 1,
        deltaY: 2,
        deltaMode: LINE,
        ctrlKey: false,
        metaKey: false,
      }),
    ).toEqual({ type: 'pan', dx: -16, dy: -32 })
  })

  test('DOM_DELTA_LINE scales zoom delta before the exp curve', () => {
    const deltaY = 1
    const scaled = deltaY * 16
    expect(
      resolveWheelNavigation({
        deltaX: 0,
        deltaY,
        deltaMode: LINE,
        ctrlKey: true,
        metaKey: false,
      }),
    ).toEqual({
      type: 'zoom',
      factor: Math.exp(-scaled * ZOOM_WHEEL_SENSITIVITY),
    })
  })
})
