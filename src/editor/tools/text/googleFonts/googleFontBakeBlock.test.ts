import { afterEach, describe, expect, test } from 'bun:test'
import { clearGoogleFontBakeBlockForTests, useGoogleFontBakeBlockStore } from './googleFontBakeBlockStore'
import { GoogleFontUnavailableError } from '../textRasterize'
import { reportGoogleFontBakeBlock } from './reportGoogleFontBakeBlock'

describe('Google Font bake block banner wiring', () => {
  afterEach(() => {
    clearGoogleFontBakeBlockForTests()
  })

  test('reportGoogleFontBakeBlock stores retry context for hard-block errors', () => {
    const error = new GoogleFontUnavailableError({
      ok: false,
      reason: 'offline-and-uncached',
      catalogId: 'montserrat',
      family: 'Montserrat',
    }, 'layer-1')

    const reported = reportGoogleFontBakeBlock(error, 'layer-1', async () => {})
    expect(reported).toBe(true)
    expect(useGoogleFontBakeBlockStore.getState().block).toMatchObject({
      layerId: 'layer-1',
      resolution: {
        ok: false,
        reason: 'offline-and-uncached',
        catalogId: 'montserrat',
        family: 'Montserrat',
      },
    })
  })

  test('ignores non-Google-font errors', () => {
    expect(reportGoogleFontBakeBlock(new Error('nope'), 'layer-1', async () => {})).toBe(false)
    expect(useGoogleFontBakeBlockStore.getState().block).toBeNull()
  })
})
