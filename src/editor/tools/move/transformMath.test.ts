import { describe, expect, test } from 'bun:test'
import { createIdentityTransform } from '../../../core/document'
import { layerLocalToDocument } from '../brush/layerCoords'
import {
  angleFromCenterDeg,
  applyMove,
  applyRotateAroundCenter,
  applyScaleFromHandle,
  applySkewFromHandle,
  boxCenter,
  boxCorners,
  hitTestHandle,
  localCorner,
  normalizeRotationDelta,
  oppositeHandle,
  pointInOrientedBox,
  toAlignedUnscaled,
  type TransformBox,
} from './transformMath'

function box(
  w = 100,
  h = 80,
  patch: Partial<ReturnType<typeof createIdentityTransform>> = {},
): TransformBox {
  return {
    bounds: { x: 0, y: 0, w, h },
    transform: { ...createIdentityTransform(), ...patch },
  }
}

describe('transformMath', () => {
  test('oppositeHandle maps corners and edges', () => {
    expect(oppositeHandle('nw')).toBe('se')
    expect(oppositeHandle('se')).toBe('nw')
    expect(oppositeHandle('n')).toBe('s')
    expect(oppositeHandle('e')).toBe('w')
  })

  test('applyMove offsets x/y only', () => {
    const t = createIdentityTransform()
    const next = applyMove(t, 12, -4)
    expect(next.x).toBe(12)
    expect(next.y).toBe(-4)
    expect(next.scaleX).toBe(1)
    expect(next.rotationDeg).toBe(0)
  })

  test('boxCorners identity matches local extents', () => {
    const b = box(100, 50)
    const [tl, tr, br, bl] = boxCorners(b)
    expect(tl).toEqual({ x: 0, y: 0 })
    expect(tr).toEqual({ x: 100, y: 0 })
    expect(br).toEqual({ x: 100, y: 50 })
    expect(bl).toEqual({ x: 0, y: 50 })
  })

  test('boxCenter accounts for translation + scale', () => {
    const b = box(100, 80, { x: 10, y: 20, scaleX: 2, scaleY: 0.5 })
    const c = boxCenter(b)
    expect(c.x).toBeCloseTo(10 + 50 * 2, 8)
    expect(c.y).toBeCloseTo(20 + 40 * 0.5, 8)
  })

  test('applyRotateAroundCenter keeps content center fixed', () => {
    const start = box(100, 80, { x: 40, y: 30 })
    const before = boxCenter(start)
    const nextT = applyRotateAroundCenter(start, 45)
    const after = boxCenter({ bounds: start.bounds, transform: nextT })
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
    expect(nextT.rotationDeg).toBe(45)
  })

  test('applyScaleFromHandle SE keeps NW fixed', () => {
    const start = box(100, 80, { x: 10, y: 20 })
    const nwBefore = layerLocalToDocument(localCorner(start.bounds, 'nw'), start.transform)
    // Drag SE toward growing the box: pointer at local (200,160) in doc = (210,180)
    const next = applyScaleFromHandle(start, 'se', { x: 210, y: 180 })
    const nwAfter = layerLocalToDocument(localCorner(start.bounds, 'nw'), next)
    expect(nwAfter.x).toBeCloseTo(nwBefore.x, 6)
    expect(nwAfter.y).toBeCloseTo(nwBefore.y, 6)
    expect(next.scaleX).toBeCloseTo(2, 6)
    expect(next.scaleY).toBeCloseTo(2, 6)
  })

  test('applyScaleFromHandle E is horizontal-only', () => {
    const start = box(100, 80)
    const next = applyScaleFromHandle(start, 'e', { x: 150, y: 40 })
    expect(next.scaleX).toBeCloseTo(1.5, 6)
    expect(next.scaleY).toBeCloseTo(1, 6)
  })

  test('applyScaleFromHandle keepAspect locks ratio', () => {
    const start = box(100, 100, { scaleX: 1, scaleY: 1 })
    const next = applyScaleFromHandle(
      start,
      'e',
      { x: 200, y: 50 },
      { keepAspect: true },
    )
    expect(Math.abs(next.scaleX)).toBeCloseTo(Math.abs(next.scaleY), 6)
    expect(next.scaleX).toBeCloseTo(2, 6)
  })

  test('applyScaleFromHandle fromCenter scales a corner about the center', () => {
    const start = box(100, 80)
    const centerBefore = boxCenter(start)
    // SE dragged to (150,120): half-spans are 50/40, so both scales double.
    const next = applyScaleFromHandle(
      start,
      'se',
      { x: 150, y: 120 },
      { fromCenter: true },
    )
    const centerAfter = boxCenter({ bounds: start.bounds, transform: next })
    expect(centerAfter.x).toBeCloseTo(centerBefore.x, 6)
    expect(centerAfter.y).toBeCloseTo(centerBefore.y, 6)
    expect(next.scaleX).toBeCloseTo(2, 6)
    expect(next.scaleY).toBeCloseTo(2, 6)
    // NW mirrors SE instead of staying put.
    const nw = layerLocalToDocument(localCorner(start.bounds, 'nw'), next)
    expect(nw.x).toBeCloseTo(-50, 6)
    expect(nw.y).toBeCloseTo(-40, 6)
  })

  test('applyScaleFromHandle fromCenter scales an edge symmetrically', () => {
    const start = box(100, 80)
    const next = applyScaleFromHandle(
      start,
      'n',
      { x: 50, y: -20 },
      { fromCenter: true },
    )
    expect(next.scaleX).toBeCloseTo(1, 6)
    expect(next.scaleY).toBeCloseTo(1.5, 6)
    const n = layerLocalToDocument(localCorner(start.bounds, 'n'), next)
    const s = layerLocalToDocument(localCorner(start.bounds, 's'), next)
    expect(n.y).toBeCloseTo(-20, 6)
    expect(s.y).toBeCloseTo(100, 6)
  })

  test('applyScaleFromHandle keepAspect + fromCenter compose', () => {
    const start = box(100, 100)
    const centerBefore = boxCenter(start)
    const next = applyScaleFromHandle(
      start,
      'e',
      { x: 150, y: 50 },
      { keepAspect: true, fromCenter: true },
    )
    const centerAfter = boxCenter({ bounds: start.bounds, transform: next })
    expect(centerAfter.x).toBeCloseTo(centerBefore.x, 6)
    expect(centerAfter.y).toBeCloseTo(centerBefore.y, 6)
    expect(next.scaleX).toBeCloseTo(2, 6)
    expect(Math.abs(next.scaleY)).toBeCloseTo(Math.abs(next.scaleX), 6)
  })

  test('applyScaleFromHandle fromCenter holds the center under rotation', () => {
    const start = box(100, 80, { x: 25, y: 15, rotationDeg: 30 })
    const centerBefore = boxCenter(start)
    const next = applyScaleFromHandle(
      start,
      'nw',
      { x: -30, y: -12 },
      { fromCenter: true },
    )
    const centerAfter = boxCenter({ bounds: start.bounds, transform: next })
    expect(centerAfter.x).toBeCloseTo(centerBefore.x, 6)
    expect(centerAfter.y).toBeCloseTo(centerBefore.y, 6)
  })

  test('applyScaleFromHandle without fromCenter still pins the opposite handle', () => {
    const start = box(100, 80, { x: 10, y: 20 })
    const seBefore = layerLocalToDocument(
      localCorner(start.bounds, 'se'),
      start.transform,
    )
    const next = applyScaleFromHandle(start, 'nw', { x: -90, y: -60 })
    const seAfter = layerLocalToDocument(localCorner(start.bounds, 'se'), next)
    expect(seAfter.x).toBeCloseTo(seBefore.x, 6)
    expect(seAfter.y).toBeCloseTo(seBefore.y, 6)
  })

  test('applySkewFromHandle S keeps top edge fixed', () => {
    const start = box(100, 80, { x: 10, y: 20 })
    const topBefore = layerLocalToDocument(localCorner(start.bounds, 'n'), start.transform)
    const next = applySkewFromHandle(start, 's', { x: topBefore.x + 20, y: topBefore.y + 80 })!
    const topAfter = layerLocalToDocument(localCorner(start.bounds, 'n'), next)
    expect(topAfter.x).toBeCloseTo(topBefore.x, 5)
    expect(topAfter.y).toBeCloseTo(topBefore.y, 5)
    expect(next.skewXDeg).not.toBe(0)
  })

  test('applySkewFromHandle E keeps left edge fixed', () => {
    const start = box(100, 80)
    const leftBefore = layerLocalToDocument(localCorner(start.bounds, 'w'), start.transform)
    const next = applySkewFromHandle(start, 'e', { x: 100, y: leftBefore.y + 15 })!
    const leftAfter = layerLocalToDocument(localCorner(start.bounds, 'w'), next)
    expect(leftAfter.x).toBeCloseTo(leftBefore.x, 5)
    expect(leftAfter.y).toBeCloseTo(leftBefore.y, 5)
    expect(next.skewYDeg).not.toBe(0)
  })

  test('hitTestHandle finds corners and body', () => {
    const b = box(100, 80)
    expect(hitTestHandle({ x: 0, y: 0 }, b, 4, 20)).toBe('nw')
    expect(hitTestHandle({ x: 100, y: 80 }, b, 4, 20)).toBe('se')
    expect(hitTestHandle({ x: 50, y: 40 }, b, 4, 20)).toBe('body')
    expect(hitTestHandle({ x: 500, y: 500 }, b, 4, 20)).toBeNull()
  })

  test('hitTestHandle finds rotate above top-center', () => {
    const b = box(100, 80)
    const hit = hitTestHandle({ x: 50, y: -20 }, b, 4, 20)
    expect(hit).toBe('rotate')
  })

  test('pointInOrientedBox works with rotation', () => {
    const b = box(100, 80, { x: 50, y: 50, rotationDeg: 90 })
    const center = boxCenter(b)
    expect(pointInOrientedBox(center, b)).toBe(true)
    expect(pointInOrientedBox({ x: 1000, y: 1000 }, b)).toBe(false)
  })

  test('normalizeRotationDelta wraps to [-180,180]', () => {
    expect(normalizeRotationDelta(170, -170)).toBeCloseTo(20, 6)
    expect(normalizeRotationDelta(-170, 170)).toBeCloseTo(-20, 6)
  })

  test('angleFromCenterDeg is atan2 in degrees', () => {
    expect(angleFromCenterDeg({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0, 6)
    expect(angleFromCenterDeg({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 6)
  })

  test('toAlignedUnscaled strips scale', () => {
    const t = { ...createIdentityTransform(), x: 10, y: 20, scaleX: 2, scaleY: 3 }
    const p = toAlignedUnscaled({ x: 10 + 40, y: 20 + 60 }, t)
    // With scale removed, document offset (40,60) → local (40,60)
    expect(p.x).toBeCloseTo(40, 6)
    expect(p.y).toBeCloseTo(60, 6)
  })
})
