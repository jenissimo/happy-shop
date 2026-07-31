/**
 * Imaging Dedicated Worker (SPEC §16). One instance runs per editor session
 * on the main thread's behalf. This file MUST NOT import React or Pixi —
 * only platform APIs and the pure protocol/limit helpers below.
 *
 * `self` is typed loosely via `globalThis` instead of pulling in the
 * `webworker` lib (which would conflict with the `dom` lib already used by
 * the rest of the app's tsconfig).
 */
import { collectTransferablesFromPayload } from '../transfer'
import { decodeImageBlob } from './decodeImage'
import {
  applyChromaKeyBuffer,
  buildChromaFloodMask,
  scanOpaqueBounds,
} from './pixelScan'
import type { ImagingEvent, ImagingRequest } from './protocol'

type WorkerScope = {
  postMessage(message: ImagingEvent, transfer?: Transferable[]): void
  onmessage: ((event: MessageEvent<ImagingRequest>) => void) | null
  onerror: ((event: unknown) => void) | null
}

const scope = globalThis as unknown as WorkerScope

function postEvent(event: ImagingEvent, transfer?: Transferable[]): void {
  scope.postMessage(event, transfer)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Requests whose `cancel` message arrived before (or during) their work. */
const cancelledRequestIds = new Set<number>()

async function handleDecode(
  id: number,
  blob: Blob,
  limits: import('./protocol').DecodeLimits,
): Promise<void> {
  postEvent({ requestId: id, type: 'progress', completed: 0, total: 1 })

  const outcome = await decodeImageBlob(blob, limits)

  if (cancelledRequestIds.delete(id)) {
    if (outcome.ok) outcome.payload.bitmap.close()
    postEvent({
      requestId: id,
      type: 'error',
      code: 'cancelled',
      message: 'Decode was cancelled.',
    })
    return
  }

  if (!outcome.ok) {
    postEvent({
      requestId: id,
      type: 'error',
      code: outcome.code,
      message: outcome.message,
    })
    return
  }

  postEvent({ requestId: id, type: 'progress', completed: 1, total: 1 })
  postEvent(
    {
      requestId: id,
      type: 'result',
      payload: outcome.payload,
    },
    collectTransferablesFromPayload(outcome.payload),
  )
}

function handleScanOpaqueBounds(
  id: number,
  width: number,
  height: number,
  rgba: ArrayBuffer,
): void {
  if (cancelledRequestIds.delete(id)) {
    postEvent({
      requestId: id,
      type: 'error',
      code: 'cancelled',
      message: 'Scan was cancelled.',
    })
    return
  }
  const data = new Uint8ClampedArray(rgba)
  const bounds = scanOpaqueBounds(data, width, height)
  postEvent({ requestId: id, type: 'result', payload: bounds })
}

function handleApplyChromaKey(
  id: number,
  width: number,
  height: number,
  rgba: ArrayBuffer,
  params: import('./protocol').ChromaKeyRequestParams,
): void {
  if (cancelledRequestIds.delete(id)) {
    postEvent({
      requestId: id,
      type: 'error',
      code: 'cancelled',
      message: 'Chroma key was cancelled.',
    })
    return
  }
  const data = new Uint8ClampedArray(rgba)
  applyChromaKeyBuffer(data, {
    ...params,
    width,
    height,
  })
  postEvent(
    { requestId: id, type: 'result', payload: { rgba: data.buffer } },
    [data.buffer],
  )
}

function handleBuildChromaFloodMask(
  id: number,
  width: number,
  height: number,
  rgba: ArrayBuffer,
  params: import('./protocol').ChromaKeyRequestParams,
): void {
  if (cancelledRequestIds.delete(id)) {
    postEvent({
      requestId: id,
      type: 'error',
      code: 'cancelled',
      message: 'Chroma flood mask was cancelled.',
    })
    return
  }
  const mask = buildChromaFloodMask(new Uint8ClampedArray(rgba), {
    ...params,
    width,
    height,
  })
  postEvent(
    {
      requestId: id,
      type: 'result',
      payload: { width: mask.width, height: mask.height, mask: mask.data.buffer },
    },
    [mask.data.buffer],
  )
}

function handleUnimplemented(id: number, type: string): void {
  postEvent({
    requestId: id,
    type: 'error',
    code: 'not-implemented',
    message: `Imaging worker request "${type}" is not implemented yet.`,
  })
}

scope.onmessage = (event: MessageEvent<ImagingRequest>) => {
  const request = event.data
  switch (request.type) {
    case 'decode':
      void handleDecode(request.id, request.blob, request.limits)
      return
    case 'cancel':
      cancelledRequestIds.add(request.targetId)
      return
    case 'scan-opaque-bounds':
      handleScanOpaqueBounds(request.id, request.width, request.height, request.rgba)
      return
    case 'apply-chroma-key':
      handleApplyChromaKey(
        request.id,
        request.width,
        request.height,
        request.rgba,
        request.params,
      )
      return
    case 'build-chroma-flood-mask':
      handleBuildChromaFloodMask(
        request.id,
        request.width,
        request.height,
        request.rgba,
        request.params,
      )
      return
    case 'apply-stroke':
    case 'read-tiles':
    case 'encode':
      handleUnimplemented(request.id, request.type)
      return
    default: {
      const exhaustiveCheck: never = request
      void exhaustiveCheck
    }
  }
}

scope.onerror = (event: unknown) => {
  postEvent({
    requestId: -1,
    type: 'error',
    code: 'worker-error',
    message: errorMessage(event),
  })
}

export {}
