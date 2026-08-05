import type { Filter } from 'pixi.js'
import type { RenderLayerEffect } from '../../contracts/RenderDocumentView'
import { angleDistanceToOffset } from '../angleOffset'
import { resolveEffectStack } from '../resolveEffectStack'
import {
  BevelEmbossFilter,
  type DocumentTextureTransform,
} from './BevelEmbossFilter'
import { ChromaKeyFilter } from './ChromaKeyFilter'
import { ColorOverlayFilter } from './ColorOverlayFilter'
import { DropShadowFilter } from './DropShadowFilter'
import { scaleEffectGeometry, scaleFilterPadding } from './effectPassScale'
import { FillOpacityFilter } from './FillOpacityFilter'
import { GaussianBlurContentFilter } from './GaussianBlurContentFilter'
import { GradientOverlayFilter } from './GradientOverlayFilter'
import { InnerGlowFilter } from './InnerGlowFilter'
import { InnerShadowFilter } from './InnerShadowFilter'
import { OuterGlowFilter } from './OuterGlowFilter'
import { PatternOverlayFilter } from './PatternOverlayFilter'
import { SatinFilter } from './SatinFilter'
import { SharpenFilter } from './SharpenFilter'
import { NoiseContentFilter } from './NoiseContentFilter'
import { StrokeFilter } from './StrokeFilter'
import { AdjustmentFilter } from './AdjustmentFilter'
import { LayerMaskPreFilter } from './LayerMaskPreFilter'
import type { RenderLayerMask } from '../../contracts/RenderDocumentView'

export { resolveEffectStack } from '../resolveEffectStack'
export type { ResolvedStack } from '../resolveEffectStack'

export function parseCssColorRgb(color: string): [number, number, number] {
  const hex = color.replace('#', '')
  if (hex.length >= 6) {
    return [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
    ]
  }
  return [0, 0, 0]
}

/**
 * Combined filter padding from all enabled effects (SPEC §10 boundsInflation).
 * Accumulates outward nodes; maxes inward; clamps to MAX_EFFECT_PAD.
 */
export function effectsPadding(effects: RenderLayerEffect[] | undefined): number {
  return resolveEffectStack(effects).padding
}

function positionToUniform(position: string | undefined): number {
  if (position === 'inside') return 2
  if (position === 'center') return 1
  return 0
}

function buildFilterForEffect(
  effect: RenderLayerEffect,
  pad: number,
  fillForOuter: number,
  textureDocumentTransform: DocumentTextureTransform | undefined,
): Filter | null {
  switch (effect.type) {
    case 'chroma-key':
      return new ChromaKeyFilter({
        keyRgb: parseCssColorRgb(effect.keyColor),
        tolerance: effect.tolerance,
        softness: effect.softness,
        despill: effect.despill,
        choke: effect.choke,
        mode: effect.mode,
        connectivityMask: effect.connectivityMask,
        padding: pad,
      })
    case 'pattern-overlay':
      return new PatternOverlayFilter({
        opacity: effect.opacity,
        scale: effect.scale,
        angle: effect.angle,
        pattern: effect.pattern,
        invert: effect.invert,
        offsetX: effect.offsetX,
        offsetY: effect.offsetY,
        blendMode: effect.blendMode,
        padding: pad,
      })
    case 'gradient-overlay': {
      return new GradientOverlayFilter({
        stops: effect.stops.map((stop) => ({
          offset: stop.offset,
          color: parseCssColorRgb(stop.color),
          opacity: stop.opacity,
        })),
        opacity: effect.opacity,
        angle: effect.angle,
        scale: effect.scale,
        style: effect.style,
        reverse: effect.reverse,
        offsetX: effect.offsetX,
        offsetY: effect.offsetY,
        blendMode: effect.blendMode,
        padding: pad,
      })
    }
    case 'color-overlay':
      return new ColorOverlayFilter({
        color: parseCssColorRgb(effect.color),
        opacity: effect.opacity,
        blendMode: effect.blendMode,
        padding: pad,
      })
    case 'satin': {
      const { offsetX, offsetY } = angleDistanceToOffset(
        effect.angle,
        effect.distance,
      )
      return new SatinFilter({
        color: parseCssColorRgb(effect.color),
        opacity: effect.opacity,
        offsetX,
        offsetY,
        size: effect.size,
        invert: effect.invert,
        blendMode: effect.blendMode,
        padding: pad,
      })
    }
    case 'inner-glow':
      return new InnerGlowFilter({
        color: parseCssColorRgb(effect.color),
        opacity: effect.opacity,
        size: effect.size,
        choke: effect.choke,
        source: effect.source === 'center' ? 1 : 0,
        blendMode: effect.blendMode,
        padding: pad,
      })
    case 'inner-shadow': {
      const { offsetX, offsetY } = angleDistanceToOffset(
        effect.angle,
        effect.distance,
      )
      return new InnerShadowFilter({
        color: parseCssColorRgb(effect.color),
        opacity: effect.opacity,
        offsetX,
        offsetY,
        blur: effect.size,
        choke: effect.choke,
        blendMode: effect.blendMode,
        padding: pad,
      })
    }
    case 'bevel-emboss':
      return new BevelEmbossFilter({
        highlightColor: parseCssColorRgb(effect.highlightColor),
        shadowColor: parseCssColorRgb(effect.shadowColor),
        highlightOpacity: effect.highlightOpacity,
        shadowOpacity: effect.shadowOpacity,
        highlightMode: effect.highlightMode,
        shadowMode: effect.shadowMode,
        size: effect.size,
        depth: effect.depth,
        angle: effect.angle,
        altitude: effect.altitude,
        direction: effect.direction,
        technique: effect.technique,
        style: effect.style,
        contourEnabled: effect.contourEnabled,
        contour: effect.contour,
        contourRange: effect.contourRange,
        contourAntiAliased: effect.contourAntiAliased,
        textureEnabled: effect.textureEnabled,
        texturePattern: effect.texturePattern,
        textureScale: effect.textureScale,
        textureDepth: effect.textureDepth,
        textureInvert: effect.textureInvert,
        textureAlignWithLayer: effect.textureAlignWithLayer,
        textureDocumentTransform,
        padding: pad,
      })
    case 'stroke':
      return new StrokeFilter({
        color: parseCssColorRgb(effect.color),
        opacity: effect.opacity,
        size: effect.size,
        position: positionToUniform(effect.position),
        blendMode: effect.blendMode,
        fillOpacity: fillForOuter,
        padding: pad,
      })
    case 'outer-glow':
      return new OuterGlowFilter({
        color: parseCssColorRgb(effect.color),
        opacity: effect.opacity,
        size: effect.size,
        spread: effect.spread,
        blendMode: effect.blendMode,
        fillOpacity: fillForOuter,
        padding: pad,
      })
    case 'drop-shadow': {
      const { offsetX, offsetY } = angleDistanceToOffset(
        effect.angle,
        effect.distance,
      )
      return new DropShadowFilter({
        color: parseCssColorRgb(effect.color),
        opacity: effect.opacity,
        offsetX,
        offsetY,
        blur: effect.size,
        spread: effect.spread,
        blendMode: effect.blendMode,
        fillOpacity: fillForOuter,
        knockOut: effect.layerKnocksOutDropShadow,
        padding: pad,
      })
    }
    case 'gaussian-blur':
      return new GaussianBlurContentFilter({
        radius: effect.radius,
        padding: pad,
      })
    case 'sharpen':
      return new SharpenFilter({
        amount: effect.amount,
        radius: effect.radius,
        padding: pad,
      })
    case 'noise':
      return new NoiseContentFilter({
        amount: effect.amount,
        distribution: effect.distribution,
        monochromatic: effect.monochromatic,
        padding: pad,
      })
    case 'adjustment': {
      const adj = effect.adjustment
      if (adj.type === 'brightness-contrast') {
        return new AdjustmentFilter({
          mode: 'brightness-contrast',
          params: [adj.brightness, adj.contrast, 0],
          padding: pad,
        })
      }
      if (adj.type === 'hue-saturation') {
        return new AdjustmentFilter({
          mode: 'hue-saturation',
          params: [adj.hueDeg, adj.saturation, adj.lightness],
          padding: pad,
        })
      }
      if (adj.type === 'levels') {
        return new AdjustmentFilter({
          mode: 'levels',
          params: [adj.black, adj.white, adj.gamma],
          padding: pad,
        })
      }
      // curves: GPU filter not yet implemented — skip
      return null
    }
    default:
      return null
  }
}

