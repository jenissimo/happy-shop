import { describe, expect, test } from 'bun:test'
import { ADJUSTMENT_MODE, adjustmentUniforms } from './adjustmentUniforms'

describe('adjustmentUniforms', () => {
  test('packs brightness/contrast into the first two slots', () => {
    expect(
      adjustmentUniforms({ type: 'brightness-contrast', brightness: 0.2, contrast: -0.1 }),
    ).toEqual({ mode: ADJUSTMENT_MODE.brightnessContrast, params: [0.2, -0.1, 0] })
  })

  test('packs hue/saturation in hue, saturation, lightness order', () => {
    expect(
      adjustmentUniforms({
        type: 'hue-saturation',
        hueDeg: 45,
        saturation: 0.5,
        lightness: -0.25,
      }),
    ).toEqual({ mode: ADJUSTMENT_MODE.hueSaturation, params: [45, 0.5, -0.25] })
  })

  test('packs levels in black, white, gamma order', () => {
    expect(
      adjustmentUniforms({ type: 'levels', black: 10, white: 240, gamma: 1.2 }),
    ).toEqual({ mode: ADJUSTMENT_MODE.levels, params: [10, 240, 1.2] })
  })

  test('curves falls back to the identity mode instead of wrong colours', () => {
    expect(
      adjustmentUniforms({ type: 'curves', master: [{ x: 0, y: 0 }, { x: 255, y: 255 }] }),
    ).toEqual({ mode: ADJUSTMENT_MODE.unsupported, params: [0, 0, 0] })
  })
})
