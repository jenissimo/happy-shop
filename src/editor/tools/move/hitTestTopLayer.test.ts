import { beforeEach, describe, expect, test } from 'bun:test'
import {
  addLayer,
  createEmptyDocument,
  createGroupLayer,
  createShapeLayer,
  setVisibility,
} from '../../../core/document'
import { hitTestTopVisibleLayer, isEffectivelyVisible } from './hitTestTopLayer'

describe('hitTestTopVisibleLayer', () => {
  let bottomId: string
  let topId: string
  let doc: ReturnType<typeof createEmptyDocument>

  beforeEach(() => {
    const bottom = createShapeLayer({
      name: 'Bottom',
      primitive: 'rect',
      bounds: { x: 0, y: 0, w: 60, h: 40 },
    })
    const top = createShapeLayer({
      name: 'Top',
      primitive: 'rect',
      bounds: { x: 20, y: 10, w: 60, h: 40 },
    })
    bottomId = bottom.id
    topId = top.id
    // rootChildren bottom→top: [bottom, top]
    doc = addLayer(createEmptyDocument({ width: 200, height: 120 }), bottom)
    doc = addLayer(doc, top)
  })

  test('picks the topmost layer under the point', () => {
    expect(hitTestTopVisibleLayer(doc, 30, 20)).toBe(topId)
  })

  test('falls through to lower layer outside the top bounds', () => {
    expect(hitTestTopVisibleLayer(doc, 5, 5)).toBe(bottomId)
  })

  test('returns null on empty canvas', () => {
    expect(hitTestTopVisibleLayer(doc, 190, 110)).toBeNull()
  })

  test('skips invisible layers', () => {
    doc = setVisibility(doc, topId as never, false)
    expect(hitTestTopVisibleLayer(doc, 30, 20)).toBe(bottomId)
  })

  test('skips layers under a hidden group', () => {
    const child = createShapeLayer({
      primitive: 'rect',
      bounds: { x: 0, y: 0, w: 40, h: 40 },
    })
    const group = createGroupLayer({ name: 'G', children: [] })
    let gdoc = addLayer(createEmptyDocument({ width: 100, height: 80 }), group)
    gdoc = addLayer(gdoc, child, { parentId: group.id })
    gdoc = setVisibility(gdoc, group.id, false)
    expect(isEffectivelyVisible(gdoc, child.id)).toBe(false)
    expect(hitTestTopVisibleLayer(gdoc, 10, 10)).toBeNull()
  })
})
