import { describe, expect, test } from 'bun:test'
import type {
  RenderGroupLayerView,
  RenderRasterLayerView,
} from '../contracts/RenderDocumentView'
import { flattenGroupLayersForCompositor } from './flattenGroupLayers'

function raster(id: string): RenderRasterLayerView {
  return {
    id,
    kind: 'raster',
    visible: true,
    opacity: 1,
    fillOpacity: 1,
    blendMode: 'normal',
    transform: {
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
    width: 10,
    height: 10,
    source: { kind: 'color', color: '#ffffff' },
  }
}

function group(
  id: string,
  children: RenderGroupLayerView['children'],
  visible = true,
): RenderGroupLayerView {
  return {
    id,
    kind: 'group',
    visible,
    opacity: 1,
    fillOpacity: 1,
    blendMode: 'normal',
    transform: {
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
    children,
  }
}

describe('flattenGroupLayersForCompositor', () => {
  test('is the identity map when no group nodes are present', () => {
    const layers = [raster('a'), raster('b')]
    expect(flattenGroupLayersForCompositor(layers)).toEqual(layers)
  })

  test('inlines an isolated group in place, dropping only the group node itself', () => {
    const layers = [
      raster('below'),
      group('g1', [raster('inside-1'), raster('inside-2')]),
      raster('above'),
    ]

    const flat = flattenGroupLayersForCompositor(layers)

    expect(flat.map((l) => l.id)).toEqual(['below', 'inside-1', 'inside-2', 'above'])
    expect(flat.every((l) => l.kind !== 'group')).toBe(true)
  })

  test('recurses through nested isolated groups', () => {
    const layers = [
      group('outer', [raster('a'), group('inner', [raster('b'), raster('c')]), raster('d')]),
    ]

    const flat = flattenGroupLayersForCompositor(layers)

    expect(flat.map((l) => l.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  test('drops a hidden group and its whole subtree', () => {
    const layers = [
      raster('visible'),
      group('hidden', [raster('should-not-appear')], false),
    ]

    const flat = flattenGroupLayersForCompositor(layers)

    expect(flat.map((l) => l.id)).toEqual(['visible'])
  })
})
