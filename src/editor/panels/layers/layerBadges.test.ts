import { describe, expect, test } from 'bun:test'
import { hasTextLayerBadge } from './layerBadges'
import type { LayersPanelLayer } from './types'

function row(kind: LayersPanelLayer['kind']): LayersPanelLayer {
  return {
    id: 'layer-1',
    name: 'Layer',
    visible: true,
    locked: false,
    lockFlags: { transparentPixels: false, imagePixels: false, position: false },
    opacity: 1,
    fillOpacity: 1,
    blendMode: 'normal',
    hasEffects: false,
    effects: [],
    depth: 0,
    parentId: null,
    kind,
    hasMask: false,
    maskEnabled: true,
    maskHidesEffects: false,
  }
}

describe('Layers panel text badge', () => {
  test('appears only for live text layers', () => {
    expect(hasTextLayerBadge(row('text'))).toBe(true)
    expect(hasTextLayerBadge(row('raster'))).toBe(false)
    expect(hasTextLayerBadge(row('shape'))).toBe(false)
  })
})
