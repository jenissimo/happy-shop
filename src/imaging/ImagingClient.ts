import { collectTransferablesFromPayload } from './transfer'
import type {
  ChromaKeyRequestParams,
  DecodeLimits,
  DecodeResultPayload,
  ImagingEvent,
  ImagingRequest,
  OpaqueBoundsPayload,
} from './worker/protocol'

export type ImagingProgressHandler = (completed: number, total: number) => void

export type ChromaFloodMaskPayload = {
  width: number
  height: number
  /** A8 connectivity bytes: 255 = reachable from a flood seed. */
  mask: Uint8Array
}

export type DecodeOptions = {
  onProgress?: ImagingProgressHandler
  /** When aborted, posts a best-effort `cancel` to the worker. */
  signal?: AbortSignal
}

export class ImagingRequestError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ImagingRequestError'
    this.code = code
  }
}

/** Minimal Worker surface so unit tests can inject a mock under Bun. */
export type ImagingWorkerLike = {
  postMessage(message: unknown, transfer?: Transferable[]): void
  terminate(): void
  onmessage: ((event: MessageEvent<ImagingEvent>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

export type ImagingClientOptions = {
  /** Inject a mock worker (Bun has no real Dedicated Worker for this module). */
  worker?: ImagingWorkerLike
}

type PendingRequest = {
  resolve: (payload: unknown) => void
  reject: (err: unknown) => void
  onProgress?: ImagingProgressHandler
  abortHandler?: () => void
  signal?: AbortSignal
}

function createDefaultWorker(): ImagingWorkerLike {
  return new Worker(new URL('./worker/imagingWorker.ts', import.meta.url), {
    type: 'module',
    name: 'happy-shop-imaging',
  })
}

/**
 * Main-thread wrapper around the imaging Dedicated Worker (SPEC §16). One
 * instance is intended per editor session — see `getImagingClient()` below
 * for the session-scoped singleton.
 */
export class ImagingClient {
  private readonly worker: ImagingWorkerLike
  private nextRequestId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private disposed = false

  constructor(options: ImagingClientOptions = {}) {
    this.worker = options.worker ?? createDefaultWorker()
    this.worker.onmessage = (event: MessageEvent<ImagingEvent>) => {
      this.handleEvent(event.data)
    }
    this.worker.onerror = (event: ErrorEvent) => {
      this.rejectAll(new ImagingRequestError('worker-crashed', event.message))
    }
  }

  /**
   * Decodes an image blob (PNG/JPEG/WebP) off the main thread via
   * `createImageBitmap`. Resolves with a transferred `ImageBitmap` — the
   * caller owns it and is responsible for eventually calling `.close()`
   * (typically once it has been registered with a raster surface store).
   */
  decode(
    blob: Blob,
    limits: DecodeLimits,
    options: DecodeOptions = {},
  ): Promise<DecodeResultPayload> {
    if (options.signal?.aborted) {
      return Promise.reject(new ImagingRequestError('cancelled', 'Decode was cancelled.'))
    }

    const id = this.nextRequestId++
    const request: ImagingRequest = { id, type: 'decode', blob, limits }

    return new Promise<unknown>((resolve, reject) => {
      const pending: PendingRequest = {
        resolve,
        reject,
        onProgress: options.onProgress,
        signal: options.signal,
      }

      if (options.signal) {
        pending.abortHandler = () => {
          this.cancel(id)
        }
        options.signal.addEventListener('abort', pending.abortHandler, { once: true })
      }

      this.pending.set(id, pending)
      // Blob is structured-cloneable; transfer list is empty for decode.
      // Future ArrayBuffer/ImageBitmap request fields use `send` transfers.
      this.send(request)
    }).then((payload) => payload as DecodeResultPayload)
  }

  /**
   * Off-main-thread opaque-bounds scan for trim (transfers the RGBA buffer).
   * The caller's copy of `rgba.buffer` is detached after send when transferable.
   */
  scanOpaqueBounds(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
  ): Promise<OpaqueBoundsPayload> {
    const id = this.nextRequestId++
    const copy = rgba.slice().buffer
    const request: ImagingRequest = {
      id,
      type: 'scan-opaque-bounds',
      width,
      height,
      rgba: copy,
    }
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.send(request, [copy])
    }).then((payload) => payload as OpaqueBoundsPayload)
  }

  /**
   * Off-main-thread CIE Lab chroma key. Returns a new RGBA buffer (transferred).
   */
  applyChromaKey(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    params: ChromaKeyRequestParams,
  ): Promise<Uint8ClampedArray> {
    const id = this.nextRequestId++
    const copy = rgba.slice().buffer
    const request: ImagingRequest = {
      id,
      type: 'apply-chroma-key',
      width,
      height,
      rgba: copy,
      params,
    }
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.send(request, [copy])
    }).then((payload) => {
      const { rgba: out } = payload as { rgba: ArrayBuffer }
      return new Uint8ClampedArray(out)
    })
  }

  /**
   * Builds the exact 4-connected chroma connectivity mask off the main thread.
   * The returned A8 bytes are suitable for a nearest-sampled GPU texture.
   */
  buildChromaFloodMask(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    params: ChromaKeyRequestParams,
  ): Promise<ChromaFloodMaskPayload> {
    const id = this.nextRequestId++
    const copy = rgba.slice().buffer
    const request: ImagingRequest = {
      id,
      type: 'build-chroma-flood-mask',
      width,
      height,
      rgba: copy,
      params,
    }
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.send(request, [copy])
    }).then((payload) => {
      const result = payload as { width: number; height: number; mask: ArrayBuffer }
      return {
        width: result.width,
        height: result.height,
        mask: new Uint8Array(result.mask),
      }
    })
  }

  /** Requests cancellation of an in-flight request by id. Best-effort. */
  cancel(targetId: number): void {
    if (this.disposed) return
    const id = this.nextRequestId++
    this.send({ id, type: 'cancel', targetId })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.rejectAll(new ImagingRequestError('disposed', 'ImagingClient was disposed.'))
    this.worker.terminate()
  }

  /**
   * Posts a request with an explicit transfer list for large
   * `ArrayBuffer`/`ImageBitmap` payloads (SPEC §16).
   */
  private send(request: ImagingRequest, transfer: Transferable[] = []): void {
    if (this.disposed) {
      throw new ImagingRequestError('disposed', 'ImagingClient was disposed.')
    }
    const auto = collectTransferablesFromPayload(request)
    const list = transfer.length > 0 ? transfer : auto
    this.worker.postMessage(request, list)
  }

  private handleEvent(event: ImagingEvent): void {
    if (event.type === 'tiles-dirty') return // handled by future raster store subscribers

    const pending = this.pending.get(event.requestId)
    if (!pending) return

    if (event.type === 'progress') {
      pending.onProgress?.(event.completed, event.total)
      return
    }

    this.pending.delete(event.requestId)
    this.detachAbort(pending)

    if (event.type === 'result') {
      pending.resolve(event.payload)
    } else {
      pending.reject(new ImagingRequestError(event.code, event.message))
    }
  }

  private detachAbort(pending: PendingRequest): void {
    if (pending.signal && pending.abortHandler) {
      pending.signal.removeEventListener('abort', pending.abortHandler)
    }
  }

  private rejectAll(err: unknown): void {
    for (const pending of this.pending.values()) {
      this.detachAbort(pending)
      pending.reject(err)
    }
    this.pending.clear()
  }
}

let sharedClient: ImagingClient | null = null

/** Lazily creates the one-per-session imaging worker client (SPEC §16). */
export function getImagingClient(): ImagingClient {
  if (!sharedClient) sharedClient = new ImagingClient()
  return sharedClient
}

export function disposeImagingClient(): void {
  sharedClient?.dispose()
  sharedClient = null
}
