import type { BLEND_MODES } from 'pixi.js'
import type { RenderBlendMode } from '../contracts/RenderDocumentView'

/**
 * Blend modes Pixi has no blend equation for, which therefore have to be
 * emulated with a filter (or dropped):
 *
 * - `dissolve` is a stochastic alpha threshold, not a blend equation. It is
 *   emulated by {@link DissolveFilter}, which also swallows the layer opacity.
 * - `pass-through` is a *group compositing* rule, not a pixel operation. It is
 *   consumed by the view mapper (`groupNeedsOwnBuffer`) and must never reach a
 *   leaf node; documents written before it was restricted to groups may still
 *   carry it, so it degrades to `normal` here rather than throwing.
 */
export function pixiBlendMode(mode: RenderBlendMode): BLEND_MODES {
  if (mode === 'dissolve' || mode === 'pass-through') return 'normal'
  return mode as BLEND_MODES
}

/** True when the mode needs a filter instead of (or besides) a blend equation. */
export function needsDissolveFilter(mode: RenderBlendMode): boolean {
  return mode === 'dissolve'
}

/**
 * Node alpha to set alongside {@link pixiBlendMode}. Dissolve must see the
 * layer opacity itself — Pixi would otherwise apply it *after* the filter and
 * turn a dissolve into a plain fade.
 */
export function nodeAlpha(mode: RenderBlendMode, opacity: number): number {
  return needsDissolveFilter(mode) ? 1 : opacity
}
