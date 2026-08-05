import { describe, expect, test } from 'bun:test'
import type { Transform } from '../../../core/document'
import { layerScreenCssMatrix } from './textOverlayTransform'

function transform(patch: Partial<Transform> = {}): Transform {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotationDeg: 0,
    skewXDeg: 0,
    skewYDeg: 0,
    pivotX: 0,
    pivotY: 0,
    ...patch,
  }
}

function matrixValues(css: string): number[] {
  const inner = css.slice('matrix('.length, -1)
  return inner.split(',').map((part) => Number(part))
}

const camera = { zoom: 1, offsetX: 0, offsetY: 0 }

describe('layerScreenCssMatrix', () => {
  test('identity transform under an identity camera', () => {
    expect(matrixValues(layerScreenCssMatrix(transform(), camera))).toEqual([
      1, 0, 0, 1, 0, 0,
    ])
  })

  test('camera zoom scales the layer and its screen origin', () => {
    const css = layerScreenCssMatrix(
      transform({ x: 100, y: 50 }),
      { zoom: 0.5, offsetX: 20, offsetY: 10 },
    )
    expect(matrixValues(css)).toEqual([0.5, 0, 0, 0.5, 70, 35])
  })

  test('layer scale multiplies the camera zoom', () => {
    const css = layerScreenCssMatrix(transform({ scaleX: 2, scaleY: 3 }), {
      zoom: 2,
      offsetX: 0,
      offsetY: 0,
    })
    expect(matrixValues(css)).toEqual([4, 0, 0, 6, 0, 0])
  })

  test('rotation turns the layer about its pivot', () => {
    const css = layerScreenCssMatrix(
      transform({ x: 10, y: 10, rotationDeg: 90, pivotX: 5, pivotY: 0 }),
      camera,
    )
    const [a, b, c, d, tx, ty] = matrixValues(css)
    expect(a).toBeCloseTo(0, 6)
    expect(b).toBeCloseTo(1, 6)
    expect(c).toBeCloseTo(-1, 6)
    expect(d).toBeCloseTo(0, 6)
    // The pivot itself is the fixed point: (5,0) local must land on (10,10).
    expect(tx! + 5 * a! + 0 * c!).toBeCloseTo(10, 6)
    expect(ty! + 5 * b! + 0 * d!).toBeCloseTo(10, 6)
  })

  test('point-text anchor shifts in document space, before the camera', () => {
    const css = layerScreenCssMatrix(
      transform({ x: 100 }),
      { zoom: 2, offsetX: 0, offsetY: 0 },
      -30,
    )
    expect(matrixValues(css)[4]).toBe(140)
  })
})
