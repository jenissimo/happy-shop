import { describe, expect, test } from 'bun:test'
import type { RenderLayerEffect } from '../../contracts/RenderDocumentView'
import {
  MAX_SCALED_EFFECT_PAD,
  scaleEffectGeometry,
  scaleFilterPadding,
} from './effectPassScale'

const stroke: RenderLayerEffect = {
  id: 'stroke-1',
  type: 'stroke',
  enabled: true,
  blendMode: 'normal',
  color: '#000000',
  opacity: 1,
  size: 15,
  position: 'outside',
}

const dropShadow: RenderLayerEffect = {
  id: 'shadow-1',
  type: 'drop-shadow',
  enabled: true,
  blendMode: 'multiply',
  color: '#000000',
  opacity: 1,
  angle: 120,
  distance: 10,
  spread: 20,
  size: 8,
  contour: 'linear',
  noise: 0,
  layerKnocksOutDropShadow: true,
}

describe('scaleEffectGeometry', () => {
  test('returns the same object at scale 1', () => {
    expect(scaleEffectGeometry(stroke, 1)).toBe(stroke)
  })

  test('scales stroke size into pass pixels', () => {
    const scaled = scaleEffectGeometry(stroke, 2)
    expect(scaled.type === 'stroke' && scaled.size).toBe(30)
  })

  test('scales shadow size and distance, not percentage spread', () => {
    const scaled = scaleEffectGeometry(dropShadow, 0.5)
    if (scaled.type !== 'drop-shadow') throw new Error('type changed')
    expect(scaled.size).toBe(4)
    expect(scaled.distance).toBe(5)
    expect(scaled.spread).toBe(20)
  })

  test('scales blur radius', () => {
    const blur: RenderLayerEffect = {
      id: 'blur-1',
      type: 'gaussian-blur',
      enabled: true,
      radius: 6,
    }
    const scaled = scaleEffectGeometry(blur, 3)
    expect(scaled.type === 'gaussian-blur' && scaled.radius).toBe(18)
  })

  test('leaves colour-only effects alone', () => {
    const overlay: RenderLayerEffect = {
      id: 'overlay-1',
      type: 'color-overlay',
      enabled: true,
      blendMode: 'normal',
      color: '#ff0000',
      opacity: 1,
    }
    expect(scaleEffectGeometry(overlay, 4)).toEqual(overlay)
  })
})

describe('scaleFilterPadding', () => {
  test('scales and rounds up so the region never lands short', () => {
    expect(scaleFilterPadding(15, 1.953125)).toBe(30)
  })

  test('clamps pathological stacks at high zoom', () => {
    expect(scaleFilterPadding(512, 8)).toBe(MAX_SCALED_EFFECT_PAD)
  })
})
