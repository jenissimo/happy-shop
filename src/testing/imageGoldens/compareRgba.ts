export type RgbaDiff = {
  maxAbsDiff: number
  meanAbsDiff: number
  mismatchedPixels: number
}

export type Tolerance = {
  /** Max absolute per-channel difference allowed (default 2). */
  maxAbsDiff?: number
  /** Mean absolute error across all bytes (default 0.5). */
  meanAbsDiff?: number
}

export const DEFAULT_TOLERANCE: Required<Tolerance> = {
  maxAbsDiff: 2,
  meanAbsDiff: 0.5,
}

export function diffRgba(
  actual: Uint8ClampedArray | number[],
  expected: Uint8ClampedArray | number[],
): RgbaDiff {
  if (actual.length !== expected.length) {
    throw new Error(
      `RGBA length mismatch: actual ${actual.length} vs expected ${expected.length}`,
    )
  }
  let maxAbsDiff = 0
  let sum = 0
  let mismatchedPixels = 0
  for (let i = 0; i < actual.length; i += 4) {
    let pixelMismatch = false
    for (let k = 0; k < 4; k++) {
      const d = Math.abs(actual[i + k]! - expected[i + k]!)
      if (d > maxAbsDiff) maxAbsDiff = d
      sum += d
      if (d > 0) pixelMismatch = true
    }
    if (pixelMismatch) mismatchedPixels++
  }
  return {
    maxAbsDiff,
    meanAbsDiff: actual.length === 0 ? 0 : sum / actual.length,
    mismatchedPixels,
  }
}

export function assertRgbaClose(
  actual: Uint8ClampedArray | number[],
  expected: Uint8ClampedArray | number[],
  tolerance: Tolerance = {},
): RgbaDiff {
  const tol = { ...DEFAULT_TOLERANCE, ...tolerance }
  const diff = diffRgba(actual, expected)
  if (diff.maxAbsDiff > tol.maxAbsDiff) {
    throw new Error(
      `maxAbsDiff ${diff.maxAbsDiff} exceeds ${tol.maxAbsDiff} (${diff.mismatchedPixels} pixels differ)`,
    )
  }
  if (diff.meanAbsDiff > tol.meanAbsDiff) {
    throw new Error(
      `meanAbsDiff ${diff.meanAbsDiff.toFixed(3)} exceeds ${tol.meanAbsDiff}`,
    )
  }
  return diff
}
