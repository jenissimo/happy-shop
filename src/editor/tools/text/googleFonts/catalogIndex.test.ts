import { afterEach, describe, expect, test } from 'bun:test'
import { clearGoogleFontCatalogCacheForTests, loadGoogleFontFamily } from './catalogIndex'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  clearGoogleFontCatalogCacheForTests()
})

describe('Google Fonts family manifests', () => {
  test('resolves Inter and Montserrat downloadable manifests', async () => {
    globalThis.fetch = async (input) => {
      const url = String(input)
      expect(url === '/google-fonts/families/montserrat.json' || url === '/google-fonts/families/inter.json').toBe(true)
      const id = url.includes('inter') ? 'inter' : 'montserrat'
      return new Response(await Bun.file(`public/google-fonts/families/${id}.json`).text())
    }

    const montserrat = await loadGoogleFontFamily('montserrat')
    expect(montserrat.family).toBe('Montserrat')
    expect(montserrat.files[0]?.url).toEndWith('.woff2')

    clearGoogleFontCatalogCacheForTests()
    const inter = await loadGoogleFontFamily('inter')
    expect(inter.family).toBe('Inter')
    expect(inter.files[0]?.url).toEndWith('.woff2')
  })
})
