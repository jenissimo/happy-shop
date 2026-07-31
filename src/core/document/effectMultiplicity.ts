/**
 * Per-type instance caps for the Layer FX stack (SPECS/ND-EFFECT-STACK-VISION.md §4).
 * Consumed by dialog Add menu, command helpers, and document normalize/invariants.
 */
import { createLayerId } from './ids'
import type { LayerEffect, LayerEffectType } from './schema'

/** Hard ceiling: each node is a full-screen filter pass. */
export const MAX_EFFECT_NODES_PER_LAYER = 24

/** Soft UI hint threshold (perf, not enforced). */
export const SOFT_EFFECT_NODES_HINT = 12

/**
 * Max instances per effect type.
 * Photoshop: 10 for multipliable styles; Happy Shop: chroma-key up to 4.
 */
export const EFFECT_MULTIPLICITY: Record<LayerEffectType, number> = {
  stroke: 10,
  'color-overlay': 10,
  'gradient-overlay': 10,
  'inner-shadow': 10,
  'drop-shadow': 10,
  'chroma-key': 4,
  'outer-glow': 1,
  'inner-glow': 1,
  'bevel-emboss': 1,
  satin: 1,
  'pattern-overlay': 1,
  'gaussian-blur': 8,
  sharpen: 8,
  noise: 8,
  adjustment: 8,
}

export function maxInstancesForType(type: LayerEffectType): number {
  return EFFECT_MULTIPLICITY[type] ?? 1
}

export function countEffectType(
  effects: readonly LayerEffect[],
  type: LayerEffectType,
): number {
  let n = 0
  for (const e of effects) {
    if (e.type === type) n++
  }
  return n
}

export function canAddEffectType(
  effects: readonly LayerEffect[],
  type: LayerEffectType,
): boolean {
  if (effects.length >= MAX_EFFECT_NODES_PER_LAYER) return false
  return countEffectType(effects, type) < maxInstancesForType(type)
}

export type EffectStackRepair = {
  path: string
  message: string
}

export type NormalizeEffectStackResult = {
  effects: LayerEffect[]
  repairs: EffectStackRepair[]
}

/**
 * Repair over-cap counts and duplicate ids (VISION §3.4 / §8.3).
 * Keeps first N of each type in array order; regenerates colliding ids.
 */
export function normalizeEffectStack(
  effects: readonly LayerEffect[],
  pathPrefix = 'effects',
): NormalizeEffectStackResult {
  const repairs: EffectStackRepair[] = []
  const seenIds = new Set<string>()
  const typeCounts = new Map<LayerEffectType, number>()
  const out: LayerEffect[] = []

  for (const effect of effects) {
    if (out.length >= MAX_EFFECT_NODES_PER_LAYER) {
      repairs.push({
        path: pathPrefix,
        message: `truncated effects to ${MAX_EFFECT_NODES_PER_LAYER} nodes per layer`,
      })
      break
    }
    const cap = maxInstancesForType(effect.type)
    const count = typeCounts.get(effect.type) ?? 0
    if (count >= cap) {
      repairs.push({
        path: pathPrefix,
        message: `dropped excess ${effect.type} (cap ${cap})`,
      })
      continue
    }
    typeCounts.set(effect.type, count + 1)

    let next = effect
    if (seenIds.has(effect.id)) {
      const newId = createLayerId()
      next = { ...effect, id: newId }
      repairs.push({
        path: `${pathPrefix}["${effect.id}"]`,
        message: `duplicate effect id regenerated to "${newId}"`,
      })
    }
    seenIds.add(next.id)
    out.push(next)
  }

  return { effects: out, repairs }
}
