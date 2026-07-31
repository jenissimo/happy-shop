/** Document-space alignment grid (distinct from 1×1 pixel grid). */

export const DEFAULT_DOCUMENT_GRID_STEP = 8

export function documentGridStep(snapGrid?: number): number {
  const step = snapGrid ?? DEFAULT_DOCUMENT_GRID_STEP
  return Math.max(1, Math.round(step))
}

/** Positions of grid lines from 0 through `extent` inclusive. */
export function documentGridLinePositions(
  extent: number,
  step: number,
): number[] {
  const positions: number[] = []
  const safeStep = Math.max(1, Math.round(step))
  for (let v = 0; v <= extent; v += safeStep) {
    positions.push(v)
  }
  return positions
}

/** 1 px cell boundaries (integer coordinates) within a visible span. */
export function pixelGridLinePositions(from: number, to: number): number[] {
  const start = Math.max(0, Math.ceil(from))
  const end = Math.max(start, Math.floor(to))
  const positions: number[] = []
  for (let v = start; v <= end; v++) positions.push(v)
  return positions
}
