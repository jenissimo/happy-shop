import { describe, expect, test } from 'bun:test'
import { projectLayerMaskToDocument } from './magicWand'

describe('projectLayerMaskToDocument', () => {
  test('preserves partial A8 coverage in document space', () => {
    const localMask = new Uint8Array([255, 128, 0, 64])
    const { data, any } = projectLayerMaskToDocument(
      localMask,
      2,
      2,
      { width: 2, height: 2 },
      {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotationDeg: 0,
        skewXDeg: 0,
        skewYDeg: 0,
        pivotX: 0,
        pivotY: 0,
      },
    )
    expect(any).toBe(true)
    expect([...data]).toEqual([255, 128, 0, 64])
  })

  test('returns empty when the local mask is all zero', () => {
    const { data, any } = projectLayerMaskToDocument(
      new Uint8Array(4),
      2,
      2,
      { width: 2, height: 2 },
      {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotationDeg: 0,
        skewXDeg: 0,
        skewYDeg: 0,
        pivotX: 0,
        pivotY: 0,
      },
    )
    expect(any).toBe(false)
    expect([...data]).toEqual([0, 0, 0, 0])
  })
})
