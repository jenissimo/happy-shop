import {
  canAddEffectType,
  canonicalInsertIndex,
  canonicalPaintSlot,
  createLayerId,
  DEFAULT_GRADIENT,
  type LayerEffect,
} from '../../../core/document'
import {
  CONTENT_EFFECT_LABELS,
  adjustmentTypeLabel,
  isContentEffectType,
} from '../content-filters/defaults'

/** Photoshop Layer Style dialog left-list order (+ chroma-key product delta). */
export type StyleEffectKey =
  | 'bevel-emboss'
  | 'stroke'
  | 'inner-shadow'
  | 'inner-glow'
  | 'satin'
  | 'color-overlay'
  | 'gradient-overlay'
  | 'pattern-overlay'
  | 'outer-glow'
  | 'drop-shadow'
  | 'chroma-key'

export const STYLE_EFFECT_ORDER: StyleEffectKey[] = [
  'bevel-emboss',
  'stroke',
  'inner-shadow',
  'inner-glow',
  'satin',
  'color-overlay',
  'gradient-overlay',
  'pattern-overlay',
  'outer-glow',
  'drop-shadow',
  'chroma-key',
]

export const STYLE_EFFECT_LABELS: Record<StyleEffectKey, string> = {
  'bevel-emboss': 'Bevel & Emboss',
  stroke: 'Stroke',
  'inner-shadow': 'Inner Shadow',
  'inner-glow': 'Inner Glow',
  satin: 'Satin',
  'color-overlay': 'Color Overlay',
  'gradient-overlay': 'Gradient Overlay',
  'pattern-overlay': 'Pattern Overlay',
  'outer-glow': 'Outer Glow',
  'drop-shadow': 'Drop Shadow',
  'chroma-key': 'Chroma Key',
}

const STYLE_TYPE_SET = new Set<string>(STYLE_EFFECT_ORDER)

/**
 * Photoshop's Global Light angle, shared by Drop Shadow, Inner Shadow and
 * Bevel & Emboss — moving it in one dialog moves it in all of them.
 *
 * Measured in Photoshop 2025 after "Reset to Default": 90°, not the 120° that
 * older documentation reports.
 */
export const GLOBAL_LIGHT_ANGLE = 90

export function isStyleEffectType(type: string): type is StyleEffectKey {
  return STYLE_TYPE_SET.has(type)
}

/**
 * Photoshop-parity factory defaults — the values PS shows the first time an
 * effect checkbox is ticked. Pinned by `defaults.test.ts`; corroborated against
 * the descriptor corpus in Photoshop 2025's bundled `.asl` style libraries.
 * Opacities are 0..1 here and rendered as 0..100 in the dialog.
 */
export function createDefaultEffect(type: StyleEffectKey): LayerEffect {
  const id = createLayerId()
  switch (type) {
    case 'drop-shadow':
      return {
        id,
        type: 'drop-shadow',
        enabled: true,
        blendMode: 'multiply',
        color: '#000000',
        opacity: 0.35,
        angle: GLOBAL_LIGHT_ANGLE,
        useGlobalLight: true,
        distance: 3,
        spread: 0,
        size: 7,
        contour: 'linear',
        noise: 0,
        layerKnocksOutDropShadow: true,
      }
    case 'inner-shadow':
      return {
        id,
        type: 'inner-shadow',
        enabled: true,
        blendMode: 'multiply',
        color: '#000000',
        opacity: 0.35,
        angle: GLOBAL_LIGHT_ANGLE,
        useGlobalLight: true,
        distance: 3,
        choke: 0,
        size: 7,
        contour: 'linear',
        noise: 0,
      }
    case 'outer-glow':
      return {
        id,
        type: 'outer-glow',
        enabled: true,
        blendMode: 'screen',
        opacity: 0.35,
        noise: 0,
        technique: 'softer',
        color: '#ffffff',
        spread: 0,
        size: 7,
        contour: 'linear',
        range: 50,
        jitter: 0,
      }
    case 'inner-glow':
      return {
        id,
        type: 'inner-glow',
        enabled: true,
        blendMode: 'screen',
        opacity: 0.35,
        noise: 0,
        technique: 'softer',
        source: 'edge',
        color: '#ffffff',
        choke: 0,
        size: 7,
        contour: 'linear',
        range: 50,
        jitter: 0,
      }
    case 'bevel-emboss':
      return {
        id,
        type: 'bevel-emboss',
        enabled: true,
        style: 'inner-bevel',
        technique: 'smooth',
        depth: 100,
        direction: 'up',
        size: 7,
        soften: 0,
        angle: GLOBAL_LIGHT_ANGLE,
        useGlobalLight: true,
        altitude: 30,
        glossContour: 'linear',
        highlightMode: 'screen',
        highlightColor: '#ffffff',
        highlightOpacity: 0.5,
        shadowMode: 'multiply',
        shadowColor: '#000000',
        shadowOpacity: 0.5,
        contour: {
          enabled: false,
          contour: 'linear',
          range: 50,
          antiAliased: false,
        },
        texture: {
          enabled: false,
          pattern: 'checker',
          scale: 100,
          depth: 100,
          invert: false,
          alignWithLayer: true,
        },
      }
    case 'satin':
      return {
        id,
        type: 'satin',
        enabled: true,
        blendMode: 'multiply',
        color: '#000000',
        opacity: 0.5,
        angle: 90,
        distance: 50,
        size: 80,
        // Confirmed against Photoshop 2025's dialog after "Reset to Default":
        // Linear contour and Invert ON. The .asl corpus never shows Linear
        // here, but authored styles are not defaults.
        //
        // GAP(ps-parity): PS also ticks Anti-aliased for Satin by default, but
        // contour anti-aliasing is only modelled on Bevel & Emboss
        // (`contour.antiAliased`). Satin, both shadows and both glows have the
        // checkbox in PS and no field here.
        contour: 'linear',
        invert: true,
      }
    case 'stroke':
      return {
        id,
        type: 'stroke',
        enabled: true,
        blendMode: 'normal',
        color: '#000000',
        opacity: 1,
        overprint: false,
        size: 1,
        position: 'inside',
        fillType: 'color',
      }
    case 'color-overlay':
      return {
        id,
        type: 'color-overlay',
        enabled: true,
        // Sampled from the PS 2025 swatch after "Reset to Default" — a mid
        // grey, not the red older references report.
        color: '#818181',
        opacity: 1,
        blendMode: 'normal',
      }
    case 'gradient-overlay':
      return {
        id,
        type: 'gradient-overlay',
        enabled: true,
        blendMode: 'normal',
        opacity: 1,
        gradient: structuredClone(DEFAULT_GRADIENT),
        style: 'linear',
        angle: 90,
        scale: 100,
        reverse: false,
        alignWithLayer: true,
        offsetX: 0,
        offsetY: 0,
      }
    case 'pattern-overlay':
      return {
        id,
        type: 'pattern-overlay',
        enabled: true,
        blendMode: 'normal',
        opacity: 1,
        pattern: 'checker',
        scale: 100,
        angle: 0,
        invert: false,
        linkWithLayer: true,
        offsetX: 0,
        offsetY: 0,
      }
    case 'chroma-key':
      return {
        id,
        type: 'chroma-key',
        enabled: true,
        keyColor: '#00FF00',
        mode: 'global',
        floodOrigins: [],
        tolerance: 30,
        softness: 30,
        despill: 0.7,
        choke: 0,
        edgeBlur: 0,
      }
  }
}

