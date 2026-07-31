import { describe, expect, test } from 'bun:test'
import { effectsPadding, parseCssColorRgb, buildLayerFilters } from './buildLayerFilters'

describe('effectsPadding', () => {
  test('drop-shadow + stroke accumulate outward insets', () => {
    const pad = effectsPadding([
      {
        type: 'drop-shadow',
        enabled: true,
        blendMode: 'multiply',
        color: '#000000',
        opacity: 1,
        angle: 0,
        distance: 4,
        spread: 0,
        size: 8,
        contour: 'linear',
        noise: 0,
        layerKnocksOutDropShadow: true,
      },
      {
        type: 'stroke',
        enabled: true,
        blendMode: 'normal',
        color: '#ffffff',
        opacity: 1,
        size: 3,
        position: 'outside',
      },
    ])
    // drop-shadow ~20 + stroke 3 (accumulated, not max)
    expect(pad).toBeGreaterThanOrEqual(23)
  })

  test('two drop-shadows accumulate more than one', () => {
    const one = effectsPadding([
      {
        type: 'drop-shadow',
        enabled: true,
        blendMode: 'multiply',
        color: '#000000',
        opacity: 1,
        angle: 0,
        distance: 10,
        spread: 0,
        size: 10,
        contour: 'linear',
        noise: 0,
        layerKnocksOutDropShadow: true,
      },
    ])
    const two = effectsPadding([
      {
        type: 'drop-shadow',
        enabled: true,
        blendMode: 'multiply',
        color: '#000000',
        opacity: 1,
        angle: 0,
        distance: 10,
        spread: 0,
        size: 10,
        contour: 'linear',
        noise: 0,
        layerKnocksOutDropShadow: true,
      },
      {
        type: 'drop-shadow',
        enabled: true,
        blendMode: 'multiply',
        color: '#000000',
        opacity: 1,
        angle: 180,
        distance: 10,
        spread: 0,
        size: 10,
        contour: 'linear',
        noise: 0,
        layerKnocksOutDropShadow: true,
      },
    ])
    expect(two).toBeGreaterThan(one)
  })

  test('outer-glow inflates padding', () => {
    const pad = effectsPadding([
      {
        type: 'outer-glow',
        enabled: true,
        blendMode: 'screen',
        opacity: 1,
        noise: 0,
        technique: 'softer',
        color: '#ffff00',
        spread: 0,
        size: 10,
        contour: 'linear',
        range: 50,
        jitter: 0,
      },
    ])
    expect(pad).toBeGreaterThanOrEqual(20)
  })

  test('disabled effects ignored', () => {
    expect(
      effectsPadding([
        {
          type: 'stroke',
          enabled: false,
          blendMode: 'normal',
          color: '#000',
          opacity: 1,
          size: 10,
        },
      ]),
    ).toBe(0)
  })
})

describe('buildLayerFilters', () => {
  // Avoid constructing Pixi GL programs in unit CI — only exercise padding/color helpers
  // and the empty/fillOpacity early path (no Filter subclasses).
  test('returns null when no effects and fill is opaque', () => {
    expect(buildLayerFilters([])).toBeNull()
    expect(buildLayerFilters(undefined)).toBeNull()
  })
})

describe('parseCssColorRgb', () => {
  test('parses hex', () => {
    expect(parseCssColorRgb('#ff0000')).toEqual([1, 0, 0])
  })
})
