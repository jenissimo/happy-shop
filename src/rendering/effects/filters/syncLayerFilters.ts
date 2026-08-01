/**
 * Param-only GPU FX updates (ND-EFFECT-STACK-VISION §5.3).
 * Walks an existing filter chain in build order and patches uniforms in place.
 */
import type { Filter } from 'pixi.js'
import type { RenderLayerEffect } from '../../contracts/RenderDocumentView'
import { angleDistanceToOffset } from '../angleOffset'
import { resolveEffectStack } from '../resolveEffectStack'
import type { DocumentTextureTransform } from './BevelEmbossFilter'
import { AdjustmentFilter } from './AdjustmentFilter'
import { BevelEmbossFilter } from './BevelEmbossFilter'
import { ChromaKeyFilter } from './ChromaKeyFilter'
import { ColorOverlayFilter } from './ColorOverlayFilter'
import { DropShadowFilter } from './DropShadowFilter'
import { FillOpacityFilter } from './FillOpacityFilter'
import { GaussianBlurContentFilter } from './GaussianBlurContentFilter'
import { GradientOverlayFilter } from './GradientOverlayFilter'
import { InnerGlowFilter } from './InnerGlowFilter'
import { InnerShadowFilter } from './InnerShadowFilter'
import { LayerMaskPreFilter } from './LayerMaskPreFilter'
import { OuterGlowFilter } from './OuterGlowFilter'
import { PatternOverlayFilter } from './PatternOverlayFilter'
import { SatinFilter } from './SatinFilter'
import { SharpenFilter } from './SharpenFilter'
import { NoiseContentFilter } from './NoiseContentFilter'
import { StrokeFilter } from './StrokeFilter'
import type { BuildLayerFiltersOptions } from './buildLayerFilters'
import { parseCssColorRgb } from './buildLayerFilters'

function positionToUniform(position: string | undefined): number {
  if (position === 'inside') return 2
  if (position === 'center') return 1
  return 0
}

