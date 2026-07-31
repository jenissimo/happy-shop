import { addSharpenNode, canAddContentFilter } from './contentFilters'

export const MAX_SHARPEN_AMOUNT = 2
export const MAX_SHARPEN_RADIUS = 20

export function canApplySharpen(): boolean {
  return canAddContentFilter()
}

/** Add a non-destructive sharpen content node to the active layer FX stack. */
export async function applySharpen(amount: number, radius: number): Promise<boolean> {
  if (!canApplySharpen()) return false
  return addSharpenNode(amount, radius)
}
