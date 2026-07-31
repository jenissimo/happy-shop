/**
 * Photoshop-faithful Layer Style effect schemas (SPECS/LAYER-STYLES.md).
 * Discriminated by `type`; nested Contour / Texture live on Bevel & Emboss.
 */
import { z } from 'zod'
import { BlendModeSchema, CssColorSchema } from './schemaPrimitives'
import { AdjustmentSchema } from './adjustmentSchema'

const finiteNumber = z.number().finite()
const unitInterval = finiteNumber.min(0).max(1)
const EffectIdSchema = z.string().min(1)
const percent = finiteNumber.min(0).max(100)

/** Named contour curves approximating PS Contour picker presets. */
export const CONTOUR_PRESETS = [
  'linear',
  'gaussian',
  'cone',
  'cone-inverted',
  'ring',
  'ring-double',
  'rolling-slope',
  'rounded-steps',
  'sawtooth',
] as const
export const ContourPresetSchema = z.enum(CONTOUR_PRESETS)
export type ContourPreset = z.infer<typeof ContourPresetSchema>

export const GradientStopSchema = z.object({
  offset: unitInterval,
  color: CssColorSchema,
  opacity: unitInterval,
})
export type GradientStop = z.infer<typeof GradientStopSchema>

export const GradientSchema = z.object({
  stops: z.array(GradientStopSchema).min(2),
})
export type Gradient = z.infer<typeof GradientSchema>

export const DEFAULT_GRADIENT: Gradient = {
  stops: [
    { offset: 0, color: '#000000', opacity: 1 },
    { offset: 1, color: '#ffffff', opacity: 1 },
  ],
}

/** Procedural / stub pattern ids (full library later). */
export const PATTERN_KINDS = ['checker', 'stripes', 'dots', 'noise'] as const
export const PatternKindSchema = z.enum(PATTERN_KINDS)
export type PatternKind = z.infer<typeof PatternKindSchema>

const effectBase = {
  id: EffectIdSchema,
  enabled: z.boolean(),
}

export const DropShadowEffectSchema = z.object({
  ...effectBase,
  type: z.literal('drop-shadow'),
  blendMode: BlendModeSchema,
  color: CssColorSchema,
  opacity: unitInterval,
  /** Global Light angle in degrees (0 = right, CCW; PS default ~120). */
  angle: finiteNumber,
  useGlobalLight: z.boolean(),
  distance: finiteNumber.min(0),
  /** Soften edge as % of size (PS Spread). */
  spread: percent,
  /** Blur radius in px (PS Size). */
  size: finiteNumber.min(0),
  contour: ContourPresetSchema,
  noise: unitInterval,
  layerKnocksOutDropShadow: z.boolean(),
})
export type DropShadowEffect = z.infer<typeof DropShadowEffectSchema>

export const InnerShadowEffectSchema = z.object({
  ...effectBase,
  type: z.literal('inner-shadow'),
  blendMode: BlendModeSchema,
  color: CssColorSchema,
  opacity: unitInterval,
  angle: finiteNumber,
  useGlobalLight: z.boolean(),
  distance: finiteNumber.min(0),
  choke: percent,
  size: finiteNumber.min(0),
  contour: ContourPresetSchema,
  noise: unitInterval,
})
export type InnerShadowEffect = z.infer<typeof InnerShadowEffectSchema>

export const OuterGlowEffectSchema = z.object({
  ...effectBase,
  type: z.literal('outer-glow'),
  blendMode: BlendModeSchema,
  opacity: unitInterval,
  noise: unitInterval,
  technique: z.enum(['softer', 'precise']),
  /** Solid color glow (gradient stub via `gradient` when present). */
  color: CssColorSchema,
  gradient: GradientSchema.optional(),
  spread: percent,
  size: finiteNumber.min(0),
  contour: ContourPresetSchema,
  range: percent,
  jitter: unitInterval,
})
export type OuterGlowEffect = z.infer<typeof OuterGlowEffectSchema>

