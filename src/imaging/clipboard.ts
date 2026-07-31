/**
 * Clipboard image probing / writing (SPEC §13.4/§20, UX-PHOTOSHOP).
 * Reads `navigator.clipboard` for New Document / paste; writes PNG for Edit → Copy.
 */

export type ClipboardImageProbe = {
  blob: Blob
  width: number
  height: number
  mimeType: string
}

export type ProbeClipboardResult =
  | { status: 'found'; probe: ClipboardImageProbe }
  | { status: 'empty' }
  | { status: 'unsupported' }
  | { status: 'permission-denied' }
  | { status: 'error'; message: string }

export type WriteClipboardResult =
  | { status: 'ok' }
  | { status: 'unsupported' }
  | { status: 'permission-denied' }
  | { status: 'error'; message: string }

const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

type DimensionDecoder = (blob: Blob) => Promise<{ width: number; height: number }>

async function decodeDimensionsViaImageBitmap(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob)
  try {
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

function isPermissionError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'NotAllowedError' || err.name === 'SecurityError')
  )
}

type ClipboardReadApi = {
  read?: () => Promise<ClipboardItem[]>
  write?: (items: ClipboardItem[]) => Promise<void>
}

function getClipboardApi(): ClipboardReadApi | undefined {
  return (globalThis as { navigator?: { clipboard?: unknown } }).navigator
    ?.clipboard as ClipboardReadApi | undefined
}

/**
 * Probes the OS clipboard for a supported raster image and reports its
 * pixel dimensions without keeping a page-visible paste event around.
 * Permission denial and unsupported browsers both fail gracefully (they
 * return a status instead of throwing) so callers can render a fallback
 * "paste to detect" hint per the UX spec.
 *
 * `decodeDimensions` is injectable purely for unit testing — production
 * callers should omit it and get the `createImageBitmap`-based default.
 */
export async function probeClipboardImageSize(
  decodeDimensions: DimensionDecoder = decodeDimensionsViaImageBitmap,
): Promise<ProbeClipboardResult> {
  const clipboard = getClipboardApi()

  if (!clipboard || typeof clipboard.read !== 'function') {
    return { status: 'unsupported' }
  }

  let items: ClipboardItem[]
  try {
    items = await clipboard.read()
  } catch (err) {
    if (isPermissionError(err)) return { status: 'permission-denied' }
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }

  for (const item of items) {
    const mimeType = item.types.find((t) => SUPPORTED_IMAGE_TYPES.includes(t))
    if (!mimeType) continue
    try {
      const blob = await item.getType(mimeType)
      const { width, height } = await decodeDimensions(blob)
      return { status: 'found', probe: { blob, width, height, mimeType } }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  return { status: 'empty' }
}

/**
 * Writes an image blob to the OS clipboard as `image/png` (ClipboardItem).
 * Fails gracefully when the Clipboard API or write permission is unavailable.
 */
export async function writeClipboardImage(blob: Blob): Promise<WriteClipboardResult> {
  const clipboard = getClipboardApi()
  if (!clipboard || typeof clipboard.write !== 'function') {
    return { status: 'unsupported' }
  }

  const mimeType = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png'
  try {
    const item =
      typeof ClipboardItem !== 'undefined'
        ? new ClipboardItem({ [mimeType]: blob })
        : ({
            types: [mimeType],
            getType: async () => blob,
          } as unknown as ClipboardItem)
    await clipboard.write([item])
    return { status: 'ok' }
  } catch (err) {
    if (isPermissionError(err)) return { status: 'permission-denied' }
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}
