/**
 * Shared Layer FX stack resolver (SPECS/ND-EFFECT-STACK-VISION.md §5).
 * Single ordering / phase / bounds-inflation source for GPU filters and CPU goldens.
 */
import {
  CANONICAL_PAINT_ORDER,
  canonicalInsertIndex,
  canonicalPaintSlot,
  effectPhase,
  wouldCrossEffectPhase,
  type EffectPhase,
} from '../../core/document/effectStackOrder'
import { angleDistanceToOffset } from './angleOffset'
import {
  bevelEmbossDescriptor,
  chromaKeyDescriptor,
  dropShadowDescriptor,
  innerGlowDescriptor,
  innerShadowDescriptor,
  outerGlowDescriptor,
  satinDescriptor,
  strokeDescriptor,
  type Insets,
} from './layerEffects'

export {
  CANONICAL_PAINT_ORDER,
  canonicalInsertIndex,
  canonicalPaintSlot,
  effectPhase,
  wouldCrossEffectPhase,
}
export type { EffectPhase }

/** Hard clamp per side so pathological stacks cannot demand giant RTs. */
export const MAX_EFFECT_PAD = 512

/** Minimal fields the resolver needs (LayerEffect | RenderLayerEffect). */
export type StackableEffect = {
  type: string
  enabled: boolean
  angle?: number
  distance?: number
  size?: number
  radius?: number
  spread?: number
  blur?: number
  edgeBlur?: number
  offsetX?: number
  offsetY?: number
  position?: 'inside' | 'center' | 'outside'
}

export type ResolvedStack<T extends StackableEffect = StackableEffect> = {
  /** Enabled nodes in phase order: key → content → style. */
  nodes: T[]
  keyNodes: T[]
  contentNodes: T[]
  styleNodes: T[]
  /** Accumulated bounds inflation for the whole stack. */
  insets: Insets
  /** Max side of `insets` (filter padding scalar). */
  padding: number
  /** True when a style-phase outward node consumes fill coverage. */
  outerHandlesFill: boolean
}

function zeroInsets(): Insets {
  return { top: 0, right: 0, bottom: 0, left: 0 }
}

function addInsets(a: Insets, b: Insets): Insets {
  return {
    top: a.top + b.top,
    right: a.right + b.right,
    bottom: a.bottom + b.bottom,
    left: a.left + b.left,
  }
}

function maxInsets(a: Insets, b: Insets): Insets {
  return {
    top: Math.max(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
    left: Math.max(a.left, b.left),
  }
}

function clampInsets(insets: Insets, max: number): Insets {
  return {
    top: Math.min(insets.top, max),
    right: Math.min(insets.right, max),
    bottom: Math.min(insets.bottom, max),
    left: Math.min(insets.left, max),
  }
}

function maxSide(insets: Insets): number {
  return Math.max(insets.top, insets.right, insets.bottom, insets.left)
}

/** Outward nodes expand the result; their pads accumulate in a chain. */
export function isOutwardEffect(effect: StackableEffect): boolean {
  switch (effect.type) {
    case 'drop-shadow':
    case 'outer-glow':
      return true
    case 'stroke':
      return effect.position !== 'inside'
    case 'chroma-key':
      return (effect.edgeBlur ?? 0) > 0
    case 'gaussian-blur':
      return (effect.size ?? effect.radius ?? 0) > 0
    case 'sharpen':
      return (effect.radius ?? 0) > 0
    default:
      return false
  }
}

export function isOuterFillComposite(effect: StackableEffect): boolean {
  return (
    effect.type === 'drop-shadow' ||
    effect.type === 'outer-glow' ||
    (effect.type === 'stroke' && effect.position !== 'inside')
  )
}

export function effectBoundsInflation(effect: StackableEffect): Insets {
  switch (effect.type) {
    case 'drop-shadow': {
      const { offsetX, offsetY } = angleDistanceToOffset(
        effect.angle ?? 120,
        effect.distance ?? 0,
      )
      return dropShadowDescriptor.boundsInflation({
        blur: effect.size ?? 0,
        spread: ((effect.spread ?? 0) / 100) * (effect.size ?? 0),
        offsetX,
        offsetY,
      })
    }
    case 'outer-glow':
      return outerGlowDescriptor.boundsInflation({ size: effect.size ?? 0 })
    case 'inner-shadow': {
      const { offsetX, offsetY } = angleDistanceToOffset(
        effect.angle ?? 120,
        effect.distance ?? 0,
      )
      return innerShadowDescriptor.boundsInflation({
        blur: effect.size ?? 0,
        offsetX,
        offsetY,
      })
    }
    case 'inner-glow':
      return innerGlowDescriptor.boundsInflation({ size: effect.size ?? 0 })
    case 'bevel-emboss':
      return bevelEmbossDescriptor.boundsInflation({ size: effect.size ?? 0 })
    case 'satin': {
      const dist = effect.distance ?? 0
      return satinDescriptor.boundsInflation({
        size: effect.size ?? 0,
        offsetX: dist,
        offsetY: dist,
      })
    }
    case 'stroke':
      return strokeDescriptor.boundsInflation({ size: effect.size ?? 0 })
    case 'chroma-key':
      return chromaKeyDescriptor.boundsInflation({
        edgeBlur: effect.edgeBlur ?? 0,
      })
    case 'gaussian-blur': {
      const radius = effect.radius ?? 0
      const pad = Math.ceil(radius * 3)
      return { top: pad, right: pad, bottom: pad, left: pad }
    }
    case 'sharpen': {
      const radius = effect.radius ?? 0
      const pad = Math.ceil(radius * 3) + 1
      return { top: pad, right: pad, bottom: pad, left: pad }
    }
    default:
      return zeroInsets()
  }
}

/**
 * Resolve enabled FX into paint order + accumulated insets.
 *
 * Ordering: `key` nodes hoisted (stable relative order), then remaining
 * enabled nodes in array order. Fill opacity is applied by the caller
 * between key and style phases — not a stack node.
 */
export function resolveEffectStack<T extends StackableEffect>(
  effects: readonly T[] | undefined,
  _opts: { fillOpacity?: number } = {},
): ResolvedStack<T> {
  const enabled = (effects ?? []).filter((e) => e.enabled)
  const keyNodes = enabled.filter((e) => effectPhase(e.type) === 'key')
  const contentNodes = enabled.filter((e) => effectPhase(e.type) === 'content')
  const styleNodes = enabled.filter((e) => effectPhase(e.type) === 'style')
  const nodes = [...keyNodes, ...contentNodes, ...styleNodes]

  let insets = zeroInsets()
  let outerHandlesFill = false
  for (const effect of nodes) {
    if (isOuterFillComposite(effect)) outerHandlesFill = true
    const infl = effectBoundsInflation(effect)
    insets = isOutwardEffect(effect)
      ? addInsets(insets, infl)
      : maxInsets(insets, infl)
  }
  insets = clampInsets(insets, MAX_EFFECT_PAD)

  return {
    nodes,
    keyNodes,
    contentNodes,
    styleNodes,
    insets,
    padding: maxSide(insets),
    outerHandlesFill,
  }
}
