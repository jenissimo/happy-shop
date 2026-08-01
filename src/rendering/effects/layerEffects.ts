/**
 * Layer effect descriptors + CPU reference kernels for goldens (SPEC §8.3 / §10).
 * Pixi filter wiring uses these params; preview/export must share semantics.
 *
 * Adobe Layer Style paint order (bottom → top) — see buildLayerFilters.ts.
 */

import { applyChromaKeyBuffer } from '../../imaging/worker/pixelScan'
import { angleDistanceToOffset } from './angleOffset'
import { samplePattern, type PatternSampleOptions } from './patterns'
import { sampleBevelHeight, type BevelTechnique } from './bevelTechnique'
import type { RenderContourPreset, RenderPatternKind } from '../contracts/RenderDocumentView'
import type { DocumentTextureTransform } from './filters/BevelEmbossFilter'

export type Insets = { top: number; right: number; bottom: number; left: number }

export type EffectDescriptor = {
  type: string
  boundsInflation(input: {
    blur?: number
    size?: number
    offsetX?: number
    offsetY?: number
    spread?: number
    edgeBlur?: number
  }): Insets
}

export const dropShadowDescriptor: EffectDescriptor = {
  type: 'drop-shadow',
  boundsInflation(input) {
    const blur = input.blur ?? input.size ?? 0
    const spread = input.spread ?? 0
    const pad = Math.ceil(blur * 2 + spread)
    const ox = Math.abs(input.offsetX ?? 0)
    const oy = Math.abs(input.offsetY ?? 0)
    return {
      top: pad + oy,
      right: pad + ox,
      bottom: pad + oy,
      left: pad + ox,
    }
  },
}

export const outerGlowDescriptor: EffectDescriptor = {
  type: 'outer-glow',
  boundsInflation(input) {
    const pad = Math.ceil((input.size ?? 0) * 2)
    return { top: pad, right: pad, bottom: pad, left: pad }
  },
}

export const innerShadowDescriptor: EffectDescriptor = {
  type: 'inner-shadow',
  boundsInflation(input) {
    // Inner effects don't expand bounds, but soft edges may sample outside.
    const pad = Math.ceil((input.blur ?? input.size ?? 0) + Math.abs(input.offsetX ?? 0))
    return { top: pad, right: pad, bottom: pad, left: pad }
  },
}

export const innerGlowDescriptor: EffectDescriptor = {
  type: 'inner-glow',
  boundsInflation(input) {
    const pad = Math.ceil((input.size ?? 0) * 0.5)
    return { top: pad, right: pad, bottom: pad, left: pad }
  },
}

export const bevelEmbossDescriptor: EffectDescriptor = {
  type: 'bevel-emboss',
  boundsInflation(input) {
    const pad = Math.ceil(input.size ?? 0)
    return { top: pad, right: pad, bottom: pad, left: pad }
  },
}

export const satinDescriptor: EffectDescriptor = {
  type: 'satin',
  boundsInflation(input) {
    const pad = Math.ceil((input.size ?? 0) + Math.abs(input.offsetX ?? 0))
    return { top: pad, right: pad, bottom: pad, left: pad }
  },
}

export const strokeDescriptor: EffectDescriptor = {
  type: 'stroke',
  boundsInflation(input) {
    const size = Math.ceil(input.size ?? 0)
    return { top: size, right: size, bottom: size, left: size }
  },
}

export const colorOverlayDescriptor: EffectDescriptor = {
  type: 'color-overlay',
  boundsInflation() {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  },
}

export const gradientOverlayDescriptor: EffectDescriptor = {
  type: 'gradient-overlay',
  boundsInflation() {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  },
}

export const patternOverlayDescriptor: EffectDescriptor = {
  type: 'pattern-overlay',
  boundsInflation() {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  },
}

export const chromaKeyDescriptor: EffectDescriptor = {
  type: 'chroma-key',
  boundsInflation(input) {
    const edgeBlur = input.edgeBlur ?? 0
    const pad = edgeBlur > 0 ? Math.ceil(edgeBlur * 3) : 0
    return { top: pad, right: pad, bottom: pad, left: pad }
  },
}

