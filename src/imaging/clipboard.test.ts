import { afterEach, describe, expect, test } from 'bun:test'
import { probeClipboardImageSize, writeClipboardImage } from './clipboard'

type FakeNavigator = { clipboard?: unknown }

const originalNavigator = (globalThis as { navigator?: unknown }).navigator

function setNavigator(value: FakeNavigator | undefined): void {
  ;(globalThis as { navigator?: unknown }).navigator = value
}

afterEach(() => {
  setNavigator(originalNavigator as FakeNavigator | undefined)
})

function fakeItem(types: string[], blobByType: Record<string, Blob>) {
  return {
    types,
    getType: async (type: string) => {
      const blob = blobByType[type]
      if (!blob) throw new Error(`no blob for ${type}`)
      return blob
    },
  }
}

describe('probeClipboardImageSize', () => {
  test('reports unsupported when navigator.clipboard.read is missing', async () => {
    setNavigator({})
    const result = await probeClipboardImageSize()
    expect(result).toEqual({ status: 'unsupported' })
  })

  test('reports unsupported when navigator is undefined', async () => {
    setNavigator(undefined)
    const result = await probeClipboardImageSize()
    expect(result.status).toBe('unsupported')
  })

  test('reports empty when clipboard has no supported image type', async () => {
    setNavigator({
      clipboard: {
        read: async () => [fakeItem(['text/plain'], {})],
      },
    })
    const result = await probeClipboardImageSize()
    expect(result).toEqual({ status: 'empty' })
  })

  test('finds a supported image and reports decoded dimensions', async () => {
    const pngBlob = new Blob(['fake-png-bytes'], { type: 'image/png' })
    setNavigator({
      clipboard: {
        read: async () => [fakeItem(['image/png'], { 'image/png': pngBlob })],
      },
    })
    const result = await probeClipboardImageSize(async () => ({ width: 640, height: 480 }))
    expect(result.status).toBe('found')
    if (result.status === 'found') {
      expect(result.probe.width).toBe(640)
      expect(result.probe.height).toBe(480)
      expect(result.probe.mimeType).toBe('image/png')
      expect(result.probe.blob).toBe(pngBlob)
    }
  })

  test('reports permission-denied on a NotAllowedError DOMException', async () => {
    setNavigator({
      clipboard: {
        read: async () => {
          throw new DOMException('denied', 'NotAllowedError')
        },
      },
    })
    const result = await probeClipboardImageSize()
    expect(result).toEqual({ status: 'permission-denied' })
  })

  test('reports a generic error for other clipboard failures', async () => {
    setNavigator({
      clipboard: {
        read: async () => {
          throw new Error('boom')
        },
      },
    })
    const result = await probeClipboardImageSize()
    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.message).toBe('boom')
    }
  })

  test('skips unsupported items and finds the first supported one', async () => {
    const webpBlob = new Blob(['fake-webp'], { type: 'image/webp' })
    setNavigator({
      clipboard: {
        read: async () => [
          fakeItem(['text/html'], {}),
          fakeItem(['image/webp'], { 'image/webp': webpBlob }),
        ],
      },
    })
    const result = await probeClipboardImageSize(async () => ({ width: 100, height: 200 }))
    expect(result.status).toBe('found')
    if (result.status === 'found') {
      expect(result.probe.mimeType).toBe('image/webp')
    }
  })
})

describe('writeClipboardImage', () => {
  test('reports unsupported when clipboard.write is missing', async () => {
    setNavigator({ clipboard: {} })
    const result = await writeClipboardImage(new Blob(['x'], { type: 'image/png' }))
    expect(result).toEqual({ status: 'unsupported' })
  })

  test('writes a ClipboardItem when write is available', async () => {
    const written: unknown[] = []
    setNavigator({
      clipboard: {
        write: async (items: unknown[]) => {
          written.push(...items)
        },
      },
    })
    const blob = new Blob(['png'], { type: 'image/png' })
    const result = await writeClipboardImage(blob)
    expect(result).toEqual({ status: 'ok' })
    expect(written).toHaveLength(1)
  })

  test('reports permission-denied on NotAllowedError', async () => {
    setNavigator({
      clipboard: {
        write: async () => {
          throw new DOMException('denied', 'NotAllowedError')
        },
      },
    })
    const result = await writeClipboardImage(new Blob(['x'], { type: 'image/png' }))
    expect(result).toEqual({ status: 'permission-denied' })
  })
})
