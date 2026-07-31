import { describe, expect, test } from 'bun:test'
import { formatPressureHint } from './PressureCurveControls'

describe('PressureCurveControls', () => {
  test('formats the options-bar pressure hint from enabled channels', () => {
    expect(formatPressureHint(true, false, true)).toBe('Pen pressure: size, flow · ')
    expect(formatPressureHint(false, false, false)).toBe('')
    expect(formatPressureHint(false, true, false)).toBe('Pen pressure: opacity · ')
  })
})