/**
 * Build dialog draft from layer effects.
 * Preserves multiple instances of the same `type` (distinct `id`s) and
 * **document array order** (ND effect stack paint order).
 * Inserts one disabled placeholder per missing type at the canonical Adobe slot.
 */
export function ensureStyleSlots(effects: LayerEffect[]): LayerEffect[] {
  const known = effects.filter(
    (e) => isStyleEffectType(e.type) || isContentEffectType(e.type),
  )
  const present = new Set(known.map((e) => e.type))
  // Array order is paint order (ND-EFFECT-STACK-VISION §5), and the draft is
  // what OK commits — so the slots a user ticks have to arrive already in
  // canonical order. Seeding them in the dialog's own listing order instead
  // put Stroke *below* Color Overlay, and the overlay then repainted the
  // stroke: a black outline came out in the fill colour.
  const next = [...known]
  // Insert missing style placeholders in paint-slot order so positions stay stable.
  for (const type of STYLE_EFFECT_ORDER) {
    if (present.has(type)) continue
    const placeholder = { ...createDefaultEffect(type), enabled: false }
    const idx = canonicalInsertIndex(next, type)
    next.splice(idx, 0, placeholder)
  }
  return next
}

/** Label for list rows: "Stroke", "Stroke 2", … when multiple of same type. */
export function effectInstanceLabel(
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
  if (!isStyleEffectType(effect.type)) return effect.type
  const base = STYLE_EFFECT_LABELS[effect.type]
  const same = siblings.filter((e) => e.type === effect.type)
  if (same.length <= 1) return base
  const n = same.findIndex((e) => e.id === effect.id) + 1
  return n <= 1 ? base : `${base} ${n}`
}

/**
 * Effects to persist on OK.
 * Keeps enabled effects, plus disabled duplicates so multi-instance stacks
 * survive temporary toggles. Sole disabled placeholder slots are dropped.
 *
 * TODO(renderer): if apply/build path still collapses by `type`, keep stacking
 * by `id` here and fix the compositor — UI intentionally allows multiple same type.
 */
export function commitDraftEffects(draft: LayerEffect[]): LayerEffect[] {
  const counts = new Map<string, number>()
  for (const e of draft) {
    counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
  }
  return draft.filter((e) => e.enabled || (counts.get(e.type) ?? 0) > 1)
}

/**
 * Insert a new enabled instance of `type` at the canonical Adobe position
 * (after last sibling of that type when multi-instance already exists).
 * No-op when multiplicity / hard caps forbid another instance.
 */
export function addEffectInstance(
  draft: LayerEffect[],
  type: StyleEffectKey,
): { next: LayerEffect[]; created: LayerEffect } | null {
  if (!canAddEffectType(draft, type)) return null
  const created = createDefaultEffect(type)
  const next = [...draft]
  next.splice(canonicalInsertIndex(next, type), 0, created)
  return { next, created }
}

/** Compare paint slots for dialog ordering helpers. */
export function compareCanonicalPaintOrder(a: string, b: string): number {
  return canonicalPaintSlot(a) - canonicalPaintSlot(b)
}
