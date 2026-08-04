import { describe, expect, test } from 'bun:test'
import { needsDissolveFilter, nodeAlpha, pixiBlendMode } from './blendModeSupport'

describe('pixiBlendMode', () => {
  test('degrades the two modes Pixi has no equation for', () => {
    expect(pixiBlendMode('dissolve')).toBe('normal')
    expect(pixiBlendMode('pass-through')).toBe('normal')
  })

  test('passes real blend equations through untouched', () => {
    expect(pixiBlendMode('multiply')).toBe('multiply')
    expect(pixiBlendMode('luminosity')).toBe('luminosity')
    expect(pixiBlendMode('normal')).toBe('normal')
  })
})

describe('dissolve emulation', () => {
  test('only dissolve needs the filter', () => {
    expect(needsDissolveFilter('dissolve')).toBe(true)
    expect(needsDissolveFilter('normal')).toBe(false)
    expect(needsDissolveFilter('pass-through')).toBe(false)
  })

  test('dissolve moves layer opacity into the filter, others keep node alpha', () => {
    // Otherwise Pixi would fade the already-thresholded pixels a second time.
    expect(nodeAlpha('dissolve', 0.4)).toBe(1)
    expect(nodeAlpha('multiply', 0.4)).toBe(0.4)
  })
})
