/**
 * Layer FX stack ordering helpers (SPECS/ND-EFFECT-STACK-VISION.md §3.2).
 * Pure document-domain: no rendering imports.
 */

/** Execution phase — fixed per type; not user-editable. */
export type EffectPhase = 'key' | 'content' | 'style'

/**
 * Adobe-inspired paint / insert ordinal (lower = earlier / below).
 * Used only for default insertion; array order is paint order after that.
 */
export const CANONICAL_PAINT_ORDER = [
  'chroma-key',
  'adjustment',
  'gaussian-blur',
  'sharpen',
  'noise',
  'pattern-overlay',
  'gradient-overlay',
  'color-overlay',
  'satin',
  'inner-glow',
  'inner-shadow',
  'bevel-emboss',
  'stroke',
  'outer-glow',
  'drop-shadow',
] as const

export type CanonicalEffectType = (typeof CANONICAL_PAINT_ORDER)[number]

const CANONICAL_SLOT = new Map<string, number>(
  CANONICAL_PAINT_ORDER.map((t, i) => [t, i]),
)

export function effectPhase(type: string): EffectPhase {
  if (type === 'chroma-key') return 'key'
  if (
    type === 'adjustment' ||
    type === 'gaussian-blur' ||
    type === 'sharpen' ||
    type === 'noise'
  ) {
    return 'content'
  }
  return 'style'
}

export function canonicalPaintSlot(type: string): number {
  return CANONICAL_SLOT.get(type) ?? 999
}

/**
 * Index at which to insert a new node of `type`.
 * After last sibling of the same type; otherwise at the canonical Adobe slot.
 */
export function canonicalInsertIndex(
  effects: readonly { type: string }[],
  type: string,
): number {
  let lastSame = -1
  for (let i = 0; i < effects.length; i++) {
    if (effects[i]!.type === type) lastSame = i
  }
  if (lastSame !== -1) return lastSame + 1

  const slot = canonicalPaintSlot(type)
  let idx = 0
  for (let i = 0; i < effects.length; i++) {
    if (canonicalPaintSlot(effects[i]!.type) <= slot) idx = i + 1
  }
  return idx
}

/** True if swapping indices would cross the key / non-key phase boundary. */
export function wouldCrossEffectPhase(
  effects: readonly { type: string }[],
  from: number,
  to: number,
): boolean {
  const a = effects[from]
  const b = effects[to]
  if (!a || !b) return true
  return effectPhase(a.type) !== effectPhase(b.type)
}
