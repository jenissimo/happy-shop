import { afterEach, describe, expect, test } from 'bun:test'
import type { TextLayer } from '../../../core/document'
import { clearGoogleFontMemoryCacheForTests, putCachedGoogleFont } from './fontCache'
import { recoverGoogleFontForLayer } from './googleFontRecovery'
import { googleFontUnavailableMessage } from '../textRasterize'

const layer = {
  type: 'text',
  content: 'Retry me',
  fontFamily: 'Montserrat',
  fontSource: {
    kind: 'google-fonts',
    catalogId: 'montserrat',
    weight: 400,
    style: 'normal',
    version: 'v26',
  },
} as TextLayer

describe('googleFontRecovery', () => {
  afterEach(() => {
    clearGoogleFontMemoryCacheForTests()
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { onLine: true },
    })
  })

  test('returns offline-and-uncached when offline with no cache', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { onLine: false },
    })

    const resolution = await recoverGoogleFontForLayer(layer)
    expect(resolution).toEqual({
      ok: false,
      reason: 'offline-and-uncached',
      catalogId: 'montserrat',
      family: 'Montserrat',
    })
  })

  test('registers cached bytes without a network fetch', async () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        fonts: {
          add: () => {},
          ready: Promise.resolve(),
        },
      },
    })
    class MockFontFace {
      load = async () => this
      constructor(_family: string, _bytes: ArrayBuffer, _desc: unknown) {}
    }
    Object.defineProperty(globalThis, 'FontFace', {
      configurable: true,
      value: MockFontFace,
    })

    await putCachedGoogleFont({
      id: 'montserrat',
      weight: 400,
      style: 'normal',
      version: 'v26',
      bytes: new Uint8Array([0, 1, 2]).buffer,
      family: 'Montserrat',
      license: 'OFL-1.1',
      licenseText: 'OFL',
      sourceUrl: 'https://fonts.gstatic.com/example.woff2',
      fetchedAt: Date.now(),
      byteLength: 3,
    })

    const resolution = await recoverGoogleFontForLayer(layer)
    expect(resolution).toEqual({ ok: true })
  })
})

describe('googleFontUnavailableMessage', () => {
  test('uses the spec offline copy for uncached faces', () => {
    expect(googleFontUnavailableMessage({
      ok: false,
      reason: 'offline-and-uncached',
      catalogId: 'montserrat',
      family: 'Montserrat, sans-serif',
    })).toBe('"Montserrat" isn\'t available offline. Connect to the internet to fetch it, or choose a different font for this layer.')
  })
})
