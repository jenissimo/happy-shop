import { describe, expect, test } from 'bun:test'
import { decodeImageBlob } from './decodeImage'
import type { CreateImageBitmapFn } from './decodeImage'

function fakeBitmap(width: number, height: number): ImageBitmap {
  let closed = false
  return {
    width,
    height,
    close: () => {
      closed = true
    },
    get __closed() {
      return closed
    },
  } as unknown as ImageBitmap
}

describe('decodeImageBlob', () => {
  test('returns dimensions and bitmap when within limits', async () => {
    const bitmap = fakeBitmap(800, 600)
    const createBitmap: CreateImageBitmapFn = async () => bitmap
    const result = await decodeImageBlob(
      new Blob(['x'], { type: 'image/png' }),
      { maxSide: 8192, softMegapixelLimit: 64 },
      createBitmap,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.width).toBe(800)
      expect(result.payload.height).toBe(600)
      expect(result.payload.bitmap).toBe(bitmap)
      expect(result.payload.overSoftLimit).toBe(false)
    }
  })

  test('flags soft megapixel overrun without failing', async () => {
    const bitmap = fakeBitmap(9000, 9000)
    const result = await decodeImageBlob(
      new Blob(['x']),
      { maxSide: 20000, softMegapixelLimit: 64 },
      async () => bitmap,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.overSoftLimit).toBe(true)
  })

  test('rejects hard side limit and closes the bitmap', async () => {
    const bitmap = fakeBitmap(9000, 600)
    const result = await decodeImageBlob(
      new Blob(['x']),
      { maxSide: 8192 },
      async () => bitmap,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('dimension-limit-exceeded')
    expect((bitmap as unknown as { __closed: boolean }).__closed).toBe(true)
  })

  test('maps createImageBitmap failures to decode-failed', async () => {
    const result = await decodeImageBlob(new Blob(['x']), { maxSide: 8192 }, async () => {
      throw new Error('bad format')
    })
    expect(result).toEqual({
      ok: false,
      code: 'decode-failed',
      message: 'bad format',
    })
  })
})
