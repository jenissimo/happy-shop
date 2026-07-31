import { describe, expect, test } from 'bun:test'
import type {
  RenderGroupLayerView,
  RenderRasterLayerView,
} from '../contracts/RenderDocumentView'
import { buildGroupLayerSourceKey } from './groupLayerKeys'
import { bitmapIdentity } from './layerViewDescribe'

const transform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotationDeg: 0,
  skewXDeg: 0,
  skewYDeg: 0,
  pivotX: 0,
  pivotY: 0,
}

function raster(id: string, bitmap: ImageBitmap): RenderRasterLayerView {
  return {
    id,
    kind: 'raster',
    visible: true,
    opacity: 1,
    fillOpacity: 1,
    blendMode: 'normal',
    transform: { ...transform },
    width: 10,
    height: 10,
    source: { kind: 'image-bitmap', bitmap },
  }
}

function isolatedGroup(
  id: string,
  children: RenderGroupLayerView['children'],
  effects: RenderGroupLayerView['effects'] = [],
): RenderGroupLayerView {
  return {
    id,
    kind: 'group',
    visible: true,
    opacity: 1,
    fillOpacity: 1,
    blendMode: 'normal',
    transform: { ...transform },
    effects,
    children,
  }
}

describe('buildGroupLayerSourceKey', () => {
  test('changes when a child raster publishes a new ImageBitmap', () => {
    const bitmapA = { width: 10, height: 10, close() {} } as ImageBitmap
    const bitmapB = { width: 10, height: 10, close() {} } as ImageBitmap
    const layer = isolatedGroup('g', [raster('a', bitmapA)])

    const before = buildGroupLayerSourceKey(layer, 'linear')
    const after = buildGroupLayerSourceKey(
      isolatedGroup('g', [raster('a', bitmapB)]),
      'linear',
    )

    expect(bitmapIdentity(bitmapA)).not.toBe(bitmapIdentity(bitmapB))
    expect(before).not.toBe(after)
  })

  test('changes when group-level FX structure is added', () => {
    const child = raster('a', { width: 10, height: 10, close() {} } as ImageBitmap)
    const withoutFx = buildGroupLayerSourceKey(isolatedGroup('g', [child]), 'linear')
    const withFx = buildGroupLayerSourceKey(
      isolatedGroup('g', [child], [
        {
          id: 'shadow-1',
          type: 'drop-shadow',
          enabled: true,
          blendMode: 'normal',
          color: '#000000',
          opacity: 0.5,
          angle: 120,
          distance: 4,
          spread: 0,
          size: 8,
          contour: 'linear',
          noise: 0,
          layerKnocksOutDropShadow: true,
        },
      ]),
      'linear',
    )

    expect(withoutFx).not.toBe(withFx)
  })

  test('stable when only FX params scrub', () => {
    const child = raster('a', { width: 10, height: 10, close() {} } as ImageBitmap)
    const fx = (size: number) =>
      isolatedGroup('g', [child], [
        {
          id: 'shadow-1',
          type: 'drop-shadow',
          enabled: true,
          blendMode: 'normal',
          color: '#000000',
          opacity: 0.5,
          angle: 120,
          distance: 4,
          spread: 0,
          size,
          contour: 'linear',
          noise: 0,
          layerKnocksOutDropShadow: true,
        },
      ])
    expect(buildGroupLayerSourceKey(fx(8), 'linear')).toBe(buildGroupLayerSourceKey(fx(24), 'linear'))
  })

  test('includes nested isolated groups recursively', () => {
    const inner = isolatedGroup('inner', [
      raster('leaf', { width: 4, height: 4, close() {} } as ImageBitmap),
    ])
    const outer = isolatedGroup('outer', [inner])
    const key = buildGroupLayerSourceKey(outer, 'linear')

    expect(key).toContain('inner')
    expect(key).toContain('leaf')
  })
})
