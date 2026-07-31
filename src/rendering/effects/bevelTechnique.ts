/** Bevel & Emboss technique — shared CPU/GPU height-field semantics. */
export type BevelTechnique = 'smooth' | 'chisel-hard' | 'chisel-soft'

/** Band count for chisel posterization; tied to bevel Size. */
export function bevelHeightSteps(size: number): number {
  return Math.max(4, Math.round(Math.max(1, size) * 0.45))
}

/**
 * Map matte alpha to a bevel height sample.
 * Smooth uses alpha directly; chisel posterizes into facet bands (soft eases within bands).
 */
export function sampleBevelHeight(
  alpha: number,
  technique: BevelTechnique,
  size: number,
): number {
  const a = Math.max(0, Math.min(1, alpha))
  if (technique === 'smooth') return a
  const steps = bevelHeightSteps(size)
  const scaled = a * steps
  const band = Math.floor(scaled + 1e-5) / steps
  if (technique === 'chisel-hard') return band
  const frac = scaled - Math.floor(scaled)
  const eased = frac * frac * (3 - 2 * frac)
  return band + eased / steps
}

/** 0 = smooth, 1 = chisel-hard, 2 = chisel-soft (GPU uniform). */
export function bevelTechniqueToUniform(technique: BevelTechnique | undefined): number {
  switch (technique) {
    case 'chisel-hard':
      return 1
    case 'chisel-soft':
      return 2
    default:
      return 0
  }
}
