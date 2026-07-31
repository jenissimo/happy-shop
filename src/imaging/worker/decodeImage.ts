/**
 * Core decode path used by the imaging worker (SPEC §14/§16).
 *
 * Extracted so unit tests can inject a fake `createImageBitmap` — Bun's test
 * runtime does not provide a real Worker/`createImageBitmap` implementation.
 */

import { checkDecodeLimits } from './decodeLimits'
import type { DecodeLimits, DecodeResultPayload } from './protocol'

export type CreateImageBitmapFn = (
  image: Blob,
  options?: ImageBitmapOptions,
) => Promise<ImageBitmap>

export type DecodeImageOk = { ok: true; payload: DecodeResultPayload }
export type DecodeImageErr = { ok: false; code: string; message: string }
export type DecodeImageOutcome = DecodeImageOk | DecodeImageErr

/**
 * Decodes a PNG/JPEG/WebP blob and enforces hard/soft dimension limits.
 * On hard-limit failure the temporary bitmap is closed before returning.
 *
 * EXIF orientation is left to the platform decoder (SPEC §14).
 */
export async function decodeImageBlob(
  blob: Blob,
  limits: DecodeLimits,
  createBitmap: CreateImageBitmapFn = createImageBitmap as CreateImageBitmapFn,
): Promise<DecodeImageOutcome> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createBitmap(blob)
  } catch (err) {
    return {
      ok: false,
      code: 'decode-failed',
      message: err instanceof Error ? err.message : String(err),
    }
  }

  const check = checkDecodeLimits(bitmap.width, bitmap.height, limits)
  if (!check.ok) {
    bitmap.close()
    return { ok: false, code: check.code, message: check.message }
  }

  return {
    ok: true,
    payload: {
      width: bitmap.width,
      height: bitmap.height,
      bitmap,
      overSoftLimit: check.overSoftLimit,
    },
  }
}
