import {
  CANONICAL_PAINT_ORDER,
  canAddEffectType,
  canonicalInsertIndex,
  createLayerId,
  type Adjustment,
  type AdjustmentEffect,
  type GaussianBlurEffect,
  type LayerEffect,
  type NoiseEffect,
  type SharpenEffect,
} from '../../../core/document'

/** Content-phase ND FX node types (SPECS/ND-EFFECT-STACK-VISION.md §2.3). */
export type ContentEffectKey =
  | 'gaussian-blur'
  | 'sharpen'
  | 'noise'
  | 'adjustment'

export const CONTENT_EFFECT_ORDER: ContentEffectKey[] = [
  'adjustment',
  'gaussian-blur',
  'sharpen',
  'noise',
]

export const CONTENT_EFFECT_LABELS: Record<ContentEffectKey, string> = {
  adjustment: 'Adjustment',
  'gaussian-blur': 'Gaussian Blur',
  sharpen: 'Sharpen',
  noise: 'Noise',
}

export const ADJUSTMENT_TYPE_LABELS: Record<Adjustment['type'], string> = {
  'brightness-contrast': 'Brightness/Contrast',
  'hue-saturation': 'Hue/Saturation',
  levels: 'Levels',
}

export function adjustmentTypeLabel(adjustment: Adjustment): string {
  return ADJUSTMENT_TYPE_LABELS[adjustment.type]
}

const CONTENT_TYPE_SET = new Set<string>(CONTENT_EFFECT_ORDER)

export function isContentEffectType(type: string): type is ContentEffectKey {
  return CONTENT_TYPE_SET.has(type)
}

export function createDefaultGaussianBlur(
  overrides: Partial<Omit<GaussianBlurEffect, 'type'>> = {},
): GaussianBlurEffect {
  return {
    id: createLayerId(),
    type: 'gaussian-blur',
    enabled: true,
    radius: 3,
    ...overrides,
  }
}

export function createDefaultSharpen(
  overrides: Partial<Omit<SharpenEffect, 'type'>> = {},
): SharpenEffect {
  return {
    id: createLayerId(),
    type: 'sharpen',
    enabled: true,
    amount: 1,
    radius: 1,
    ...overrides,
  }
}

export function createDefaultNoise(
  overrides: Partial<Omit<NoiseEffect, 'type'>> = {},
): NoiseEffect {
  return {
    id: createLayerId(),
    type: 'noise',
    enabled: true,
    amount: 0.12,
    distribution: 'uniform',
    monochromatic: true,
    ...overrides,
  }
}

export function createDefaultAdjustmentEffect(
  overrides: Partial<Omit<AdjustmentEffect, 'type' | 'adjustment'>> & {
    adjustment?: AdjustmentEffect['adjustment']
  } = {},
): AdjustmentEffect {
  return {
    id: createLayerId(),
    type: 'adjustment',
    enabled: true,
    adjustment: overrides.adjustment ?? {
      type: 'brightness-contrast',
      brightness: 0,
      contrast: 0,
    },
    ...overrides,
  }
}

export function createDefaultContentEffect(
  type: ContentEffectKey,
  overrides: Partial<LayerEffect> = {},
): LayerEffect {
  switch (type) {
    case 'gaussian-blur':
      return createDefaultGaussianBlur(
        overrides as Partial<Omit<GaussianBlurEffect, 'type'>>,
      )
    case 'sharpen':
      return createDefaultSharpen(overrides as Partial<Omit<SharpenEffect, 'type'>>)
    case 'noise':
      return createDefaultNoise(overrides as Partial<Omit<NoiseEffect, 'type'>>)
    case 'adjustment':
      return createDefaultAdjustmentEffect(
        overrides as Partial<Omit<AdjustmentEffect, 'type'>>,
      )
  }
}

export function contentEffectLabel(type: ContentEffectKey): string {
  return CONTENT_EFFECT_LABELS[type]
}

/** Insert a new enabled content node at the canonical content-phase slot. */
export function addContentEffectInstance(
  effects: LayerEffect[],
  type: ContentEffectKey,
  overrides: Partial<LayerEffect> = {},
): { next: LayerEffect[]; created: LayerEffect } | null {
  if (!canAddEffectType(effects, type)) return null
  const created = createDefaultContentEffect(type, overrides)
  const next = [...effects]
  next.splice(canonicalInsertIndex(next, type), 0, created)
  return { next, created }
}

/** Labels for mixed stacks (style + content). */
export function effectStackLabel(
  effect: LayerEffect,
  siblings: LayerEffect[],
): string {
  if (isContentEffectType(effect.type)) {
    const base =
      effect.type === 'adjustment'
        ? adjustmentTypeLabel(effect.adjustment)
        : CONTENT_EFFECT_LABELS[effect.type]
    const same = siblings.filter(
      (e) =>
        e.type === effect.type &&
        (effect.type !== 'adjustment' ||
          (e.type === 'adjustment' &&
            e.adjustment.type === effect.adjustment.type)),
    )
    if (same.length <= 1) return base
    const n = same.findIndex((e) => e.id === effect.id) + 1
    return n <= 1 ? base : `${base} ${n}`
  }
  return effect.type
}

export { CANONICAL_PAINT_ORDER, canonicalInsertIndex }
