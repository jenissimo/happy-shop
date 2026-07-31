import { describe, expect, test } from 'bun:test'
import { nearestPaletteColor } from './nearestColor'

const DB16 = [
  '#140C1C',
  '#442434',
  '#30346D',
  '#4E4A4E',
  '#854C30',
  '#346524',
  '#D04648',
  '#757161',
  '#597DCE',
  '#D27D2C',
  '#8595A1',
  '#6DAA2C',
  '#D2AA99',
  '#6DC2CA',
  '#DAD45E',
  '#DEEED6',
] as const

describe('nearestPaletteColor', () => {
  test('returns input when palette is empty', () => {
    expect(nearestPaletteColor('#ff0000', [])).toBe('#ff0000')
  })

  test('snaps to exact swatch when already on palette', () => {
    expect(nearestPaletteColor('#d04648', DB16)).toBe('#d04648')
    expect(nearestPaletteColor('#D04648', DB16)).toBe('#d04648')
  })

  test('snaps off-palette color to nearest swatch', () => {
    expect(nearestPaletteColor('#000000', DB16)).toBe('#140c1c')
    expect(nearestPaletteColor('#ffffff', DB16)).toBe('#deeed6')
  })

  test('preserves invalid input unchanged', () => {
    expect(nearestPaletteColor('not-a-color', DB16)).toBe('not-a-color')
  })
})
