import { describe, expect, test } from 'bun:test'
import {
  clearGoogleFontMemoryCacheForTests,
  getCachedGoogleFont,
  putCachedGoogleFont,
} from './fontCache'

describe('Google Font committed cache', () => {
  test('commits bytes and license metadata under the pinned cache key', async () => {
    clearGoogleFontMemoryCacheForTests()
    const bytes = new Uint8Array([1, 2, 3]).buffer
    await putCachedGoogleFont({
      id: 'roboto',
      weight: 400,
      style: 'normal',
      version: 'v30',
      bytes,
      family: 'Roboto',
      license: 'Apache-2.0',
      licenseText: 'Apache License',
      sourceUrl: 'https://fonts.gstatic.com/s/roboto/v30/example.woff2',
      fetchedAt: 1,
      byteLength: 3,
    })

    const cached = await getCachedGoogleFont({
      id: 'roboto',
      weight: 400,
      style: 'normal',
      version: 'v30',
    })

    expect(cached?.family).toBe('Roboto')
    expect(new Uint8Array(cached!.bytes)).toEqual(new Uint8Array([1, 2, 3]))
    expect(cached?.licenseText).toBe('Apache License')
  })

  test('keys pinned variable instances separately from static defaults', async () => {
    clearGoogleFontMemoryCacheForTests()
    const bytes = new Uint8Array([9, 8, 7]).buffer
    await putCachedGoogleFont({
      id: 'roboto',
      weight: 550,
      style: 'normal',
      version: 'v30',
      variationPin: 'deadbeef',
      bytes,
      family: 'Roboto',
      license: 'OFL-1.1',
      licenseText: 'OFL',
      sourceUrl: 'https://fonts.gstatic.com/s/roboto/v30/variable.woff2',
      fetchedAt: 2,
      byteLength: 3,
      pinnedAxes: { wght: 550, wdth: 100 },
    })

    const pinned = await getCachedGoogleFont({
      id: 'roboto',
      weight: 550,
      style: 'normal',
      version: 'v30',
      variationPin: 'deadbeef',
    })
    const staticOnly = await getCachedGoogleFont({
      id: 'roboto',
      weight: 550,
      style: 'normal',
      version: 'v30',
    })

    expect(pinned?.pinnedAxes?.wght).toBe(550)
    expect(staticOnly).toBeUndefined()
  })
})
