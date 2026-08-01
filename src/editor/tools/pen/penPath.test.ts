import { describe, expect, test } from 'bun:test'
import {
  addSmoothAnchor,
  buildFreeformPenPath,
  closePenPath,
  emptyPenPath,
  getSubpath,
  insertAnchorOnSegment,
  parsePenSvgPath,
  penPathAnchorCount,
  penPathBounds,
  penPathCanClose,
  penPathToSvgData,
  popLastPenAnchor,
  removeAnchor,
  resolveHandle,
  tessellatePenPath,
} from './penPath'

describe('pen path geometry', () => {
  test('parses cubic SVG path data', () => {
    const parsed = parsePenSvgPath('M 0 0 C 10 0 20 10 30 10 L 30 30 Z')
    expect(getSubpath(parsed!).closed).toBe(true)
    expect(getSubpath(parsed!).anchors).toHaveLength(3)
    expect(getSubpath(parsed!).anchors[0]?.out).toEqual({ x: 10, y: 0 })
    expect(getSubpath(parsed!).anchors[1]?.in).toEqual({ x: 20, y: 10 })
  })

  test('parses multiple M commands into subpaths', () => {
    const parsed = parsePenSvgPath('M 0 0 L 10 0 Z M 20 20 L 30 20 L 30 30 Z')
    expect(parsed?.subpaths).toHaveLength(2)
    expect(parsed?.subpaths[0]?.closed).toBe(true)
    expect(parsed?.subpaths[1]?.closed).toBe(true)
  })

  test('round-trips through SVG data relative to bounds', () => {
    const path = closePenPath({
      subpaths: [
        {
          closed: false,
          anchors: [
            { x: 10, y: 10, out: { x: 30, y: 0 } },
            { x: 40, y: 40 },
            { x: 0, y: 40 },
          ],
        },
      ],
    })
    const bounds = penPathBounds(path)
    const data = penPathToSvgData(path, bounds.x, bounds.y)
    const parsed = parsePenSvgPath(data)
    expect(getSubpath(parsed!).closed).toBe(true)
    expect(getSubpath(parsed!).anchors.length).toBe(3)
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
    expect(points.length).toBeGreaterThan(penPathAnchorCount(path))
  })

  test('one-sided handle still tessellates as a curve', () => {
    const path = {
      subpaths: [
        {
          closed: false,
          anchors: [
            { x: 0, y: 0, out: { x: 50, y: 0 } },
            { x: 100, y: 0 },
          ],
        },
      ],
    }
    const points = tessellatePenPath(path, 8)
    expect(points.length).toBeGreaterThan(2)
    expect(resolveHandle(path.subpaths[0]!.anchors[1]!, 'in')).toEqual({ x: 100, y: 0 })
  })

  test('detects close hit on first anchor', () => {
    const path = {
      subpaths: [
        {
          anchors: [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 50, y: 50 },
          ],
          closed: false,
        },
      ],
    }
    expect(penPathCanClose(path, 2, 2)).toBe(true)
    expect(penPathCanClose(path, 40, 40)).toBe(false)
  })

  test('popLastPenAnchor removes the trailing anchor', () => {
    const path = {
      subpaths: [
        {
          anchors: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 20, y: 0 },
          ],
          closed: false,
        },
      ],
    }
    expect(getSubpath(popLastPenAnchor(path)!).anchors).toHaveLength(2)
    expect(popLastPenAnchor({ subpaths: [{ anchors: [{ x: 0, y: 0 }], closed: false }] })).toBeNull()
  })

  test('buildFreeformPenPath samples a stroke at spacing', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 8, y: 0 },
      { x: 12, y: 0 },
    ]
    const path = buildFreeformPenPath(points, 4)
    const anchors = getSubpath(path).anchors
    expect(anchors.length).toBeGreaterThanOrEqual(2)
    expect(anchors[0]).toEqual({ x: 0, y: 0 })
    expect(anchors[anchors.length - 1]).toEqual({ x: 12, y: 0 })
  })

  test('insertAnchorOnSegment splits a cubic and removeAnchor rejoins', () => {
    const path = {
      subpaths: [
        {
          closed: false,
          anchors: [
            { x: 0, y: 0, out: { x: 40, y: 0 }, linked: true },
            { x: 100, y: 0, in: { x: 60, y: 0 }, linked: true },
          ],
        },
      ],
    }
    const inserted = insertAnchorOnSegment(path, 0, 0, 0.5)
    expect(getSubpath(inserted).anchors).toHaveLength(3)
    const removed = removeAnchor(inserted, 0, 1)
    expect(getSubpath(removed!).anchors).toHaveLength(2)
  })
})
