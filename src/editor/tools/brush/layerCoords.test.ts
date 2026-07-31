import { describe, expect, test } from 'bun:test'
import { createIdentityTransform } from '../../../core/document'
import { documentToLayerLocal, layerLocalToDocument } from './layerCoords'

describe('documentToLayerLocal / layerLocalToDocument', () => {
  test('identity transform: document == layer-local (cursor hit)', () => {
    const t = createIdentityTransform()
    const doc = { x: 123.5, y: 45.25 }
    const local = documentToLayerLocal(doc, t)
    expect(local.x).toBeCloseTo(doc.x, 10)
    expect(local.y).toBeCloseTo(doc.y, 10)
  })

  test('translation only: subtracts layer origin (regression for brush offset)', () => {
    const t = { ...createIdentityTransform(), x: 160, y: 120 }
    const doc = { x: 200, y: 150 }
    const local = documentToLayerLocal(doc, t)
    expect(local.x).toBeCloseTo(40, 10)
    expect(local.y).toBeCloseTo(30, 10)
  })

  test('rotation + translation round-trips', () => {
    const t = {
      ...createIdentityTransform(),
      x: 160,
      y: 120,
      rotationDeg: -6,
    }
    const local = { x: 80, y: 40 }
    const doc = layerLocalToDocument(local, t)
    const back = documentToLayerLocal(doc, t)
    expect(back.x).toBeCloseTo(local.x, 8)
    expect(back.y).toBeCloseTo(local.y, 8)
  })

  test('scale + pivot round-trips', () => {
    const t = {
      ...createIdentityTransform(),
      x: 10,
      y: 20,
      scaleX: 2,
      scaleY: 0.5,
      pivotX: 5,
      pivotY: 5,
    }
    const local = { x: 15, y: 25 }
    const doc = layerLocalToDocument(local, t)
    const back = documentToLayerLocal(doc, t)
    expect(back.x).toBeCloseTo(local.x, 8)
    expect(back.y).toBeCloseTo(local.y, 8)
  })
})
