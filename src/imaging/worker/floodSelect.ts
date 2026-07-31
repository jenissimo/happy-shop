/**
 * Contiguous flood → A8 selection mask (magic wand).
 * Pure kernel — safe for main-thread tests and imaging worker reuse.
 */

export type FloodSelectParams = {
  width: number
  height: number
  seedX: number
  seedY: number
  /** Max per-channel |Δ| vs seed color (0–255). */
  tolerance: number
  /**
   * When enabled, pixels in the one-unit tolerance fringe receive partial
   * coverage. Disabled is the crisp, Photoshop-style default.
   */
  antiAlias?: boolean
}

/**
 * 4-connected flood from seed through pixels within RGB tolerance.
 * Returns A8 mask (255 = selected). Empty if seed out of bounds / transparent.
 */
export function floodSelectMask(
  rgba: Uint8ClampedArray | Uint8Array,
  params: FloodSelectParams,
): Uint8Array {
  const { width, height, tolerance } = params
  const mask = new Uint8Array(width * height)
  const sx = params.seedX | 0
  const sy = params.seedY | 0
  if (
    width <= 0 ||
    height <= 0 ||
    rgba.length < width * height * 4 ||
    sx < 0 ||
    sy < 0 ||
    sx >= width ||
    sy >= height
  ) {
    return mask
  }

  const seedI = (sy * width + sx) * 4
  const seedA = rgba[seedI + 3]!
  if (seedA === 0) return mask

  const sr = rgba[seedI]!
  const sg = rgba[seedI + 1]!
  const sb = rgba[seedI + 2]!
  const sa = rgba[seedI + 3]!
  const tol = Math.max(0, Math.min(255, tolerance))

  const visited = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let qh = 0
  let qt = 0
  const start = sy * width + sx
  visited[start] = 1
  queue[qt++] = start

  while (qh < qt) {
    const p = queue[qh++]!
    const x = p % width
    const y = (p / width) | 0
    const i = p * 4
    if (rgba[i + 3]! === 0) continue
    const delta = Math.max(
      Math.abs(rgba[i]! - sr),
      Math.abs(rgba[i + 1]! - sg),
      Math.abs(rgba[i + 2]! - sb),
      Math.abs(rgba[i + 3]! - sa),
    )
    if (delta > tol) continue
    mask[p] = 255

    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const np = ny * width + nx
      if (visited[np]) continue
      visited[np] = 1
      queue[qt++] = np
    }
  }

  if (params.antiAlias && tol > 0) {
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] !== 0) continue
      const x = i % width
      const y = (i / width) | 0
      const adjacent =
        (x > 0 && mask[i - 1] !== 0) ||
        (x < width - 1 && mask[i + 1] !== 0) ||
        (y > 0 && mask[i - width] !== 0) ||
        (y < height - 1 && mask[i + width] !== 0)
      if (!adjacent) continue
      const p = i * 4
      const delta = Math.max(
        Math.abs(rgba[p]! - sr),
        Math.abs(rgba[p + 1]! - sg),
        Math.abs(rgba[p + 2]! - sb),
        Math.abs(rgba[p + 3]! - sa),
      )
      if (delta <= tol + 1) mask[i] = 128
    }
  }

  return mask
}