/** Brightness/contrast in [-1,1] → ColorMatrix-ish scale/offset on RGB. */
export function applyBrightnessContrast(
  rgba: Uint8ClampedArray,
  brightness: number,
  contrast: number,
): void {
  const b = brightness * 255
  const c = contrast
  const factor = (259 * (c * 255 + 255)) / (255 * (259 - c * 255))
  for (let i = 0; i < rgba.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      let v = rgba[i + k]!
      v = factor * (v - 128) + 128 + b
      rgba[i + k] = Math.max(0, Math.min(255, Math.round(v)))
    }
  }
}

export function applyHueSaturation(
  rgba: Uint8ClampedArray,
  hueDeg: number,
  saturation: number,
  lightness: number,
): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]! / 255
    const g = rgba[i + 1]! / 255
    const b = rgba[i + 2]! / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0
    const d = max - min
    const l = (max + min) * 0.5
    let s = max === 0 ? 0 : d / max
    if (d > 0) {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
        case g: h = ((b - r) / d + 2) / 6; break
        default: h = ((r - g) / d + 4) / 6; break
      }
    }
    h = (h + hueDeg / 360 + 1) % 1
    s = Math.max(0, Math.min(1, s * (1 + saturation)))
    const l2 = Math.max(0, Math.min(1, l + lightness))
    const q = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s
    const p = 2 * l2 - q
    const hueToRgb = (t: number) => {
      let x = t
      if (x < 0) x += 1
      if (x > 1) x -= 1
      if (x < 1 / 6) return p + (q - p) * 6 * x
      if (x < 1 / 2) return q
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
      return p
    }
    rgba[i] = Math.round(hueToRgb(h + 1 / 3) * 255)
    rgba[i + 1] = Math.round(hueToRgb(h) * 255)
    rgba[i + 2] = Math.round(hueToRgb(h - 1 / 3) * 255)
  }
}

export function applyLevels(
  rgba: Uint8ClampedArray,
  black: number,
  white: number,
  gamma: number,
): void {
  const lo = Math.max(0, Math.min(254, black)) / 255
  const hi = Math.max(lo + 1 / 255, Math.min(1, white / 255))
  const g = Math.max(0.01, gamma)
  for (let i = 0; i < rgba.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const t = Math.max(0, Math.min(1, (rgba[i + k]! / 255 - lo) / (hi - lo)))
      rgba[i + k] = Math.round(Math.pow(t, 1 / g) * 255)
    }
  }
}

function blurChannelBuffer(
  src: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  return gaussianBlurSeparable(src, width, height, radius)
}

/** Content-phase Gaussian blur on RGB; alpha unchanged. */
export function applyGaussianBlurContent(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, radius)
  if (r === 0) return
  for (let channel = 0; channel < 3; channel++) {
    const plane = new Float32Array(width * height)
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      plane[p] = rgba[i + channel]! / 255
    }
    const blurred = blurChannelBuffer(plane, width, height, r)
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      rgba[i + channel] = Math.round(blurred[p]! * 255)
    }
  }
}

/** Content-phase unsharp mask on RGB; alpha unchanged. */
export function applySharpenContent(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  radius: number,
): void {
  const src = rgba.slice()
  applyGaussianBlurContent(rgba, width, height, radius)
  for (let i = 0; i < rgba.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const original = src[i + k]!
      const blurred = rgba[i + k]!
      rgba[i + k] = Math.max(
        0,
        Math.min(255, Math.round(original + (original - blurred) * amount)),
      )
    }
  }
}

/** Naive sRGB → Lab distance chroma key (global mode). */
export function applyChromaKeyGlobal(
  rgba: Uint8ClampedArray,
  keyRgb: { r: number; g: number; b: number },
  tolerance: number,
  softness: number,
): void {
  applyChromaKey(rgba, {
    keyRgb,
    tolerance,
    softness,
    mode: 'global',
  })
}

