function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * Coverage 0..1 for a pixel at normalized distance d (0=center, 1=edge).
 *
 * Hardness sharpens the whole falloff rather than reserving a fully opaque
 * inner disk. This prevents soft tips from exposing a hard, beaded core at
 * normal stroke spacing. Hardness 1 intentionally remains a crisp disk.
 */
export function dabCoverage(d: number, hardness: number): number {
  if (d <= 0) return 1
  if (d > 1) return 0
  const hard = clamp01(hardness)
  if (hard === 1) return 1
  const t = d ** (1 / Math.max(1e-6, 1 - hard))
  return 1 - t * t * (3 - 2 * t)
}

/** Integer side length for a square tip from its analytic radius. */
export function squareSideFromRadius(radius: number): number {
  if (!Number.isFinite(radius)) return 1
  return Math.max(1, Math.round(radius * 2))
}

/**
 * Coverage for a hard square stamp aligned to the pixel grid. Pixel centers
 * inside the N×N block return 1 (when hardness is 1); there is no fringe.
 */
export function squareTipCoverage(
  dabX: number,
  dabY: number,
  pixelCenterX: number,
  pixelCenterY: number,
  side: number,
  hardness: number,
): number {
  const span = Math.max(1, Math.round(side))
  const half = Math.floor(span / 2)
  const x0 = Math.floor(dabX - half)
  const y0 = Math.floor(dabY - half)
  const ix = Math.floor(pixelCenterX)
  const iy = Math.floor(pixelCenterY)
  if (ix < x0 || ix >= x0 + span || iy < y0 || iy >= y0 + span) return 0
  const hard = clamp01(hardness)
  if (hard >= 1) return 1
  const dx = Math.abs(pixelCenterX - dabX)
  const dy = Math.abs(pixelCenterY - dabY)
  const d = Math.max(dx, dy) / Math.max(1e-6, span / 2)
  return dabCoverage(Math.min(1, d), hard)
}

/** Elliptical tip: map surface point to normalized distance under angle/roundness. */
export function tipDistance(
  dx: number,
  dy: number,
  radius: number,
  angleDeg: number,
  roundness: number,
): number {
  const angle = (angleDeg * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const rotatedX = dx * cos + dy * sin
  const rotatedY = -dx * sin + dy * cos
  const minorRadius = radius * Math.max(1e-6, roundness)
  return Math.hypot(rotatedX / radius, rotatedY / minorRadius)
}
