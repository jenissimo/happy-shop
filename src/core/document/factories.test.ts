import { describe, expect, test } from 'bun:test'
import {
  createAdjustmentLayer,
  createEmptyDocument,
  createGroupLayer,
  createIdentityTransform,
  createRasterLayer,
  createTextLayer,
} from './factories'
import { asRasterAssetRef } from './ids'
import { CURRENT_SCHEMA_VERSION } from './schema'
import { parseDocument } from './validate'

describe('createEmptyDocument', () => {
  test('produces a schema-valid document with sane defaults', () => {
    const doc = createEmptyDocument()
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(doc.canvas.colorSpace).toBe('srgb')
    expect(doc.canvas.pixelFormat).toBe('rgba8')
    expect(doc.canvas.background).toBe('transparent')
    expect(doc.rootChildren).toHaveLength(1)
    expect(Object.values(doc.layers)).toHaveLength(1)
    const layer = doc.layers[doc.rootChildren[0]!]
    expect(layer?.type).toBe('raster')
    expect(layer?.name).toBe('Layer 1')
    if (layer?.type === 'raster') expect(String(layer.pixels)).not.toBe('')
    expect(parseDocument(doc).ok).toBe(true)
  })

  test('honors overrides', () => {
    const doc = createEmptyDocument({
      name: 'Poster',
      width: 2000,
      height: 3000,
      background: { color: '#ffffff' },
    })
    expect(doc.name).toBe('Poster')
    expect(doc.canvas.width).toBe(2000)
    expect(doc.canvas.height).toBe(3000)
    expect(doc.canvas.background).toEqual({ color: '#ffffff' })
  })

  test('generates a fresh id per call', () => {
    const a = createEmptyDocument()
    const b = createEmptyDocument()
    expect(a.id).not.toBe(b.id)
  })
})

describe('createIdentityTransform', () => {
  test('is the neutral transform', () => {
    expect(createIdentityTransform()).toEqual({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
      skewXDeg: 0,
      skewYDeg: 0,
      pivotX: 0,
      pivotY: 0,
    })
  })
})

describe('createRasterLayer', () => {
  test('fills in LayerBase defaults', () => {
    const layer = createRasterLayer({ pixels: asRasterAssetRef('asset-1') })
    expect(layer.type).toBe('raster')
    expect(layer.pixels).toBe('asset-1')
    expect(layer.visible).toBe(true)
    expect(layer.locked).toBe(false)
    expect(layer.opacity).toBe(1)
    expect(layer.blendMode).toBe('normal')
    expect(layer.parentId).toBeNull()
    expect(layer.effects).toEqual([])
    expect(layer.transform).toEqual(createIdentityTransform())
    expect(typeof layer.id).toBe('string')
    expect(layer.id.length).toBeGreaterThan(0)
  })

  test('generates unique ids across calls', () => {
    const a = createRasterLayer({ pixels: asRasterAssetRef('a') })
    const b = createRasterLayer({ pixels: asRasterAssetRef('b') })
    expect(a.id).not.toBe(b.id)
  })
})

describe('createGroupLayer', () => {
  test('defaults to empty, non-isolated', () => {
    const group = createGroupLayer()
    expect(group.type).toBe('group')
    expect(group.children).toEqual([])
    expect(group.isolated).toBe(false)
  })

  test('accepts explicit children and isolation', () => {
    const child = createRasterLayer({ pixels: asRasterAssetRef('a') })
    const group = createGroupLayer({ children: [child.id], isolated: true })
    expect(group.children).toEqual([child.id])
    expect(group.isolated).toBe(true)
  })
})

describe('createAdjustmentLayer', () => {
  test('carries the adjustment payload', () => {
    const layer = createAdjustmentLayer({
      adjustment: { type: 'brightness-contrast', brightness: 10, contrast: -5 },
    })
    expect(layer.type).toBe('adjustment')
    expect(layer.adjustment).toEqual({
      type: 'brightness-contrast',
      brightness: 10,
      contrast: -5,
    })
  })
})

describe('createTextLayer', () => {
  test('fills text defaults and is schema-valid in a document', () => {
    const layer = createTextLayer({ content: 'Hi' })
    expect(layer.type).toBe('text')
    expect(layer.content).toBe('Hi')
    expect(layer.textMode).toBe('point')
    expect(layer.fontSize).toBeGreaterThan(0)
    expect(layer.align).toBe('left')
    expect(
      parseDocument({
        ...createEmptyDocument(),
        rootChildren: [layer.id],
        layers: { [layer.id]: layer },
      }).ok,
    ).toBe(true)
  })
})
