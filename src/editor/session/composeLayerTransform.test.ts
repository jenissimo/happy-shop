import { describe, expect, test } from 'bun:test'
import { identityTransform, type RenderLayerTransform } from '../../rendering/contracts'
import {
  composeLayerTransforms,
  isIdentityTransform,
  transformToAffine,
} from './composeLayerTransform'

function make(partial: Partial<RenderLayerTransform>): RenderLayerTransform {
  return { ...identityTransform(), ...partial }
}

/** Maps a point through a transform the same way Pixi's local transform does. */
function apply(t: RenderLayerTransform, x: number, y: number): { x: number; y: number } {
  const m = transformToAffine(t)
  return { x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty }
}

const PROBES: Array<[number, number]> = [
  [0, 0],
  [10, 0],
  [0, 10],
  [-7, 13],
]

function expectSameMapping(
  composed: RenderLayerTransform,
  parent: RenderLayerTransform,
  child: RenderLayerTransform,
): void {
  for (const [x, y] of PROBES) {
    const inner = apply(child, x, y)
    const expected = apply(parent, inner.x, inner.y)
    const actual = apply(composed, x, y)
    expect(actual.x).toBeCloseTo(expected.x, 6)
    expect(actual.y).toBeCloseTo(expected.y, 6)
  }
}

describe('composeLayerTransforms', () => {
  test('identity parent returns the child untouched', () => {
    const child = make({ x: 4, rotationDeg: 30, scaleX: 2, pivotX: 9 })
    expect(composeLayerTransforms(identityTransform(), child)).toEqual(child)
  })

  test('translation adds', () => {
    const composed = composeLayerTransforms(make({ x: 30, y: -12 }), make({ x: 5, y: 5 }))
    expect(composed.x).toBeCloseTo(35)
    expect(composed.y).toBeCloseTo(-7)
    expect(composed.scaleX).toBeCloseTo(1)
    expect(composed.rotationDeg).toBeCloseTo(0)
  })

  test.each<[string, Partial<RenderLayerTransform>, Partial<RenderLayerTransform>]>([
    ['scale over translate', { scaleX: 2, scaleY: 3 }, { x: 10, y: 4 }],
    ['rotate over translate', { rotationDeg: 90 }, { x: 10, y: 0 }],
    ['rotate over rotate', { rotationDeg: 30 }, { rotationDeg: 15 }],
    ['pivoted rotate', { rotationDeg: 45, pivotX: 8, pivotY: 3 }, { x: 2, pivotY: 4 }],
    ['skew over scale', { skewXDeg: 20 }, { scaleX: 1.5, scaleY: 0.5 }],
    ['skew over rotate', { skewYDeg: 12, scaleX: 2 }, { rotationDeg: 25 }],
    ['mirror', { scaleX: -1 }, { x: 6, rotationDeg: 20 }],
    ['full stack', { x: 3, y: -4, scaleX: 1.4, scaleY: 0.8, rotationDeg: 33, skewXDeg: 7 }, { x: -2, y: 9, scaleX: 0.6, rotationDeg: -12, skewYDeg: 4, pivotX: 5, pivotY: 2 }],
  ])('%s maps points like applying both transforms in order', (_label, p, c) => {
    const parent = make(p)
    const child = make(c)
    expectSameMapping(composeLayerTransforms(parent, child), parent, child)
  })

  test('keeps the child pivot so authored rotation centres survive', () => {
    const composed = composeLayerTransforms(make({ x: 5 }), make({ pivotX: 12, pivotY: 7 }))
    expect(composed.pivotX).toBe(12)
    expect(composed.pivotY).toBe(7)
  })

  test('an unskewed stack stays unskewed', () => {
    const composed = composeLayerTransforms(make({ rotationDeg: 30 }), make({ rotationDeg: 15 }))
    expect(composed.skewXDeg).toBe(0)
    expect(composed.skewYDeg).toBe(0)
    expect(composed.rotationDeg).toBeCloseTo(45)
  })
})

describe('isIdentityTransform', () => {
  test('detects the identity', () => {
    expect(isIdentityTransform(identityTransform())).toBe(true)
    expect(isIdentityTransform(make({ x: 0.0001 }))).toBe(false)
    expect(isIdentityTransform(make({ pivotY: 1 }))).toBe(false)
  })
})