export const InnerGlowEffectSchema = z.object({
  ...effectBase,
  type: z.literal('inner-glow'),
  blendMode: BlendModeSchema,
  opacity: unitInterval,
  noise: unitInterval,
  technique: z.enum(['softer', 'precise']),
  source: z.enum(['center', 'edge']),
  color: CssColorSchema,
  gradient: GradientSchema.optional(),
  choke: percent,
  size: finiteNumber.min(0),
  contour: ContourPresetSchema,
  range: percent,
  jitter: unitInterval,
})
export type InnerGlowEffect = z.infer<typeof InnerGlowEffectSchema>

export const BevelContourSubSchema = z.object({
  enabled: z.boolean(),
  contour: ContourPresetSchema,
  range: percent,
  antiAliased: z.boolean(),
})
export type BevelContourSub = z.infer<typeof BevelContourSubSchema>

export const BevelTextureSubSchema = z.object({
  enabled: z.boolean(),
  pattern: PatternKindSchema,
  scale: finiteNumber.min(1).max(1000),
  depth: percent,
  invert: z.boolean(),
  alignWithLayer: z.boolean(),
})
export type BevelTextureSub = z.infer<typeof BevelTextureSubSchema>

export const BevelEmbossEffectSchema = z.object({
  ...effectBase,
  type: z.literal('bevel-emboss'),
  style: z.enum([
    'outer-bevel',
    'inner-bevel',
    'emboss',
    'pillow-emboss',
    'stroke-emboss',
  ]),
  technique: z.enum(['smooth', 'chisel-hard', 'chisel-soft']),
  depth: percent,
  direction: z.enum(['up', 'down']),
  size: finiteNumber.min(0),
  soften: finiteNumber.min(0),
  angle: finiteNumber,
  useGlobalLight: z.boolean(),
  altitude: finiteNumber.min(0).max(90),
  glossContour: ContourPresetSchema,
  highlightMode: BlendModeSchema,
  highlightColor: CssColorSchema,
  highlightOpacity: unitInterval,
  shadowMode: BlendModeSchema,
  shadowColor: CssColorSchema,
  shadowOpacity: unitInterval,
  contour: BevelContourSubSchema,
  texture: BevelTextureSubSchema,
})
export type BevelEmbossEffect = z.infer<typeof BevelEmbossEffectSchema>

export const SatinEffectSchema = z.object({
  ...effectBase,
  type: z.literal('satin'),
  blendMode: BlendModeSchema,
  color: CssColorSchema,
  opacity: unitInterval,
  angle: finiteNumber,
  distance: finiteNumber.min(0),
  size: finiteNumber.min(0),
  contour: ContourPresetSchema,
  invert: z.boolean(),
})
export type SatinEffect = z.infer<typeof SatinEffectSchema>

export const ColorOverlayEffectSchema = z.object({
  ...effectBase,
  type: z.literal('color-overlay'),
  blendMode: BlendModeSchema,
  color: CssColorSchema,
  opacity: unitInterval,
})
export type ColorOverlayEffect = z.infer<typeof ColorOverlayEffectSchema>

export const GradientOverlayEffectSchema = z.object({
  ...effectBase,
  type: z.literal('gradient-overlay'),
  blendMode: BlendModeSchema,
  opacity: unitInterval,
  gradient: GradientSchema,
  style: z.enum(['linear', 'radial', 'angle', 'reflected', 'diamond']),
  angle: finiteNumber,
  /** PS Scale 1–150%. */
  scale: finiteNumber.min(1).max(150),
  reverse: z.boolean(),
  alignWithLayer: z.boolean(),
  offsetX: finiteNumber,
  offsetY: finiteNumber,
})
export type GradientOverlayEffect = z.infer<typeof GradientOverlayEffectSchema>

export const PatternOverlayEffectSchema = z.object({
  ...effectBase,
  type: z.literal('pattern-overlay'),
  blendMode: BlendModeSchema,
  opacity: unitInterval,
  pattern: PatternKindSchema,
  scale: finiteNumber.min(1).max(1000),
  /** Rotation in degrees for procedural patterns. */
  angle: finiteNumber.default(0),
  invert: z.boolean().default(false),
  linkWithLayer: z.boolean(),
  offsetX: finiteNumber,
  offsetY: finiteNumber,
})
export type PatternOverlayEffect = z.infer<typeof PatternOverlayEffectSchema>

