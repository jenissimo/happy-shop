import { describe, expect, test } from 'bun:test'
import type { TextLayer } from '../../../core/document'
import { clearGoogleFontMemoryCacheForTests, putCachedGoogleFont } from './googleFonts/fontCache'
import { GoogleFontUnavailableError, ensureTextFontLoaded, rasterizeTextLayerToBitmap } from './textRasterize'

describe('Google Font bake safety', () => {
  test('hard-blocks rasterization when committed bytes are unavailable', async () => {
    const layer = {
      type: 'text',
      content: 'Never bake a fallback',
      fontFamily: 'Missing Google Font',
      fontSource: {
        kind: 'google-fonts',
        catalogId: 'missing-google-font',
        weight: 400,
        style: 'normal',
        version: 'v1',
      },
    } as TextLayer

    await expect(rasterizeTextLayerToBitmap(layer)).rejects.toBeInstanceOf(GoogleFontUnavailableError)
  })

  test('resolves pinned variable instances from the variationPin cache key', async () => {
    clearGoogleFontMemoryCacheForTests()
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer
    await putCachedGoogleFont({
      id: 'roboto',
      weight: 550,
      style: 'normal',
      version: 'v51',
      variationPin: 'a1b2c3d4',
      bytes,
      family: 'Roboto',
      license: 'OFL-1.1',
      licenseText: 'OFL',
      sourceUrl: 'https://fonts.gstatic.com/s/roboto/v51/variable.woff2',
      fetchedAt: 1,
      byteLength: bytes.byteLength,
      pinnedAxes: { wght: 550, wdth: 100 },
    })

    const layer = {
      type: 'text',
      content: 'Pinned',
      fontFamily: 'Roboto',
      fontSize: 16,
      fontWeight: 550,
      italic: false,
      fontSource: {
        kind: 'google-fonts',
        catalogId: 'roboto',
        weight: 550,
        style: 'normal',
        version: 'v51',
        variationPin: 'a1b2c3d4',
        axes: { wght: 550, wdth: 100 },
      },
    } as TextLayer

    await expect(ensureTextFontLoaded(layer)).resolves.toEqual({ ok: true })
  })
})
