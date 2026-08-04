import { afterEach, describe, expect, test } from 'bun:test'
import type { TextLayer } from '../../../core/document'
import { clearGoogleFontMemoryCacheForTests, putCachedGoogleFont } from './googleFonts/fontCache'
import { GoogleFontUnavailableError, ensureTextFontLoaded, rasterizeTextLayerToBitmap } from './textRasterize'

type RegisteredFace = {
  family: string
  bytes: ArrayBuffer
  descriptors: { weight?: string; style?: string; variationSettings?: string }
}

const originalDocument = globalThis.document
const originalFontFace = globalThis.FontFace

/**
 * Registering a committed face needs `document.fonts` + `FontFace`, which Bun
 * does not provide. Stubbing both here keeps the assertion offline and
 * order-independent instead of relying on whatever globals a previous test file
 * happened to leave behind.
 */
function installFontEnvironment(): RegisteredFace[] {
  const registered: RegisteredFace[] = []
  class StubFontFace {
    constructor(
      readonly family: string,
      readonly bytes: ArrayBuffer,
      readonly descriptors: RegisteredFace['descriptors'],
    ) {}
    load = async () => this
  }
  Object.defineProperty(globalThis, 'FontFace', { configurable: true, value: StubFontFace })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      fonts: {
        add: (face: StubFontFace) =>
          registered.push({ family: face.family, bytes: face.bytes, descriptors: face.descriptors }),
        ready: Promise.resolve(),
      },
    },
  })
  return registered
}

describe('Google Font bake safety', () => {
  afterEach(() => {
    clearGoogleFontMemoryCacheForTests()
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
    Object.defineProperty(globalThis, 'FontFace', { configurable: true, value: originalFontFace })
  })

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
    const registered = installFontEnvironment()
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
    expect(registered).toHaveLength(1)
    expect(registered[0]?.family).toBe('Roboto')
    expect(registered[0]?.descriptors.variationSettings).toBe("'wdth' 100, 'wght' 550")
  })

  test('stays resolvable when the host exposes no FontFace constructor', async () => {
    clearGoogleFontMemoryCacheForTests()
    const bytes = new Uint8Array([9, 9]).buffer
    await putCachedGoogleFont({
      id: 'roboto',
      weight: 400,
      style: 'normal',
      version: 'v51',
      bytes,
      family: 'Roboto',
      license: 'OFL-1.1',
      licenseText: 'OFL',
      sourceUrl: 'https://fonts.gstatic.com/s/roboto/v51/static.woff2',
      fetchedAt: 1,
      byteLength: bytes.byteLength,
    })
    // A host with `document.fonts` but no `FontFace` must degrade to "loaded"
    // rather than throwing a ReferenceError past the FontResolution contract.
    Object.defineProperty(globalThis, 'FontFace', { configurable: true, value: undefined })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { fonts: { add: () => undefined, ready: Promise.resolve() } },
    })

    const layer = {
      type: 'text',
      content: 'Static',
      fontFamily: 'Roboto',
      fontSource: {
        kind: 'google-fonts',
        catalogId: 'roboto',
        weight: 400,
        style: 'normal',
        version: 'v51',
      },
    } as TextLayer

    await expect(ensureTextFontLoaded(layer)).resolves.toEqual({ ok: true })
  })
})