export type BuildLayerFiltersOptions = {
  fillOpacity?: number
  /**
   * Filter-texture pixels per document pixel for the pass that renders this
   * layer (camera zoom on screen, 1 inside a document-space buffer or an
   * export). See `effectPassScale`.
   */
  scale?: number
  /** Document-space map used by unaligned Bevel Texture sampling. */
  textureDocumentTransform?: DocumentTextureTransform
  /** When set, multiplies content alpha before the FX stack (PS default). */
  preMask?: RenderLayerMask
}

/**
 * Build Pixi filters for a layer's non-destructive effect stack.
 *
 * Ordering and padding come from `resolveEffectStack` (key phase hoisted,
 * array order within phases, accumulating outward insets).
 *
 * Fill Opacity: alone fades alpha; with styles, outer compositors receive
 * fill coverage so styles stay at full style opacity (PS-like).
 */
export function buildLayerFilters(
  effects: RenderLayerEffect[] | undefined,
  options: BuildLayerFiltersOptions = {},
): Filter[] | null {
  const fillOpacity = options.fillOpacity ?? 1
  const resolved = resolveEffectStack(effects, { fillOpacity })
  if (!resolved.nodes.length && fillOpacity >= 1) return null

  const scale = options.scale ?? 1
  const pad = scaleFilterPadding(resolved.padding, scale)
  const filters: Filter[] = []
  const hasStyles = resolved.styleNodes.length > 0
  const fillForOuter = resolved.outerHandlesFill ? fillOpacity : 1

  if (options.preMask && options.textureDocumentTransform) {
    filters.push(
      new LayerMaskPreFilter(options.preMask, options.textureDocumentTransform),
    )
  }

  const pushFilter = (effect: RenderLayerEffect) => {
    const filter = buildFilterForEffect(
      scaleEffectGeometry(effect, scale),
      pad,
      fillForOuter,
      options.textureDocumentTransform,
    )
    if (filter) filters.push(filter)
  }

  for (const effect of resolved.keyNodes) pushFilter(effect)

  for (const effect of resolved.contentNodes) pushFilter(effect)

  if (fillOpacity < 1) {
    if (!hasStyles) {
      filters.push(new FillOpacityFilter(fillOpacity, false))
    } else if (!resolved.outerHandlesFill) {
      filters.push(new FillOpacityFilter(fillOpacity, true))
    }
  }

  for (const effect of resolved.styleNodes) pushFilter(effect)

  return filters.length > 0 ? filters : null
}
