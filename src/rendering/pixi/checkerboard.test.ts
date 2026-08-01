import { describe, expect, test } from 'bun:test'
import {
  checkerColorsEqual,
  DEFAULT_CHECKERBOARD_COLORS,
  readCheckerboardColors,
} from './checkerboard'

function mockStyle(vars: Record<string, string>): CSSStyleDeclaration {
  return {
    getPropertyValue(name: string) {
      return vars[name] ?? ''
    },
  } as CSSStyleDeclaration
}

describe('readCheckerboardColors', () => {
  test('reads --he-checker-a/b from computed style', () => {
    expect(
      readCheckerboardColors(
        mockStyle({
          '--he-checker-a': '#e8ecf1',
          '--he-checker-b': '#cfd6de',
        }),
      ),
    ).toEqual({ light: '#e8ecf1', dark: '#cfd6de' })
  })

  test('trims whitespace around values', () => {
    expect(
      readCheckerboardColors(
        mockStyle({
          '--he-checker-a': '  #fff  ',
          '--he-checker-b': ' #000 ',
        }),
      ),
    ).toEqual({ light: '#fff', dark: '#000' })
  })

  test('falls back to dark defaults when vars are empty', () => {
    expect(readCheckerboardColors(mockStyle({}))).toEqual(DEFAULT_CHECKERBOARD_COLORS)
  })
})

describe('checkerColorsEqual', () => {
  test('compares both cells', () => {
    expect(
      checkerColorsEqual(
        { light: '#a', dark: '#b' },
        { light: '#a', dark: '#b' },
      ),
    ).toBe(true)
    expect(
      checkerColorsEqual(
        { light: '#a', dark: '#b' },
        { light: '#a', dark: '#c' },
      ),
    ).toBe(false)
  })
})
