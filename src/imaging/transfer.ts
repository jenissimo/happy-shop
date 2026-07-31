/**
 * Collects Transferable values that should ride on `postMessage` transfer
 * lists (SPEC §16) — large `ArrayBuffer`s and `ImageBitmap`s.
 */

export function collectTransferables(...values: unknown[]): Transferable[] {
  const out: Transferable[] = []
  for (const value of values) {
    if (value instanceof ArrayBuffer) {
      out.push(value)
      continue
    }
    if (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) {
      out.push(value)
      continue
    }
  }
  return out
}

/** Walk a shallow object and collect transferables from its own values. */
export function collectTransferablesFromPayload(payload: unknown): Transferable[] {
  if (payload == null || typeof payload !== 'object') {
    return collectTransferables(payload)
  }
  return collectTransferables(...Object.values(payload as Record<string, unknown>))
}
