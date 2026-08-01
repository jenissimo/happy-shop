import { describe, expect, test } from 'bun:test'
import { cssQuoteFontFamily } from './cssQuoteFontFamily'

describe('cssQuoteFontFamily', () => {
  test('leaves simple identifiers unquoted', () => {
    expect(cssQuoteFontFamily('Roboto')).toBe('Roboto')
    expect(cssQuoteFontFamily('Inter')).toBe('Inter')
  })

  test('quotes multi-word families', () => {
    expect(cssQuoteFontFamily('Open Sans')).toBe('"Open Sans"')
    expect(cssQuoteFontFamily('Playfair Display')).toBe('"Playfair Display"')
  })

  test('preserves existing stacks and quotes', () => {
    expect(cssQuoteFontFamily('Inter, sans-serif')).toBe('Inter, sans-serif')
    expect(cssQuoteFontFamily('"Source Serif 4", Georgia, serif')).toBe(
      '"Source Serif 4", Georgia, serif',
    )
  })
})
