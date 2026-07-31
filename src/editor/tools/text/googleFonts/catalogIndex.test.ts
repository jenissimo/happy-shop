import { afterEach, describe, expect, test } from 'bun:test'
import { clearGoogleFontCatalogCacheForTests, loadGoogleFontFamily } from './catalogIndex'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  clearGoogleFontCatalogCacheForTests()
})

describe('Google Fonts curated manifests', () => {
  test('resolves a committed non-Roboto family manifest', async () => {
    globalThis.fetch = async (input) => {
      expect(String(input)).toBe('/google-fonts/families/montserrat.json')
      return new Response(await Bun.file('public/google-fonts/families/montserrat.json').text())
    }

    const family = await loadGoogleFontFamily('montserrat')

    expect(family.family).toBe('Montserrat')
    expect(family.files[0]?.url).toEndWith('.woff2')
  })
})