export type ApplyChromaKeyOptions = {
  keyRgb: { r: number; g: number; b: number }
  tolerance: number
  softness: number
  despill?: number
  choke?: number
  mode?: 'global' | 'flood'
  /** Required for flood mode (layer pixel size). */
  width?: number
  height?: number
  floodOrigins?: ReadonlyArray<{ x: number; y: number }>
}

/**
 * CPU chroma contract used by goldens / export (SPEC §21.6).
 * Flood = 4-connected from seeds through Lab distance ≤ tolerance+softness.
 * GPU preview remains global-only (see `imageGoldens/README.md`).
 */
export function applyChromaKey(
  rgba: Uint8ClampedArray,
  options: ApplyChromaKeyOptions,
): void {
  applyChromaKeyBuffer(rgba, {
    keyR: options.keyRgb.r,
    keyG: options.keyRgb.g,
    keyB: options.keyRgb.b,
    tolerance: options.tolerance,
    softness: options.softness,
    despill: options.despill,
    choke: options.choke,
    mode: options.mode ?? 'global',
    floodOrigins: options.floodOrigins,
    width: options.width,
    height: options.height,
  })
}

/** CPU reference: color overlay (lerp RGB by opacity; alpha unchanged). */
import type { RenderBlendMode } from '../contracts/RenderDocumentView'

/** CPU reference: color overlay (lerp RGB by opacity; alpha unchanged). */
export type EffectBlendMode = RenderBlendMode

function blendChannel(base: number, blend: number, mode: EffectBlendMode): number {
  switch (mode) {
    case 'multiply':
      return base * blend
    case 'screen':
      return 1 - (1 - base) * (1 - blend)
    case 'overlay':
      return base < 0.5 ? 2 * base * blend : 1 - 2 * (1 - base) * (1 - blend)
    case 'darken':
      return Math.min(base, blend)
    case 'lighten':
      return Math.max(base, blend)
    case 'color-dodge':
      return blend >= 1 ? 1 : Math.min(1, base / Math.max(1 - blend, 1e-4))
    case 'color-burn':
      return blend <= 0 ? 0 : 1 - Math.min(1, (1 - base) / blend)
    case 'linear-burn':
      return Math.max(0, base + blend - 1)
    case 'linear-dodge':
      return Math.min(1, base + blend)
    case 'darker-color':
      return Math.min(base, blend)
    case 'lighter-color':
      return Math.max(base, blend)
    case 'hard-light':
      return blend < 0.5 ? 2 * base * blend : 1 - 2 * (1 - base) * (1 - blend)
    case 'soft-light': {
      const d =
        base <= 0.25 ? ((16 * base - 12) * base + 4) * base : Math.sqrt(base)
      return blend <= 0.5
        ? base - (1 - 2 * blend) * base * (1 - base)
        : base + (2 * blend - 1) * (d - base)
    }
    case 'vivid-light':
      return blend < 0.5
        ? (blend <= 0 ? 0 : 1 - Math.min(1, (1 - base) / (2 * blend)))
        : (blend >= 1 ? 1 : Math.min(1, base / Math.max(1 - 2 * (blend - 0.5), 1e-4)))
    case 'linear-light':
      return Math.max(0, Math.min(1, base + 2 * blend - 1))
    case 'pin-light':
      return blend < 0.5 ? Math.min(base, 2 * blend) : Math.max(base, 2 * (blend - 0.5))
    case 'hard-mix':
      return base + blend < 1 ? 0 : 1
    case 'difference':
      return Math.abs(base - blend)
    case 'exclusion':
      return base + blend - 2 * base * blend
    case 'subtract':
      return Math.max(0, base - blend)
    case 'divide':
      return blend <= 0 ? 1 : Math.min(1, base / blend)
    case 'normal':
    default:
      return blend
  }
}

/** Mix an effect RGB over a straight-alpha base with its blend mode. */
export function blendEffectRgb(
  base: number,
  effect: number,
  amount: number,
  mode: EffectBlendMode = 'normal',
): number {
  const blended = blendChannel(base / 255, effect / 255, mode) * 255
  return Math.round(base * (1 - amount) + blended * amount)
}

