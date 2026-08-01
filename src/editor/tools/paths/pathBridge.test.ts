import { describe, expect, test } from 'bun:test'
import { createPathId } from '../../../core/document/ids'
import type { PenPath } from '../pen/penPath'
import { getSubpath } from '../pen/penPath'
import { knotToPenAnchor, penAnchorToKnot, penPathToVectorPath, vectorPathToPenPath } from './pathBridge'

describe('pathBridge', () => {
  test('round-trips pen and vector path models', () => {
    const pen: PenPath = {
      subpaths: [
        {
          closed: true,
          anchors: [
            { x: 10, y: 20, out: { x: 30, y: 20 } },
            { x: 50, y: 40, in: { x: 40, y: 30 } },
          ],
        },
      ],
    }
    const vector = penPathToVectorPath(pen, 'Work Path', createPathId())
    expect(vector.subpaths[0]?.knots[0]?.handleOut).toEqual({ x: 20, y: 0 })
    expect(vector.subpaths[0]?.knots[1]?.handleIn).toEqual({ x: -10, y: -10 })

    const back = vectorPathToPenPath(vector)
    expect(getSubpath(back).anchors[0]?.out).toEqual({ x: 30, y: 20 })
    expect(getSubpath(back).anchors[1]?.in).toEqual({ x: 40, y: 30 })
  })

  test('converts single anchor handle offsets', () => {
    const knot = penAnchorToKnot({ x: 0, y: 0, in: { x: -5, y: 0 }, out: { x: 5, y: 0 } })
    expect(knot.handleIn).toEqual({ x: -5, y: 0 })
    expect(knot.handleOut).toEqual({ x: 5, y: 0 })
    const anchor = knotToPenAnchor(knot)
    expect(anchor.in).toEqual({ x: -5, y: 0 })
    expect(anchor.out).toEqual({ x: 5, y: 0 })
  })
})
