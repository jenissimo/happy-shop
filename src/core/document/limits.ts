/**
 * Canvas product limits — SPEC §1.3 / §8.2.
 *
 * `MAX_CANVAS_SIDE` is a hard limit enforced by validation. The megapixel
 * limit is soft: exceeding it does not make a document invalid, it just
 * means the caller should ask the user to confirm before proceeding.
 */
export const MAX_CANVAS_SIDE = 8192
export const SOFT_MEGAPIXEL_LIMIT = 64

export function computeMegapixels(width: number, height: number): number {
  return (width * height) / 1_000_000
}

export function exceedsSoftMegapixelLimit(
  width: number,
  height: number,
): boolean {
  return computeMegapixels(width, height) > SOFT_MEGAPIXEL_LIMIT
}

export function exceedsMaxSide(width: number, height: number): boolean {
  return width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE
}
