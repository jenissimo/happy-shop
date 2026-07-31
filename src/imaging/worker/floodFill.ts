/**
 * Contiguous paint-bucket flood kernel. It deliberately lives beside the
 * magic-wand kernel so a future imaging worker can run both without UI code.
 */
export type FloodFillParams = {
  width: number
  height: number
  seedX: number
  seedY: number
  /** Maximum per-channel delta from the seed, 0–255. */
  tolerance: number
  /**
   * When enabled, pixels in the one-unit tolerance fringe receive partial
   * coverage. Disabled is the crisp, Photoshop-style default.
   */
  antiAlias?: boolean
  /** Optional local-space selection clip, returning coverage 0–1. */
  allowed?: (x: number, y: number) => number
}

/** Returns an A8 contiguous-fill coverage mask. */
export function floodFillMask(
  rgba: Uint8ClampedArray | Uint8Array,
  params: FloodFillParams,
): Uint8Array {
  const { width, height } = params
  const mask = new Uint8Array(Math.max(0, width * height))
  const sx = Math.floor(params.seedX)
  const sy = Math.floor(params.seedY)
  if (
    width <= 0 ||
    height <= 0 ||
    rgba.length < width * height * 4 ||
    sx < 0 ||
    sy < 0 ||
    sx >= width ||
    sy >= height ||
    (params.allowed?.(sx + 0.5, sy + 0.5) ?? 1) <= 0
  ) {
    return mask
  }

  const seed = (sy * width + sx) * 4
  const sr = rgba[seed]!
  const sg = rgba[seed + 1]!
  const sb = rgba[seed + 2]!
  const sa = rgba[seed + 3]!
  const tolerance = Math.max(0, Math.min(255, params.tolerance))
  const visited = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let read = 0
  let write = 0
  queue[write++] = sy * width + sx
  visited[sy * width + sx] = 1

  while (read < write) {
    const pixel = queue[read++]!
    const x = pixel % width
    const y = Math.floor(pixel / width)
    const i = pixel * 4
    const delta = Math.max(
      Math.abs(rgba[i]! - sr),
      Math.abs(rgba[i + 1]! - sg),
      Math.abs(rgba[i + 2]! - sb),
      Math.abs(rgba[i + 3]! - sa),
    )
    if (delta > tolerance) continue
    const selectionCoverage = Math.max(
      0,
      Math.min(1, params.allowed?.(x + 0.5, y + 0.5) ?? 1),
    )
    if (selectionCoverage <= 0) continue
    mask[pixel] = Math.round(255 * selectionCoverage)

    const neighbors = [pixel - 1, pixel + 1, pixel - width, pixel + width]
    for (const next of neighbors) {
      const nx = next % width
      const ny = Math.floor(next / width)
      if (
        next < 0 ||
        next >= width * height ||
        (next === pixel - 1 && x === 0) ||
        (next === pixel + 1 && x === width - 1) ||
        nx < 0 ||
        ny < 0 ||
        visited[next]
      ) {
        continue
      }
      visited[next] = 1
      queue[write++] = next
    }
  }

  // A one-pixel feather at the tolerance boundary avoids visibly jagged
  // edges when requested, without changing the connected component itself.
  if (params.antiAlias && tolerance > 0) {
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] !== 0) continue
      const x = i % width
      const y = Math.floor(i / width)
      if ((params.allowed?.(x + 0.5, y + 0.5) ?? 1) <= 0) continue
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
      if (delta <= tolerance + 1) mask[i] = 128
    }
  }

  return mask
}
