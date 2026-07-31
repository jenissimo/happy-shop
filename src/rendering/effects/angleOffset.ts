/** PS Global Light: 0° = right, CCW; document Y grows down. */
export function angleDistanceToOffset(
  angleDeg: number,
  distance: number,
): { offsetX: number; offsetY: number } {
  const rad = (angleDeg * Math.PI) / 180
  return {
    offsetX: Math.cos(rad) * distance,
    offsetY: -Math.sin(rad) * distance,
  }
}