export function applyColorOverlay(
  rgba: Uint8ClampedArray,
  color: { r: number; g: number; b: number },
  opacity: number,
  blendMode: EffectBlendMode = 'normal',
): void {
  const a = Math.max(0, Math.min(1, opacity))
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! === 0) continue
    rgba[i] = blendEffectRgb(rgba[i]!, color.r, a, blendMode)
    rgba[i + 1] = blendEffectRgb(rgba[i + 1]!, color.g, a, blendMode)
    rgba[i + 2] = blendEffectRgb(rgba[i + 2]!, color.b, a, blendMode)
  }
}

/**
 * CPU reference: outside stroke via morphological dilation of alpha.
 * Writes into a new buffer of the same size (caller pads via boundsInflation).
 */
export function applyStrokeOutside(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
  opacity: number,
  size: number,
  blendMode: EffectBlendMode = 'normal',
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src)
  const radius = Math.max(0, Math.ceil(size))
  if (radius === 0) return out
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const srcA = src[i + 3]! / 255
      let maxA = 0
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue
          const sx = x + dx
          const sy = y + dy
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
          maxA = Math.max(maxA, src[(sy * width + sx) * 4 + 3]! / 255)
        }
      }
      // Dilated coverage only; srcA is applied once via (1 - srcA) in the composite.
      const strokeA = maxA * opacity
      const outA = srcA + strokeA * (1 - srcA)
      if (outA <= 0) continue
      const strokeR = srcA > 0 ? blendEffectRgb(src[i]!, color.r, 1, blendMode) : color.r
      const strokeG = srcA > 0 ? blendEffectRgb(src[i + 1]!, color.g, 1, blendMode) : color.g
      const strokeB = srcA > 0 ? blendEffectRgb(src[i + 2]!, color.b, 1, blendMode) : color.b
      const r = (strokeR * strokeA * (1 - srcA) + src[i]! * srcA) / outA
      const g = (strokeG * strokeA * (1 - srcA) + src[i + 1]! * srcA) / outA
      const b = (strokeB * strokeA * (1 - srcA) + src[i + 2]! * srcA) / outA
      out[i] = Math.round(r)
      out[i + 1] = Math.round(g)
      out[i + 2] = Math.round(b)
      out[i + 3] = Math.round(outA * 255)
    }
  }
  return out
}

/** Separable Gaussian blur on a single-channel float buffer (CPU goldens). */
export function gaussianBlurSeparable(
  src: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const r = Math.max(0, Math.ceil(radius))
  if (r === 0) return new Float32Array(src)
  const sigma = Math.max(r * 0.5, 0.35)
  const kernel: number[] = []
  let wsum = 0
  for (let i = -r; i <= r; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma))
    kernel.push(w)
    wsum += w
  }
  for (let i = 0; i < kernel.length; i++) kernel[i]! /= wsum

  const tmp = new Float32Array(width * height)
  const out = new Float32Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(width - 1, Math.max(0, x + k))
        sum += src[y * width + xx]! * kernel[k + r]!
      }
      tmp[y * width + x] = sum
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + k))
        sum += tmp[yy * width + x]! * kernel[k + r]!
      }
      out[y * width + x] = sum
    }
  }
  return out
}

