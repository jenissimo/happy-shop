import type { DecodeLimits } from './protocol'

/**
 * Pure decode-limit check, extracted from the worker message handler so it
 * can be unit tested without spinning up a real `Worker`/`createImageBitmap`.
 */
export type DecodeLimitCheck =
  | { ok: true; overSoftLimit: boolean }
  | { ok: false; code: string; message: string }

export function checkDecodeLimits(
  width: number,
  height: number,
  limits: DecodeLimits,
): DecodeLimitCheck {
  if (width > limits.maxSide || height > limits.maxSide) {
    return {
      ok: false,
      code: 'dimension-limit-exceeded',
      message: `Image ${width}x${height} exceeds the ${limits.maxSide}px per-side limit.`,
    }
  }

  const megapixels = (width * height) / 1_000_000
  const overSoftLimit =
    limits.softMegapixelLimit != null && megapixels > limits.softMegapixelLimit

  return { ok: true, overSoftLimit }
}
