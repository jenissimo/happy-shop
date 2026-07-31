import { addNoiseNode, canAddContentFilter } from './contentFilters'

export const MAX_NOISE_AMOUNT = 4

export function canApplyNoise(): boolean {
  return canAddContentFilter()
}

/** Add a non-destructive noise content node to the active layer FX stack. */
export async function applyNoise(
  amount: number,
  distribution: 'uniform' | 'gaussian',
  monochromatic: boolean,
): Promise<boolean> {
  if (!canApplyNoise()) return false
  return addNoiseNode(amount, distribution, monochromatic)
}
