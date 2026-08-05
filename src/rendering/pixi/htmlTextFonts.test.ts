import { afterEach, describe, expect, test } from 'bun:test'
import { Cache } from 'pixi.js'
import {
  htmlTextFontFamily,
  htmlTextFontsVersion,
  primaryFontFamily,
  registerHtmlTextFont,
  resetHtmlTextFontsForTests,
} from './htmlTextFonts'

afterEach(() => resetHtmlTextFontsForTests())

describe('primaryFontFamily', () => {
  test('takes the first family of a stack, unquoted', () => {
    expect(primaryFontFamily('Inter, sans-serif')).toBe('Inter')
    expect(primaryFontFamily('"Source Serif 4", Georgia, serif')).toBe('Source Serif 4')
    expect(primaryFontFamily('Lobster')).toBe('Lobster')
  })
})

describe('registerHtmlTextFont', () => {
  test('exposes the bare family and hands Pixi a URL to inline', () => {
    expect(htmlTextFontFamily('Inter, sans-serif')).toBeUndefined()

    registerHtmlTextFont('Inter, sans-serif', new ArrayBuffer(8), [
      { weight: '100 900', style: 'normal' },
    ])

    // A stack would never match the `@font-face` rule Pixi generates, which is
    // keyed on the whole family string.
    expect(htmlTextFontFamily('Inter, sans-serif')).toBe('Inter')
    const cached = Cache.get<{ entries: { url: string; faces: unknown[] }[] }>('Inter-and-url')
    expect(cached.entries).toHaveLength(1)
    expect(cached.entries[0]!.url).toStartWith('blob:')
  })

  test('bumps the version so rasterized layers re-style', () => {
    const before = htmlTextFontsVersion()
    registerHtmlTextFont('Lobster', new ArrayBuffer(8), [{ weight: '400', style: 'normal' }])
    expect(htmlTextFontsVersion()).toBe(before + 1)
  })

  test('adds further weights of a family without re-registering the first', () => {
    registerHtmlTextFont('Lobster', new ArrayBuffer(8), [{ weight: '400', style: 'normal' }])
    const afterFirst = htmlTextFontsVersion()

    registerHtmlTextFont('Lobster', new ArrayBuffer(8), [{ weight: '400', style: 'normal' }])
    expect(htmlTextFontsVersion()).toBe(afterFirst)

    registerHtmlTextFont('Lobster', new ArrayBuffer(8), [{ weight: '700', style: 'normal' }])
    expect(htmlTextFontsVersion()).toBe(afterFirst + 1)
    expect(
      Cache.get<{ entries: unknown[] }>('Lobster-and-url').entries,
    ).toHaveLength(2)
  })
})
