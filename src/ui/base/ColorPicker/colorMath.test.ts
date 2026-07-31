import { describe, expect, test } from 'bun:test'
import {
  formatHex,
  hsbToRgb,
  hslToRgb,
  parseColor,
  rgbToHsb,
  rgbToHsl,
} from './colorMath'

describe('parseColor / formatHex', () => {
  test('parses #rrggbb', () => {
    expect(parseColor('#ff8000')).toEqual({
      rgb: { r: 255, g: 128, b: 0 },
      a: 1,
    })
  })

  test('parses #rgb shorthand', () => {
    expect(parseColor('#f80')).toEqual({
      rgb: { r: 255, g: 136, b: 0 },
      a: 1,
    })
  })

  test('parses #rrggbbaa', () => {
    const c = parseColor('#00ff0080')
    expect(c.rgb).toEqual({ r: 0, g: 255, b: 0 })
    expect(c.a).toBeCloseTo(128 / 255, 3)
  })

  test('formatHex omits opaque alpha', () => {
    expect(formatHex({ r: 255, g: 0, b: 0 }, 1, true)).toBe('#ff0000')
  })

  test('formatHex includes translucent alpha', () => {
    expect(formatHex({ r: 0, g: 0, b: 0 }, 0.5, true)).toBe('#00000080')
  })
})

describe('rgb ↔ hsb', () => {
  test('red round-trip', () => {
    const rgb = { r: 255, g: 0, b: 0 }
    const hsb = rgbToHsb(rgb)
    expect(hsb.h).toBeCloseTo(0, 5)
    expect(hsb.s).toBeCloseTo(100, 5)
    expect(hsb.b).toBeCloseTo(100, 5)
    expect(hsbToRgb(hsb)).toEqual(rgb)
  })

  test('green / blue / gray', () => {
    expect(hsbToRgb({ h: 120, s: 100, b: 100 })).toEqual({
      r: 0,
      g: 255,
      b: 0,
    })
    expect(hsbToRgb({ h: 240, s: 100, b: 100 })).toEqual({
      r: 0,
      g: 0,
      b: 255,
    })
    expect(hsbToRgb({ h: 0, s: 0, b: 50 })).toEqual({
      r: 128,
      g: 128,
      b: 128,
    })
  })

  test('black and white', () => {
    expect(rgbToHsb({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, b: 0 })
    expect(rgbToHsb({ r: 255, g: 255, b: 255 })).toEqual({
      h: 0,
      s: 0,
      b: 100,
    })
  })
})

describe('rgb ↔ hsl', () => {
  test('red round-trip', () => {
    const rgb = { r: 255, g: 0, b: 0 }
    const hsl = rgbToHsl(rgb)
    expect(hsl.h).toBeCloseTo(0, 5)
    expect(hsl.s).toBeCloseTo(100, 5)
    expect(hsl.l).toBeCloseTo(50, 5)
    expect(hslToRgb(hsl)).toEqual(rgb)
  })

  test('mid gray', () => {
    const hsl = rgbToHsl({ r: 128, g: 128, b: 128 })
    expect(hsl.s).toBeCloseTo(0, 5)
    expect(hsl.l).toBeCloseTo(50.2, 0)
  })
})
