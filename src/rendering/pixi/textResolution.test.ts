import { describe, expect, test } from 'bun:test'
import {
  MAX_TEXT_RESOLUTION,
  steppedTextResolution,
} from './PixiRenderBackend'

describe('steppedTextResolution', () => {
  test('never rasterizes coarser than the screen', () => {
    // Rounding up: a 2.1x view gets a 4x raster, never a 2x one that would be
    // magnified past its pixels.
    expect(steppedTextResolution(1)).toBe(1)
    expect(steppedTextResolution(1.01)).toBe(2)
    expect(steppedTextResolution(2)).toBe(2)
    expect(steppedTextResolution(2.12)).toBe(4)
  })

  test('stays at 1 when the view is smaller than the document', () => {
    expect(steppedTextResolution(0.25)).toBe(1)
    expect(steppedTextResolution(0.72)).toBe(1)
  })

  test('caps so a long line cannot blow past GPU texture limits', () => {
    expect(steppedTextResolution(16)).toBe(MAX_TEXT_RESOLUTION)
  })
})