/** CPU drop-shadow: offset + separable Gaussian alpha silhouette under source. */
export function applyDropShadow(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  opts: {
    color: { r: number; g: number; b: number }
    opacity: number
    angle: number
    distance: number
    size: number
    blendMode?: EffectBlendMode
  },
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src)
  const { offsetX, offsetY } = angleDistanceToOffset(opts.angle, opts.distance)
  const ox = Math.round(offsetX)
  const oy = Math.round(offsetY)
  const radius = Math.max(0, Math.ceil(opts.size))
  const silhouette = new Float32Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = x - ox
      const sy = y - oy
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
      silhouette[y * width + x] = src[(sy * width + sx) * 4 + 3]! / 255
    }
  }

  const shadow = gaussianBlurSeparable(silhouette, width, height, radius)

  for (let i = 0, p = 0; i < src.length; i += 4, p++) {
    const srcA = src[i + 3]! / 255
    const shadowA = shadow[p]! * opts.opacity
    const outA = srcA + shadowA * (1 - srcA)
    if (outA <= 0) {
      out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0
      continue
    }
    const shadowR = srcA > 0 ? blendEffectRgb(src[i]!, opts.color.r, 1, opts.blendMode) : opts.color.r
    const shadowG = srcA > 0 ? blendEffectRgb(src[i + 1]!, opts.color.g, 1, opts.blendMode) : opts.color.g
    const shadowB = srcA > 0 ? blendEffectRgb(src[i + 2]!, opts.color.b, 1, opts.blendMode) : opts.color.b
    out[i] = Math.round((src[i]! * srcA + shadowR * shadowA * (1 - srcA)) / outA)
    out[i + 1] = Math.round((src[i + 1]! * srcA + shadowG * shadowA * (1 - srcA)) / outA)
    out[i + 2] = Math.round((src[i + 2]! * srcA + shadowB * shadowA * (1 - srcA)) / outA)
    out[i + 3] = Math.round(outA * 255)
  }
  return out
}

/** CPU outer glow: dilated soft alpha. */
export function applyOuterGlow(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
  opacity: number,
  size: number,
  blendMode: EffectBlendMode = 'normal',
): Uint8ClampedArray {
  return applyStrokeOutside(src, width, height, color, opacity, size, blendMode)
}

/** CPU inner glow (edge): darken/tint inside near edge. */
export function applyInnerGlowEdge(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
  opacity: number,
  size: number,
  blendMode: EffectBlendMode = 'normal',
): void {
  const radius = Math.max(0, Math.ceil(size))
  const src = new Uint8ClampedArray(rgba)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const a = src[i + 3]! / 255
      if (a <= 0) continue
      let minA = 1
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue
          const sx = x + dx
          const sy = y + dy
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
            minA = 0
            continue
          }
          minA = Math.min(minA, src[(sy * width + sx) * 4 + 3]! / 255)
        }
      }
      const glow = a * (1 - minA) * opacity
      const t = Math.min(1, glow / Math.max(a, 1e-4))
      rgba[i] = blendEffectRgb(src[i]!, color.r, t, blendMode)
      rgba[i + 1] = blendEffectRgb(src[i + 1]!, color.g, t, blendMode)
      rgba[i + 2] = blendEffectRgb(src[i + 2]!, color.b, t, blendMode)
    }
  }
}

/** CPU inner shadow. */
export function applyInnerShadow(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  opts: {
    color: { r: number; g: number; b: number }
    opacity: number
    angle: number
    distance: number
    size: number
    blendMode?: EffectBlendMode
  },
): void {
  const { offsetX, offsetY } = angleDistanceToOffset(opts.angle, opts.distance)
  const ox = Math.round(offsetX)
  const oy = Math.round(offsetY)
  const src = new Uint8ClampedArray(rgba)
  const radius = Math.max(0, Math.ceil(opts.size))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const a = src[i + 3]! / 255
      if (a <= 0) continue
      let shadow = 0
      let n = 0
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = x - ox + dx
          const sy = y - oy + dy
          n++
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
            shadow += 1
            continue
          }
          shadow += 1 - src[(sy * width + sx) * 4 + 3]! / 255
        }
      }
      const t = Math.min(1, (shadow / Math.max(n, 1)) * opts.opacity)
      rgba[i] = blendEffectRgb(src[i]!, opts.color.r, t, opts.blendMode)
      rgba[i + 1] = blendEffectRgb(src[i + 1]!, opts.color.g, t, opts.blendMode)
      rgba[i + 2] = blendEffectRgb(src[i + 2]!, opts.color.b, t, opts.blendMode)
    }
  }
}

