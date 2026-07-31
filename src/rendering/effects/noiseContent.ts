/**
 * Shared Add Noise sampling for CPU + GPU content-phase filters.
 * Deterministic per pixel so goldens and preview stay stable.
 */

export type NoiseDistribution = 'uniform' | 'gaussian'

/** Hash noise in 0..1 (glfx / Pixi-style). */
export function hashNoise01(x: number, y: number, channel: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + channel * 43758.5453) * 43758.5453
  return n - Math.floor(n)
}

function uniformDelta(x: number, y: number, channel: number): number {
  return (hashNoise01(x, y, channel) - 0.5) * 2
}

function gaussianDelta(x: number, y: number, channel: number): number {
  const u1 = Math.max(hashNoise01(x, y, channel), 1e-6)
  const u2 = hashNoise01(x + 17, y + 31, channel)
  return (Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)) / 3
}

export function sampleNoiseDelta(
  x: number,
  y: number,
  channel: number,
  distribution: NoiseDistribution,
): number {
  return distribution === 'gaussian'
    ? gaussianDelta(x, y, channel)
    : uniformDelta(x, y, channel)
}

/** Photoshop amount 0..4 (400%) applied to 8-bit RGB; alpha unchanged. */
export function applyNoiseContent(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  distribution: NoiseDistribution,
  monochromatic: boolean,
): void {
  const strength = Math.max(0, amount)
  if (strength === 0) return

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (rgba[i + 3] === 0) continue

      if (monochromatic) {
        const delta = sampleNoiseDelta(x, y, 0, distribution) * strength * 255
        for (let c = 0; c < 3; c++) {
          rgba[i + c] = Math.max(
            0,
            Math.min(255, Math.round(rgba[i + c]! + delta)),
          )
        }
      } else {
        for (let c = 0; c < 3; c++) {
          const delta = sampleNoiseDelta(x, y, c, distribution) * strength * 255
          rgba[i + c] = Math.max(
            0,
            Math.min(255, Math.round(rgba[i + c]! + delta)),
          )
        }
      }
    }
  }
}