function syncFilterForEffect(
  filter: Filter,
  effect: RenderLayerEffect,
  pad: number,
  fillForOuter: number,
  textureDocumentTransform: DocumentTextureTransform | undefined,
): boolean {
  switch (effect.type) {
    case 'chroma-key':
      if (!(filter instanceof ChromaKeyFilter)) return false
      filter.setParams({
        keyRgb: parseCssColorRgb(effect.keyColor),
        tolerance: effect.tolerance,
        softness: effect.softness,
        despill: effect.despill,
        choke: effect.choke,
        mode: effect.mode,
        connectivityMask: effect.connectivityMask,
        padding: pad,
      })
      return true
    case 'pattern-overlay':
      if (!(filter instanceof PatternOverlayFilter)) return false
      filter.setParams({
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
      return true
    case 'gradient-overlay':
      if (!(filter instanceof GradientOverlayFilter)) return false
      filter.setParams({
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
      return true
    case 'color-overlay':
      if (!(filter instanceof ColorOverlayFilter)) return false
      filter.setParams({
        color: parseCssColorRgb(effect.color),
        opacity: effect.opacity,
        blendMode: effect.blendMode,
        padding: pad,
      })
      return true
    case 'satin': {
      if (!(filter instanceof SatinFilter)) return false
      const { offsetX, offsetY } = angleDistanceToOffset(effect.angle, effect.distance)
      filter.setParams({
        color: parseCssColorRgb(effect.color),
        opacity: effect.opacity,
        offsetX,
        offsetY,
        size: effect.size,
        invert: effect.invert,
        blendMode: effect.blendMode,
        padding: pad,
      })
      return true
    }
    case 'inner-glow':
      if (!(filter instanceof InnerGlowFilter)) return false
      filter.setParams({
        color: parseCssColorRgb(effect.color),
        opacity: effect.opacity,
        size: effect.size,
        choke: effect.choke,
        source: effect.source === 'center' ? 1 : 0,
        blendMode: effect.blendMode,
        padding: pad,
      })
      return true
    case 'inner-shadow': {
      if (!(filter instanceof InnerShadowFilter)) return false
      const { offsetX, offsetY } = angleDistanceToOffset(effect.angle, effect.distance)
      filter.setParams({
        color: parseCssColorRgb(effect.color),
        opacity: effect.opacity,
        offsetX,
        offsetY,
        blur: effect.size,
        choke: effect.choke,
        blendMode: effect.blendMode,
        padding: pad,
      })
      return true
    }
    case 'bevel-emboss':
      if (!(filter instanceof BevelEmbossFilter)) return false
      filter.setParams({
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
        style: effect.style,
        technique: effect.technique,
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
      return true
    case 'stroke':
      if (!(filter instanceof StrokeFilter)) return false
      filter.setParams({
        color: parseCssColorRgb(effect.color),
        opacity: effect.opacity,
        size: effect.size,
        position: positionToUniform(effect.position),
        blendMode: effect.blendMode,
        fillOpacity: fillForOuter,
        padding: pad,
      })
      return true
    case 'outer-glow':
      if (!(filter instanceof OuterGlowFilter)) return false
      filter.setParams({
        color: parseCssColorRgb(effect.color),
        opacity: effect.opacity,
        size: effect.size,
        spread: effect.spread,
        blendMode: effect.blendMode,
        fillOpacity: fillForOuter,
        padding: pad,
      })
      return true
    case 'drop-shadow': {
      if (!(filter instanceof DropShadowFilter)) return false
      const { offsetX, offsetY } = angleDistanceToOffset(effect.angle, effect.distance)
      filter.setParams({
        color: parseCssColorRgb(effect.color),
        opacity: effect.opacity,
        offsetX,
        offsetY,
        blur: effect.size,
        blendMode: effect.blendMode,
        fillOpacity: fillForOuter,
        knockOut: effect.layerKnocksOutDropShadow,
        padding: pad,
      })
      return true
    }
    case 'gaussian-blur':
      if (!(filter instanceof GaussianBlurContentFilter)) return false
      filter.setParams({ radius: effect.radius, padding: pad })
      return true
    case 'sharpen':
      if (!(filter instanceof SharpenFilter)) return false
      filter.setParams({
        amount: effect.amount,
        radius: effect.radius,
        padding: pad,
      })
      return true
    case 'noise':
      if (!(filter instanceof NoiseContentFilter)) return false
      filter.setParams({
        amount: effect.amount,
        distribution: effect.distribution,
        monochromatic: effect.monochromatic,
        padding: pad,
      })
      return true
    case 'adjustment': {
      if (!(filter instanceof AdjustmentFilter)) return false
      const adj = effect.adjustment
      if (adj.type === 'brightness-contrast') {
        filter.setParams({
          mode: 'brightness-contrast',
          params: [adj.brightness, adj.contrast, 0],
          padding: pad,
        })
      } else if (adj.type === 'hue-saturation') {
        filter.setParams({
          mode: 'hue-saturation',
          params: [adj.hueDeg, adj.saturation, adj.lightness],
          padding: pad,
        })
      } else if (adj.type === 'levels') {
        filter.setParams({
          mode: 'levels',
          params: [adj.black, adj.white, adj.gamma],
          padding: pad,
        })
      } else {
        return false
      }
      return true
    }
    default:
      return false
  }
}

/** Expected filter count for a resolved stack (must match `buildLayerFilters`). */
export function expectedLayerFilterCount(
  effects: RenderLayerEffect[] | undefined,
  options: BuildLayerFiltersOptions = {},
): number {
  const fillOpacity = options.fillOpacity ?? 1
  const resolved = resolveEffectStack(effects, { fillOpacity })
  if (!resolved.nodes.length && fillOpacity >= 1) return 0

  const hasStyles = resolved.styleNodes.length > 0
  let count = resolved.keyNodes.length + resolved.contentNodes.length + resolved.styleNodes.length
  if (options.preMask && options.textureDocumentTransform) count += 1
  if (fillOpacity < 1) {
    if (!hasStyles || !resolved.outerHandlesFill) count += 1
  }
  return count
}

/**
 * Patch uniforms on an existing filter chain. Returns false when the chain
 * does not match the effect stack (caller should rebuild via `buildLayerFilters`).
 */
export function syncLayerFilters(
  filters: Filter[] | null | undefined,
  effects: RenderLayerEffect[] | undefined,
  options: BuildLayerFiltersOptions = {},
): boolean {
  const fillOpacity = options.fillOpacity ?? 1
  const resolved = resolveEffectStack(effects, { fillOpacity })
  const expected = expectedLayerFilterCount(effects, options)
  if (!filters || filters.length !== expected) return false
  if (expected === 0) return true

  const pad = resolved.padding
  const hasStyles = resolved.styleNodes.length > 0
  const fillForOuter = resolved.outerHandlesFill ? fillOpacity : 1
  const textureDocumentTransform = options.textureDocumentTransform
  let index = 0

  if (options.preMask && textureDocumentTransform) {
    if (!(filters[index] instanceof LayerMaskPreFilter)) return false
    index += 1
  }

  for (const effect of resolved.keyNodes) {
    if (!syncFilterForEffect(filters[index]!, effect, pad, fillForOuter, textureDocumentTransform)) {
      return false
    }
    index += 1
  }

  for (const effect of resolved.contentNodes) {
    if (!syncFilterForEffect(filters[index]!, effect, pad, fillForOuter, textureDocumentTransform)) {
      return false
    }
    index += 1
  }

  if (fillOpacity < 1) {
    if (!hasStyles) {
      const filter = filters[index]
      if (!(filter instanceof FillOpacityFilter)) return false
      filter.setParams({ fillOpacity, keepShapeForStyles: false })
      index += 1
    } else if (!resolved.outerHandlesFill) {
      const filter = filters[index]
      if (!(filter instanceof FillOpacityFilter)) return false
      filter.setParams({ fillOpacity, keepShapeForStyles: true })
      index += 1
    }
  }

  for (const effect of resolved.styleNodes) {
    if (!syncFilterForEffect(filters[index]!, effect, pad, fillForOuter, textureDocumentTransform)) {
      return false
    }
    index += 1
  }

  return index === filters.length
}
