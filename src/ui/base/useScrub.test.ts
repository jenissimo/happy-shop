import { describe, expect, test } from 'bun:test'
import { scrubModifierScale, scrubValue } from './useScrub'

describe('useScrub', () => {
  test('uses the canonical modifier scales', () => {
    expect(scrubModifierScale(false, false)).toBe(1)
    expect(scrubModifierScale(true, false)).toBe(10)
    expect(scrubModifierScale(false, true)).toBe(0.1)
    expect(scrubModifierScale(true, true)).toBe(0.01)
  })

  test('snaps to step and clamps the emitted value', () => {
    const options = {
      value: 5,
      step: 0.5,
      min: 0,
      max: 10,
      onChange: () => {},
    }
    expect(scrubValue(options, 3.2, { shiftKey: false, altKey: false })).toBe(6.5)
    expect(scrubValue(options, 20, { shiftKey: false, altKey: false })).toBe(10)
    expect(scrubValue(options, -20, { shiftKey: false, altKey: false })).toBe(0)
  })

  test('applies fine and coarse scales before snapping', () => {
    const options = { value: 10, step: 0.1, onChange: () => {} }
    expect(scrubValue(options, 2, { shiftKey: true, altKey: false })).toBe(12)
    expect(scrubValue(options, 10, { shiftKey: false, altKey: true })).toBe(10.1)
    expect(scrubValue(options, 100, { shiftKey: true, altKey: true })).toBe(10.1)
  })
})
