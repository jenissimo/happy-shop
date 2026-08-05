/**
 * Effect geometry is authored in document pixels, but every FX shader steps by
 * `size * uInputSize.zw` — one texel of the filter texture, which Pixi allocates
 * from the renderable's bounds in the *render pass* space. For a layer drawn
 * straight to the canvas that space is the camera's, so an unscaled 15px stroke
 * came out 15 screen pixels: fat at 72% zoom, thin at 200%, and different again
 * on export.
 *
 * Converting is a per-pass multiply on the size-like params (and on the Pixi
 * `padding`, which Pixi also applies to the same screen-space bounds) — no
 * shader changes: the shaders already work in texels, they were just being fed
 * document numbers.
 */
import type { RenderLayerEffect } from '../../contracts/RenderDocumentView'
import { MAX_EFFECT_PAD } from '../resolveEffectStack'

/**
 * Ceiling on the *scaled* pad. `MAX_EFFECT_PAD` bounds the document-space
 * request; without a second clamp a pathological stack at high zoom would ask
 * for a filter texture several thousand pixels wider than the layer.
 */
export const MAX_SCALED_EFFECT_PAD = MAX_EFFECT_PAD * 2

export function scaleFilterPadding(padding: number, scale: number): number {
  return Math.min(Math.ceil(padding * scale), MAX_SCALED_EFFECT_PAD)
}

/**
 * Copy of `effect` with its distances expressed in the pass's pixels.
 *
 * Percentage-like params (spread, choke, depth, opacity) are ratios of a scaled
 * size, so they stay put; `distance` scales because the offset the filters
 * derive from it is linear in it.
 */
export function scaleEffectGeometry(
  effect: RenderLayerEffect,
  scale: number,
): RenderLayerEffect {
  if (scale === 1) return effect
  switch (effect.type) {
    case 'stroke':
    case 'outer-glow':
    case 'inner-glow':
    case 'bevel-emboss':
      return { ...effect, size: effect.size * scale }
    case 'drop-shadow':
    case 'inner-shadow':
    case 'satin':
      return {
        ...effect,
        size: effect.size * scale,
        distance: effect.distance * scale,
      }
    case 'gaussian-blur':
    case 'sharpen':
      return { ...effect, radius: effect.radius * scale }
    case 'pattern-overlay':
      // The pattern is sampled in filter-texture pixels, so its cell size and
      // phase both live in the same space as the sizes above.
      return {
        ...effect,
        scale: effect.scale * scale,
        offsetX: effect.offsetX * scale,
        offsetY: effect.offsetY * scale,
      }
    default:
      return effect
  }
}
