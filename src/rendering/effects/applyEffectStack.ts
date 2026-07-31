/**
 * CPU reference: apply a resolved Layer FX stack in paint order.
 * Used by multi-instance goldens so GPU/CPU share `resolveEffectStack`.
 */
import type { RenderLayerEffect } from '../contracts/RenderDocumentView'
import { applyNoiseContent } from './noiseContent'
import {
  applyBevelEmboss,
  applyBrightnessContrast,
  applyChromaKey,
  applyColorOverlay,
  applyDropShadow,
  applyGaussianBlurContent,
  applyGradientOverlay,
  applyHueSaturation,
  applyInnerGlowEdge,
  applyInnerShadow,
  applyLevels,
  applyOuterGlow,
  applyPatternOverlay,
  applySatin,
  applySharpenContent,
  applyStrokeOutside,
} from './layerEffects'
import type { DocumentTextureTransform } from './filters/BevelEmbossFilter'
import { resolveEffectStack } from './resolveEffectStack'

function parseHex(color: string): { r: number; g: number; b: number } {
  const hex = color.replace('#', '')
  if (hex.length < 6) return { r: 0, g: 0, b: 0 }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

export type ApplyEffectStackOptions = {
  fillOpacity?: number
  /** Maps layer-local pixels into document pixels for unaligned Bevel Texture. */
  textureDocumentTransform?: DocumentTextureTransform
}

/**
 * Apply enabled effects in resolver order. Mutates / returns the working buffer.
 * Stroke/shadow/glow kernels allocate; overlays mutate in place.
 */
export function applyEffectStack(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  effects: readonly RenderLayerEffect[] | undefined,
  options: ApplyEffectStackOptions = {},
): Uint8ClampedArray {
  const resolved = resolveEffectStack(effects, {
    fillOpacity: options.fillOpacity ?? 1,
  })
  let buf = rgba
  for (const effect of resolved.nodes) {
    buf = applyOneCpuEffect(
      buf,
      width,
      height,
      effect,
      options.textureDocumentTransform,
    )
  }
  return buf
}

function applyOneCpuEffect(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderLayerEffect,
  textureDocumentTransform: DocumentTextureTransform | undefined,
): Uint8ClampedArray {
  switch (effect.type) {
    case 'chroma-key': {
      const rgba = src
      applyChromaKey(rgba, {
        keyRgb: parseHex(effect.keyColor),
        tolerance: effect.tolerance,
        softness: effect.softness,
        despill: effect.despill,
        choke: effect.choke,
        mode: effect.mode,
        floodOrigins: effect.floodOrigins,
        width,
        height,
      })
      return rgba
    }
    case 'color-overlay': {
      applyColorOverlay(src, parseHex(effect.color), effect.opacity, effect.blendMode)
      return src
    }
    case 'gradient-overlay': {
      applyGradientOverlay(
        src,
        width,
        height,
        effect.stops.map((stop) => ({
          offset: stop.offset,
          color: parseHex(stop.color),
          opacity: stop.opacity,
        })),
        effect.opacity,
        effect.angle,
        effect.blendMode,
      )
      return src
    }
    case 'pattern-overlay': {
      applyPatternOverlay(src, width, height, effect.opacity, {
        kind: effect.pattern,
        scale: effect.scale,
        angle: effect.angle,
        invert: effect.invert,
        offsetX: effect.offsetX,
        offsetY: effect.offsetY,
      }, effect.blendMode)
      return src
    }
    case 'satin': {
      applySatin(src, width, height, {
        color: parseHex(effect.color),
        opacity: effect.opacity,
        angle: effect.angle,
        distance: effect.distance,
        invert: effect.invert,
        blendMode: effect.blendMode,
      })
      return src
    }
    case 'inner-glow': {
      applyInnerGlowEdge(
        src,
        width,
        height,
        parseHex(effect.color),
        effect.opacity,
        effect.size,
        effect.blendMode,
      )
      return src
    }
    case 'inner-shadow': {
      applyInnerShadow(src, width, height, {
        color: parseHex(effect.color),
        opacity: effect.opacity,
        angle: effect.angle,
        distance: effect.distance,
        size: effect.size,
        blendMode: effect.blendMode,
      })
      return src
    }
    case 'bevel-emboss': {
      applyBevelEmboss(src, width, height, {
        size: effect.size,
        depth: effect.depth,
        technique: effect.technique,
        highlight: parseHex(effect.highlightColor),
        shadow: parseHex(effect.shadowColor),
        highlightOpacity: effect.highlightOpacity,
        shadowOpacity: effect.shadowOpacity,
        contour: {
          enabled: effect.contourEnabled,
          preset: effect.contour,
          range: effect.contourRange,
          antiAliased: effect.contourAntiAliased,
        },
        texture: {
          enabled: effect.textureEnabled,
          pattern: effect.texturePattern,
          scale: effect.textureScale,
          depth: effect.textureDepth,
          invert: effect.textureInvert,
          alignWithLayer: effect.textureAlignWithLayer,
          documentTransform: textureDocumentTransform,
        },
      })
      return src
    }
    case 'stroke': {
      if (effect.position === 'inside') return src
      return applyStrokeOutside(
        src,
        width,
        height,
        parseHex(effect.color),
        effect.opacity,
        effect.size,
        effect.blendMode,
      )
    }
    case 'outer-glow':
      return applyOuterGlow(
        src,
        width,
        height,
        parseHex(effect.color),
        effect.opacity,
        effect.size,
        effect.blendMode,
      )
    case 'drop-shadow':
      return applyDropShadow(src, width, height, {
        color: parseHex(effect.color),
        opacity: effect.opacity,
        angle: effect.angle,
        distance: effect.distance,
        size: effect.size,
        blendMode: effect.blendMode,
      })
    case 'gaussian-blur': {
      const rgba = src.slice()
      applyGaussianBlurContent(rgba, width, height, effect.radius)
      return rgba
    }
    case 'sharpen': {
      const rgba = src.slice()
      applySharpenContent(rgba, width, height, effect.amount, effect.radius)
      return rgba
    }
    case 'adjustment': {
      const rgba = src.slice()
      const adj = effect.adjustment
      if (adj.type === 'brightness-contrast') {
        applyBrightnessContrast(rgba, adj.brightness, adj.contrast)
      } else if (adj.type === 'hue-saturation') {
        applyHueSaturation(rgba, adj.hueDeg, adj.saturation, adj.lightness)
      } else {
        applyLevels(rgba, adj.black, adj.white, adj.gamma)
      }
      return rgba
    }
    case 'noise': {
      const rgba = src.slice()
      applyNoiseContent(
        rgba,
        width,
        height,
        effect.amount,
        effect.distribution,
        effect.monochromatic,
      )
      return rgba
    }
    default:
      return src
  }
}