export const StrokeEffectSchema = z.object({
  ...effectBase,
  type: z.literal('stroke'),
  blendMode: BlendModeSchema,
  opacity: unitInterval,
  overprint: z.boolean(),
  size: finiteNumber.min(0),
  position: z.enum(['inside', 'center', 'outside']),
  fillType: z.enum(['color', 'gradient', 'pattern']),
  color: CssColorSchema,
  gradient: GradientSchema.optional(),
  pattern: PatternKindSchema.optional(),
})
export type StrokeEffect = z.infer<typeof StrokeEffectSchema>

/** CIE Lab chroma key — Happy Shop product delta (SPECS/CHROMA-KEY-AND-TRIM.md). */
export const ChromaKeyEffectSchema = z.object({
  ...effectBase,
  type: z.literal('chroma-key'),
  keyColor: CssColorSchema,
  mode: z.enum(['global', 'flood']),
  floodOrigins: z.array(
    z.object({
      x: z.number().int(),
      y: z.number().int(),
    }),
  ),
  tolerance: finiteNumber.min(0).max(100),
  softness: finiteNumber.min(0).max(100),
  despill: unitInterval,
  choke: z.number().int().min(0).max(5),
  edgeBlur: finiteNumber.min(0).max(10),
})
export type ChromaKeyEffect = z.infer<typeof ChromaKeyEffectSchema>

/** Content-phase: separable Gaussian blur on layer pixels (SPECS/ND-EFFECT-STACK-VISION.md §2.3). */
export const GaussianBlurEffectSchema = z.object({
  ...effectBase,
  type: z.literal('gaussian-blur'),
  radius: finiteNumber.min(0).max(100),
})
export type GaussianBlurEffect = z.infer<typeof GaussianBlurEffectSchema>

/** Content-phase: unsharp mask on layer pixels. */
export const SharpenEffectSchema = z.object({
  ...effectBase,
  type: z.literal('sharpen'),
  /** Strength 0..2 (1 = classic unsharp). */
  amount: finiteNumber.min(0).max(2),
  /** Blur radius for the high-pass reference. */
  radius: finiteNumber.min(0).max(20),
})
export type SharpenEffect = z.infer<typeof SharpenEffectSchema>

/** Content-phase: layer-local adjustment reusing the AdjustmentLayer param union. */
export const AdjustmentEffectSchema = z.object({
  ...effectBase,
  type: z.literal('adjustment'),
  adjustment: AdjustmentSchema,
})
export type AdjustmentEffect = z.infer<typeof AdjustmentEffectSchema>

/** Content-phase: Photoshop Add Noise on layer pixels (amount 0..4 = 0..400%). */
export const NoiseEffectSchema = z.object({
  ...effectBase,
  type: z.literal('noise'),
  amount: finiteNumber.min(0).max(4),
  distribution: z.enum(['uniform', 'gaussian']),
  monochromatic: z.boolean(),
})
export type NoiseEffect = z.infer<typeof NoiseEffectSchema>

/** Style + key effects shipped through schema v5. */
export const LayerEffectV5Schema = z.discriminatedUnion('type', [
  BevelEmbossEffectSchema,
  StrokeEffectSchema,
  InnerShadowEffectSchema,
  InnerGlowEffectSchema,
  SatinEffectSchema,
  ColorOverlayEffectSchema,
  GradientOverlayEffectSchema,
  PatternOverlayEffectSchema,
  OuterGlowEffectSchema,
  DropShadowEffectSchema,
  ChromaKeyEffectSchema,
])

export const LayerEffectSchema = z.discriminatedUnion('type', [
  BevelEmbossEffectSchema,
  StrokeEffectSchema,
  InnerShadowEffectSchema,
  InnerGlowEffectSchema,
  SatinEffectSchema,
  ColorOverlayEffectSchema,
  GradientOverlayEffectSchema,
  PatternOverlayEffectSchema,
  OuterGlowEffectSchema,
  DropShadowEffectSchema,
  ChromaKeyEffectSchema,
  GaussianBlurEffectSchema,
  SharpenEffectSchema,
  AdjustmentEffectSchema,
  NoiseEffectSchema,
])
export type LayerEffect = z.infer<typeof LayerEffectSchema>
export type LayerEffectType = LayerEffect['type']