/** CPU satin (offset-alpha XOR). */
export function applySatin(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  opts: {
    color: { r: number; g: number; b: number }
    opacity: number
    angle: number
    distance: number
    invert: boolean
    blendMode?: EffectBlendMode
  },
): void {
  const { offsetX, offsetY } = angleDistanceToOffset(opts.angle, opts.distance)
  const ox = Math.round(offsetX)
  const oy = Math.round(offsetY)
  const src = new Uint8ClampedArray(rgba)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const a = src[i + 3]! / 255
      if (a <= 0) continue
      const sample = (xx: number, yy: number) => {
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) return 0
        return src[(yy * width + xx) * 4 + 3]! / 255
      }
      let satin = Math.abs(sample(x + ox, y + oy) - sample(x - ox, y - oy))
      if (opts.invert) satin = 1 - satin
      const t = Math.min(1, satin * opts.opacity)
      rgba[i] = blendEffectRgb(src[i]!, opts.color.r, t, opts.blendMode)
      rgba[i + 1] = blendEffectRgb(src[i + 1]!, opts.color.g, t, opts.blendMode)
      rgba[i + 2] = blendEffectRgb(src[i + 2]!, opts.color.b, t, opts.blendMode)
    }
  }
}

export type CpuGradientStop = {
  offset: number
  color: { r: number; g: number; b: number }
  opacity: number
}

/** Samples sorted gradient stops with the same piecewise-linear semantics as GPU. */
export function sampleGradientStops(
  stops: readonly CpuGradientStop[],
  t: number,
): CpuGradientStop {
  const sorted = [...stops].sort((a, b) => a.offset - b.offset)
  const first = sorted[0] ?? { offset: 0, color: { r: 0, g: 0, b: 0 }, opacity: 1 }
  if (t <= first.offset) return first
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!
    const previous = sorted[i - 1]!
    if (t <= next.offset) {
      const local = Math.max(
        0,
        Math.min(1, (t - previous.offset) / Math.max(next.offset - previous.offset, 1e-6)),
      )
      return {
        offset: t,
        color: {
          r: previous.color.r * (1 - local) + next.color.r * local,
          g: previous.color.g * (1 - local) + next.color.g * local,
          b: previous.color.b * (1 - local) + next.color.b * local,
        },
        opacity: previous.opacity * (1 - local) + next.opacity * local,
      }
    }
  }
  return sorted.at(-1) ?? first
}

/** CPU linear gradient overlay sampling every stop. */
export function applyGradientOverlay(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  stops: readonly CpuGradientStop[],
  opacity: number,
  angleDeg: number,
  blendMode: EffectBlendMode = 'normal',
): void {
  const rad = (angleDeg * Math.PI) / 180
  const ca = Math.cos(rad)
  const sa = Math.sin(rad)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (rgba[i + 3]! === 0) continue
      const u = (x / Math.max(width - 1, 1) - 0.5) * ca + (y / Math.max(height - 1, 1) - 0.5) * sa
      const sample = sampleGradientStops(stops, Math.max(0, Math.min(1, u + 0.5)))
      const a = opacity * sample.opacity
      rgba[i] = blendEffectRgb(rgba[i]!, sample.color.r, a, blendMode)
      rgba[i + 1] = blendEffectRgb(rgba[i + 1]!, sample.color.g, a, blendMode)
      rgba[i + 2] = blendEffectRgb(rgba[i + 2]!, sample.color.b, a, blendMode)
    }
  }
}

/** CPU linear gradient overlay (legacy two-stop convenience wrapper). */
export function applyGradientOverlayLinear(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  colorA: { r: number; g: number; b: number },
  colorB: { r: number; g: number; b: number },
  opacity: number,
  angleDeg: number,
): void {
  applyGradientOverlay(
    rgba,
    width,
    height,
    [
      { offset: 0, color: colorA, opacity: 1 },
      { offset: 1, color: colorB, opacity: 1 },
    ],
    opacity,
    angleDeg,
  )
}

