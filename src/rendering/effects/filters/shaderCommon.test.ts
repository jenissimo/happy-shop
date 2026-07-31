import { describe, expect, test } from 'bun:test'
import { blendModeToUniform } from './shaderCommon'

describe('blendModeToUniform', () => {
  test('maps every persisted blend mode', () => {
    expect(
      [
        'normal',
        'multiply',
        'screen',
        'overlay',
        'darken',
        'lighten',
        'color-dodge',
        'color-burn',
        'hard-light',
        'soft-light',
        'difference',
        'exclusion',
      ].map(blendModeToUniform),
    ).toEqual([...Array(12).keys()])
  })

  test('unsupported modes fall back to normal', () => {
    expect(blendModeToUniform('unknown-mode')).toBe(0)
    expect(blendModeToUniform(undefined)).toBe(0)
  })
})
