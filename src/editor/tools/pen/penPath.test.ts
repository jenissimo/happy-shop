import { describe, expect, test } from 'bun:test'
import {
  addSmoothAnchor,
  buildFreeformPenPath,
  closePenPath,
  emptyPenPath,
  parsePenSvgPath,
  penPathBounds,
  penPathCanClose,
  penPathToSvgData,
  popLastPenAnchor,
  tessellatePenPath,
} from './penPath'

describe('pen path geometry', () => {
  test('parses cubic SVG path data', () => {
    const parsed = parsePenSvgPath('M 0 0 C 10 0 20 10 30 10 L 30 30 Z')
    expect(parsed?.closed).toBe(true)
    expect(parsed?.anchors).toHaveLength(3)
    expect(parsed?.anchors[0]?.out).toEqual({ x: 10, y: 0 })
    expect(parsed?.anchors[1]?.in).toEqual({ x: 20, y: 10 })
  })

  test('round-trips through SVG data relative to bounds', () => {
    const path = closePenPath({
      closed: false,
      anchors: [
        { x: 10, y: 10, out: { x: 30, y: 0 } },
        { x: 40, y: 40 },
        { x: 0, y: 40 },
      ],
    })
    const bounds = penPathBounds(path)
    const data = penPathToSvgData(path, bounds.x, bounds.y)
    const parsed = parsePenSvgPath(data)
    expect(parsed?.closed).toBe(true)
    expect(parsed?.anchors.length).toBe(3)
  })

  test('tessellates a cubic segment into many points', () => {
    const path = closePenPath(
      addSmoothAnchor(
        addSmoothAnchor(emptyPenPath(), 0, 0, { x: 40, y: 0 }),
        80,
        0,
        { x: 120, y: 0 },
      ),
    )
    const points = tessellatePenPath(path, 8)
    expect(points.length).toBeGreaterThan(path.anchors.length)
  })

  test('detects close hit on first anchor', () => {
    const path = {
      anchors: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
      ],
      closed: false,
    }
    expect(penPathCanClose(path, 2, 2)).toBe(true)
    expect(penPathCanClose(path, 40, 40)).toBe(false)
  })

  test('popLastPenAnchor removes the trailing anchor', () => {
    const path = {
      anchors: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
      closed: false,
    }
    expect(popLastPenAnchor(path)?.anchors).toHaveLength(2)
    expect(popLastPenAnchor({ anchors: [{ x: 0, y: 0 }], closed: false })).toBeNull()
  })

  test('buildFreeformPenPath samples a stroke at spacing', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 8, y: 0 },
      { x: 12, y: 0 },
    ]
    const path = buildFreeformPenPath(points, 4)
    expect(path.anchors.length).toBeGreaterThanOrEqual(2)
    expect(path.anchors[0]).toEqual({ x: 0, y: 0 })
    expect(path.anchors[path.anchors.length - 1]).toEqual({ x: 12, y: 0 })
  })
})
