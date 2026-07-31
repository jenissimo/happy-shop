export type GaussianKernel = {
  radius: number
  weights: Float32Array
}

/**
 * Builds a normalized, symmetric Gaussian kernel. `radius` is expressed in
 * document pixels; the effective support is three standard deviations.
 */
export function createGaussianKernel(radius: number): GaussianKernel {
  const sigma = Math.max(0.35, radius / 2)
  const support = Math.max(0, Math.ceil(sigma * 3))
  if (support === 0) return { radius: 0, weights: new Float32Array([1]) }

  const weights = new Float32Array(support * 2 + 1)
  let total = 0
  for (let offset = -support; offset <= support; offset++) {
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma))
    weights[offset + support] = weight
    total += weight
  }
  for (let i = 0; i < weights.length; i++) weights[i]! /= total
  return { radius: support, weights }
}
