/**
 * ImagingClient tests use an injectable mock Worker. Bun cannot host the real
 * Vite module worker (`new Worker(new URL(...))`) or `createImageBitmap`, so
 * decode correctness is covered by `decodeImageBlob` / `checkDecodeLimits`
 * unit tests; this file covers the typed message protocol, progress, cancel,
 * transfer lists, and error mapping on the main-thread client.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import {
  ImagingClient,
  ImagingRequestError,
  disposeImagingClient,
  type ImagingWorkerLike,
} from './ImagingClient'
import type { ImagingEvent, ImagingRequest } from './worker/protocol'

class MockWorker implements ImagingWorkerLike {
  onmessage: ((event: MessageEvent<ImagingEvent>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly posts: Array<{ message: unknown; transfer: Transferable[] }> = []
  terminated = false
  private readonly cancelled = new Set<number>()

  postMessage(message: unknown, transfer: Transferable[] = []): void {
    this.posts.push({ message, transfer: [...transfer] })
    const request = message as ImagingRequest
    if (request.type === 'cancel') {
      this.cancelled.add(request.targetId)
      return
    }
    if (request.type === 'decode') {
      queueMicrotask(() => this.respondDecode(request))
    }
  }

  terminate(): void {
    this.terminated = true
  }

  emit(event: ImagingEvent): void {
    this.onmessage?.({ data: event } as MessageEvent<ImagingEvent>)
  }

  private respondDecode(request: Extract<ImagingRequest, { type: 'decode' }>): void {
    if (this.cancelled.has(request.id)) {
      this.emit({
        requestId: request.id,
        type: 'error',
        code: 'cancelled',
        message: 'Decode was cancelled.',
      })
      return
    }

    this.emit({ requestId: request.id, type: 'progress', completed: 0, total: 1 })
    this.emit({ requestId: request.id, type: 'progress', completed: 1, total: 1 })

    const bitmap = {
      width: 32,
      height: 16,
      close() {},
    } as unknown as ImageBitmap

    this.emit({
      requestId: request.id,
      type: 'result',
      payload: {
        width: 32,
        height: 16,
        bitmap,
        overSoftLimit: false,
      },
    })
  }
}

afterEach(() => {
  disposeImagingClient()
})

describe('ImagingClient', () => {
  test('decode resolves with worker result and reports progress', async () => {
    const worker = new MockWorker()
    const client = new ImagingClient({ worker })
    const progress: Array<[number, number]> = []

    const result = await client.decode(
      new Blob(['png'], { type: 'image/png' }),
      { maxSide: 8192, softMegapixelLimit: 64 },
      {
        onProgress: (completed, total) => progress.push([completed, total]),
      },
    )

    expect(result.width).toBe(32)
    expect(result.height).toBe(16)
    expect(result.overSoftLimit).toBe(false)
    expect(progress).toEqual([
      [0, 1],
      [1, 1],
    ])

    const decodePost = worker.posts.find(
      (p) => (p.message as ImagingRequest).type === 'decode',
    )
    expect(decodePost).toBeDefined()
    expect(decodePost?.transfer).toEqual([])
  })

  test('cancel via AbortSignal posts cancel and rejects', async () => {
    const worker = new MockWorker()
    // Override decode to wait until cancelled.
    worker.postMessage = (message: unknown, transfer: Transferable[] = []) => {
      worker.posts.push({ message, transfer: [...transfer] })
      const request = message as ImagingRequest
      if (request.type === 'cancel') {
        queueMicrotask(() => {
          worker.emit({
            requestId: request.targetId,
            type: 'error',
            code: 'cancelled',
            message: 'Decode was cancelled.',
          })
        })
      }
    }

    const client = new ImagingClient({ worker })
    const controller = new AbortController()
    const pending = client.decode(new Blob(['x']), { maxSide: 8192 }, { signal: controller.signal })
    controller.abort()

    await expect(pending).rejects.toBeInstanceOf(ImagingRequestError)
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })
    expect(worker.posts.some((p) => (p.message as ImagingRequest).type === 'cancel')).toBe(true)
  })

  test('rejects immediately when signal is already aborted', async () => {
    const worker = new MockWorker()
    const client = new ImagingClient({ worker })
    const controller = new AbortController()
    controller.abort()
    await expect(
      client.decode(new Blob(['x']), { maxSide: 8192 }, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'cancelled' })
    expect(worker.posts).toEqual([])
  })

  test('maps worker error events to ImagingRequestError', async () => {
    const worker = new MockWorker()
    worker.postMessage = (message: unknown, transfer: Transferable[] = []) => {
      worker.posts.push({ message, transfer: [...transfer] })
      const request = message as ImagingRequest
      if (request.type === 'decode') {
        queueMicrotask(() => {
          worker.emit({
            requestId: request.id,
            type: 'error',
            code: 'dimension-limit-exceeded',
            message: 'too big',
          })
        })
      }
    }
    const client = new ImagingClient({ worker })
    await expect(client.decode(new Blob(['x']), { maxSide: 8192 })).rejects.toMatchObject({
      code: 'dimension-limit-exceeded',
      message: 'too big',
    })
  })

  test('transfers worker-generated chroma flood A8 masks', async () => {
    const worker = new MockWorker()
    worker.postMessage = (message: unknown, transfer: Transferable[] = []) => {
      worker.posts.push({ message, transfer: [...transfer] })
      const request = message as ImagingRequest
      if (request.type !== 'build-chroma-flood-mask') return
      queueMicrotask(() => {
        worker.emit({
          requestId: request.id,
          type: 'result',
          payload: { width: 2, height: 1, mask: new Uint8Array([255, 0]).buffer },
        })
      })
    }
    const client = new ImagingClient({ worker })
    const result = await client.buildChromaFloodMask(
      new Uint8ClampedArray(8),
      2,
      1,
      { keyR: 0, keyG: 255, keyB: 0, tolerance: 30, softness: 0, mode: 'flood' },
    )

    expect(result).toEqual({ width: 2, height: 1, mask: new Uint8Array([255, 0]) })
    const post = worker.posts.find(
      (entry) => (entry.message as ImagingRequest).type === 'build-chroma-flood-mask',
    )
    expect(post?.transfer).toHaveLength(1)
  })

  test('dispose terminates the worker and rejects pending work', async () => {
    const worker = new MockWorker()
    worker.postMessage = (message: unknown, transfer: Transferable[] = []) => {
      worker.posts.push({ message, transfer: [...transfer] })
      // never respond
    }
    const client = new ImagingClient({ worker })
    const pending = client.decode(new Blob(['x']), { maxSide: 8192 })
    client.dispose()
    expect(worker.terminated).toBe(true)
    await expect(pending).rejects.toMatchObject({ code: 'disposed' })
  })
})