/** CPU pattern overlay using the same generator as swatches and the GPU shader. */
export function applyPatternOverlay(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  opacity: number,
  options: PatternSampleOptions,
  blendMode: EffectBlendMode = 'normal',
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (rgba[i + 3]! === 0) continue
      const pattern = samplePattern(x, y, options)
      const value = Math.round((0.15 + (0.85 - 0.15) * pattern) * 255)
      rgba[i] = blendEffectRgb(rgba[i]!, value, opacity, blendMode)
      rgba[i + 1] = blendEffectRgb(rgba[i + 1]!, value, opacity, blendMode)
      rgba[i + 2] = blendEffectRgb(rgba[i + 2]!, value, opacity, blendMode)
    }
  }
}

/** CPU checker pattern overlay (legacy convenience wrapper). */
export function applyPatternOverlayChecker(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  opacity: number,
  cell = 4,
): void {
  applyPatternOverlay(rgba, width, height, opacity, {
    kind: 'checker',
    scale: cell / 0.08,
  })
}

/** Shared contour curve used by the CPU golden and GPU bevel filter. */
export function sampleBevelContour(
  preset: RenderContourPreset,
  value: number,
): number {
  const t = Math.max(0, Math.min(1, value))
  switch (preset) {
    case 'gaussian':
      return t * t * (3 - 2 * t)
    case 'cone':
      return 1 - Math.abs(2 * t - 1)
    case 'cone-inverted':
      return Math.abs(2 * t - 1)
    case 'ring':
      return Math.max(0, 1 - Math.abs(4 * (t - Math.floor(t)) - 2))
    case 'ring-double':
      return Math.max(0, 1 - Math.abs(8 * (t - Math.floor(t)) - 4))
    case 'rolling-slope':
      return 0.5 + 0.5 * Math.sin((t - 0.5) * Math.PI)
    case 'rounded-steps':
      return Math.floor(t * 4 + 0.5) / 4
    case 'sawtooth':
      return (t * 4) % 1
    default:
      return t
  }
}

/** CPU bevel highlight/shadow from alpha gradient (smooth + chisel techniques). */
export function applyBevelEmboss(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  opts: {
    size: number
    depth: number
    technique?: BevelTechnique
    highlight: { r: number; g: number; b: number }
    shadow: { r: number; g: number; b: number }
    highlightOpacity: number
    shadowOpacity: number
    contour?: {
      enabled: boolean
      preset: RenderContourPreset
      range: number
      antiAliased: boolean
    }
    texture?: {
      enabled: boolean
      pattern: RenderPatternKind
      scale: number
      depth: number
      invert: boolean
      alignWithLayer?: boolean
      documentTransform?: DocumentTextureTransform
    }
  },
): void {
  const src = new Uint8ClampedArray(rgba)
  const s = Math.max(1, Math.ceil(opts.size))
  const depth = opts.depth / 100
  const technique = opts.technique ?? 'smooth'
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const a = src[i + 3]! / 255
      if (a <= 0) continue
      const at = (xx: number, yy: number) => {
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) return 0
        return src[(yy * width + xx) * 4 + 3]! / 255
      }
      const heightAt = (xx: number, yy: number) =>
        sampleBevelHeight(at(xx, yy), technique, s)
      let gx = (heightAt(x + s, y) - heightAt(x - s, y)) * depth
      let gy = (heightAt(x, y + s) - heightAt(x, y - s)) * depth
      if (opts.texture?.enabled) {
        const texture = opts.texture
        const documentPoint = (xx: number, yy: number): [number, number] => {
          if (texture.alignWithLayer !== false || !texture.documentTransform) {
            return [xx, yy]
          }
          const { xAxis, yAxis, offset } = texture.documentTransform
          return [
            offset[0] + xx * xAxis[0] + yy * yAxis[0],
            offset[1] + xx * xAxis[1] + yy * yAxis[1],
          ]
        }
        const sampleTexture = (xx: number, yy: number) => {
          const [documentX, documentY] = documentPoint(xx, yy)
          return samplePattern(documentX, documentY, {
            kind: texture.pattern,
            scale: texture.scale,
            invert: texture.invert,
          })
        }
        const textureScale = (texture.depth / 100) * 0.35 * depth
        gx += (sampleTexture(x + 1, y) - sampleTexture(x - 1, y)) * textureScale
        gy += (sampleTexture(x, y + 1) - sampleTexture(x, y - 1)) * textureScale
      }
      // Light from upper-left; chisel uses tighter ramps for facet contrast.
      const ndotl = (-gx - gy) / Math.max(0.001, Math.hypot(gx, gy, 1))
      const hiEdge =
        technique === 'smooth' ? 1 : technique === 'chisel-hard' ? 0.35 : 0.55
      let hiRaw = Math.max(0, (ndotl + 0.05) / hiEdge)
      let shRaw = Math.max(0, (-ndotl + 0.05) / hiEdge)
      hiRaw = Math.min(1, hiRaw)
      shRaw = Math.min(1, shRaw)
      if (opts.contour?.enabled) {
        const range = Math.max(0, Math.min(1, opts.contour.range / 100))
        hiRaw = hiRaw * (1 - range) + sampleBevelContour(opts.contour.preset, hiRaw) * range
        shRaw = shRaw * (1 - range) + sampleBevelContour(opts.contour.preset, shRaw) * range
        if (opts.contour.antiAliased) {
          hiRaw = hiRaw * hiRaw * (3 - 2 * hiRaw)
          shRaw = shRaw * shRaw * (3 - 2 * shRaw)
        }
      }
      const hi = hiRaw * opts.highlightOpacity
      const sh = shRaw * opts.shadowOpacity
      let r = src[i]!
      let g = src[i + 1]!
      let b = src[i + 2]!
      r = r * (1 - hi) + opts.highlight.r * hi
      g = g * (1 - hi) + opts.highlight.g * hi
      b = b * (1 - hi) + opts.highlight.b * hi
      r = r * (1 - sh) + opts.shadow.r * sh
      g = g * (1 - sh) + opts.shadow.g * sh
      b = b * (1 - sh) + opts.shadow.b * sh
      rgba[i] = Math.round(r)
      rgba[i + 1] = Math.round(g)
      rgba[i + 2] = Math.round(b)
    }
  }
}

/** Normal-mode Porter-Duff over for blend goldens. */
export function blendNormalOver(
  dst: Uint8ClampedArray,
  src: Uint8ClampedArray,
): void {
  for (let i = 0; i < dst.length; i += 4) {
    const sa = src[i + 3]! / 255
    const da = dst[i + 3]! / 255
    const outA = sa + da * (1 - sa)
    if (outA <= 0) {
      dst[i] = dst[i + 1] = dst[i + 2] = dst[i + 3] = 0
      continue
    }
    dst[i] = Math.round((src[i]! * sa + dst[i]! * da * (1 - sa)) / outA)
    dst[i + 1] = Math.round((src[i + 1]! * sa + dst[i + 1]! * da * (1 - sa)) / outA)
    dst[i + 2] = Math.round((src[i + 2]! * sa + dst[i + 2]! * da * (1 - sa)) / outA)
    dst[i + 3] = Math.round(outA * 255)
  }
}

/** Multiply blend (straight alpha; SPEC §8.1 subset for goldens). */
export function blendMultiply(
  dst: Uint8ClampedArray,
  src: Uint8ClampedArray,
): void {
  for (let i = 0; i < dst.length; i += 4) {
    const sa = src[i + 3]! / 255
    const da = dst[i + 3]! / 255
    if (sa <= 0) continue
    const mr = (dst[i]! / 255) * (src[i]! / 255) * 255
    const mg = (dst[i + 1]! / 255) * (src[i + 1]! / 255) * 255
    const mb = (dst[i + 2]! / 255) * (src[i + 2]! / 255) * 255
    const outR = mr * sa + dst[i]! * (1 - sa)
    const outG = mg * sa + dst[i + 1]! * (1 - sa)
    const outB = mb * sa + dst[i + 2]! * (1 - sa)
    const outA = sa + da * (1 - sa)
    dst[i] = Math.round(outR)
    dst[i + 1] = Math.round(outG)
    dst[i + 2] = Math.round(outB)
    dst[i + 3] = Math.round(outA * 255)
  }
}

export { angleDistanceToOffset }
