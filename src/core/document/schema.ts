import { z } from 'zod'
import { MAX_CANVAS_SIDE } from './limits'
import {
  BLEND_MODES,
  BlendModeSchema,
  CssColorSchema,
  finiteNumber,
  unitInterval,
  type BlendMode,
  type CssColor,
} from './schemaPrimitives'
import {
  AdjustmentSchema,
  BrightnessContrastAdjustmentSchema,
  HueSaturationAdjustmentSchema,
  LevelsAdjustmentSchema,
  type Adjustment,
  type AdjustmentType,
  type BrightnessContrastAdjustment,
  type HueSaturationAdjustment,
  type LevelsAdjustment,
} from './adjustmentSchema'
import { DocumentPathStoreSchema } from './pathSchema'
import {
  BevelEmbossEffectSchema,
  ChromaKeyEffectSchema,
  ColorOverlayEffectSchema,
  DropShadowEffectSchema,
  GaussianBlurEffectSchema,
  GradientOverlayEffectSchema,
  InnerGlowEffectSchema,
  InnerShadowEffectSchema,
  LayerEffectSchema,
  LayerEffectV5Schema,
  OuterGlowEffectSchema,
  PatternOverlayEffectSchema,
  SatinEffectSchema,
  SharpenEffectSchema,
  StrokeEffectSchema,
  AdjustmentEffectSchema,
  NoiseEffectSchema,
  type AdjustmentEffect,
  type BevelEmbossEffect,
  type ChromaKeyEffect,
  type ColorOverlayEffect,
  type DropShadowEffect,
  type GaussianBlurEffect,
  type GradientOverlayEffect,
  type InnerGlowEffect,
  type InnerShadowEffect,
  type LayerEffect,
  type LayerEffectType,
  type OuterGlowEffect,
  type PatternOverlayEffect,
  type SatinEffect,
  type SharpenEffect,
  type NoiseEffect,
  type StrokeEffect,
} from './layerEffectsSchema'

/**
 * Zod schemas are the source of truth for the serializable document model
 * (SPEC §8.1). TypeScript types are inferred from them so shape and runtime
 * validation can never drift apart.
 */

export const LayerIdSchema = z.string().min(1).brand<'LayerId'>()
export type LayerId = z.infer<typeof LayerIdSchema>

export { PathIdSchema, PathKnotSchema, VectorPathSchema, DocumentPathStoreSchema } from './pathSchema'
export type { PathId, PathKnot, PathHandle, VectorPath, DocumentPathStore } from './pathSchema'

export const AssetIdSchema = z.string().min(1).brand<'AssetId'>()
export type AssetId = z.infer<typeof AssetIdSchema>

/** Opaque reference to raster pixel bytes owned by the raster store. */
export const RasterAssetRefSchema = z.string().min(1).brand<'RasterAssetRef'>()
export type RasterAssetRef = z.infer<typeof RasterAssetRefSchema>

/** Opaque reference to a raster mask owned by the raster store. */
export const RasterMaskRefSchema = z.string().min(1).brand<'RasterMaskRef'>()
export type RasterMaskRef = z.infer<typeof RasterMaskRefSchema>

export {
  BLEND_MODES,
  BlendModeSchema,
  CssColorSchema,
  BevelEmbossEffectSchema,
  ChromaKeyEffectSchema,
  ColorOverlayEffectSchema,
  DropShadowEffectSchema,
  GradientOverlayEffectSchema,
  InnerGlowEffectSchema,
  InnerShadowEffectSchema,
  LayerEffectSchema,
  OuterGlowEffectSchema,
  PatternOverlayEffectSchema,
  SatinEffectSchema,
  StrokeEffectSchema,
  GaussianBlurEffectSchema,
  SharpenEffectSchema,
  AdjustmentEffectSchema,
  NoiseEffectSchema,
}
export type {
  BlendMode,
  CssColor,
  AdjustmentEffect,
  BevelEmbossEffect,
  ChromaKeyEffect,
  ColorOverlayEffect,
  DropShadowEffect,
  GaussianBlurEffect,
  GradientOverlayEffect,
  InnerGlowEffect,
  InnerShadowEffect,
  LayerEffect,
  LayerEffectType,
  OuterGlowEffect,
  PatternOverlayEffect,
  SatinEffect,
  SharpenEffect,
  NoiseEffect,
  StrokeEffect,
}

export {
  CONTOUR_PRESETS,
  ContourPresetSchema,
  DEFAULT_GRADIENT,
  GradientSchema,
  GradientStopSchema,
  PATTERN_KINDS,
  PatternKindSchema,
  BevelContourSubSchema,
  BevelTextureSubSchema,
} from './layerEffectsSchema'
export type {
  ContourPreset,
  Gradient,
  GradientStop,
  PatternKind,
  BevelContourSub,
  BevelTextureSub,
} from './layerEffectsSchema'

export const TransformSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  scaleX: finiteNumber,
  scaleY: finiteNumber,
  rotationDeg: finiteNumber,
  skewXDeg: finiteNumber,
  skewYDeg: finiteNumber,
  pivotX: finiteNumber,
  pivotY: finiteNumber,
})
export type Transform = z.infer<typeof TransformSchema>

/**
 * Photoshop-style granular layer locks. `locked` remains the legacy/all-lock
 * switch; absent flags preserve compatibility with existing documents.
 */
export const LayerLockFlagsSchema = z.object({
  transparentPixels: z.boolean(),
  imagePixels: z.boolean(),
  position: z.boolean(),
})
export type LayerLockFlags = z.infer<typeof LayerLockFlagsSchema>

export {
  AdjustmentSchema,
  BrightnessContrastAdjustmentSchema,
  HueSaturationAdjustmentSchema,
  LevelsAdjustmentSchema,
}
export type {
  Adjustment,
  AdjustmentType,
  BrightnessContrastAdjustment,
  HueSaturationAdjustment,
  LevelsAdjustment,
}

const LayerBaseSchema = z.object({
  id: LayerIdSchema,
  name: z.string().min(1),
  parentId: LayerIdSchema.nullable(),
  visible: z.boolean(),
  locked: z.boolean(),
  lockFlags: LayerLockFlagsSchema.optional(),
  opacity: unitInterval,
  /**
   * Photoshop Fill Opacity: fades layer pixels without removing style shapes.
   * GPU approx scales content alpha early in the FX chain (see LAYER-STYLES.md).
   */
  fillOpacity: unitInterval,
  blendMode: BlendModeSchema,
  transform: TransformSchema,
  mask: RasterMaskRefSchema.optional(),
  /** When `mask` is set, `false` disables it in the compositor (default: enabled). */
  maskEnabled: z.boolean().optional(),
  /**
   * When `true`, the layer mask clips the post-FX result (Photoshop "Layer Mask
   * Hides Effects"). Default `false`: mask multiplies content alpha before FX.
   */
  maskHidesEffects: z.boolean().optional(),
  /**
   * When `true`, clips this layer's content and effects to the opacity mask of
   * the underlying non-clipping layer in the stack (Photoshop Clipping Mask).
   */
  clipping: z.boolean().optional(),
  effects: z.array(LayerEffectSchema),
})
export type LayerBase = z.infer<typeof LayerBaseSchema>

export const RasterLayerSchema = LayerBaseSchema.extend({
  type: z.literal('raster'),
  pixels: RasterAssetRefSchema,
})
export type RasterLayer = z.infer<typeof RasterLayerSchema>

export const GroupLayerSchema = LayerBaseSchema.extend({
  type: z.literal('group'),
  /** Bottom -> top. */
  children: z.array(LayerIdSchema),
  isolated: z.boolean(),
})
export type GroupLayer = z.infer<typeof GroupLayerSchema>

export const AdjustmentLayerSchema = LayerBaseSchema.extend({
  type: z.literal('adjustment'),
  adjustment: AdjustmentSchema,
})
export type AdjustmentLayer = z.infer<typeof AdjustmentLayerSchema>

export const TEXT_ALIGNS = ['left', 'center', 'right', 'justify'] as const
export const TextAlignSchema = z.enum(TEXT_ALIGNS)
export type TextAlign = z.infer<typeof TextAlignSchema>

export const TextModeSchema = z.enum(['point', 'box'])
export type TextMode = z.infer<typeof TextModeSchema>

export const TextBoundsSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  w: finiteNumber.min(0),
  h: finiteNumber.min(0),
})
export type TextBounds = z.infer<typeof TextBoundsSchema>

/** Provenance for a byte-backed, committed Google Fonts face. */
export const GoogleFontSourceSchema = z.object({
  kind: z.literal('google-fonts'),
  catalogId: z.string().min(1),
  weight: z.number().int().min(100).max(900),
  style: z.enum(['normal', 'italic']),
  version: z.string().min(1),
  /** Present when the face was pinned from a variable-font axis combination. */
  variationPin: z.string().min(1).optional(),
  /** Resolved axis values at commit time; omitted for static-instance commits. */
  axes: z.record(z.string(), z.number()).optional(),
})
export type GoogleFontSource = z.infer<typeof GoogleFontSourceSchema>

/**
 * A contiguous character range with its resolved character styling. Runs cover
 * `TextLayer.content` in order; an empty layer has no runs.
 */
export const TextRunSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  fontFamily: z.string().min(1),
  fontSource: GoogleFontSourceSchema.optional(),
  fontSize: finiteNumber.positive(),
  fontWeight: finiteNumber.min(100).max(900),
  italic: z.boolean(),
  color: CssColorSchema,
  /** When omitted, inherits `TextLayer.underline`. */
  underline: z.boolean().optional(),
  /** When omitted, inherits `TextLayer.tracking` (1/1000 em). */
  tracking: finiteNumber.optional(),
  /** When omitted, inherits `TextLayer.baselineShift` (document px). */
  baselineShift: finiteNumber.optional(),
  horizontalScale: finiteNumber.min(1).max(1000).optional(),
  verticalScale: finiteNumber.min(1).max(1000).optional(),
  fauxBold: z.boolean().optional(),
  fauxItalic: z.boolean().optional(),
  allCaps: z.boolean().optional(),
  smallCaps: z.boolean().optional(),
}).refine((run) => run.end > run.start, {
  message: 'text run end must be after start',
})
export type TextRun = z.infer<typeof TextRunSchema>

/**
 * Editable text layer (SPECS/TEXT-TOOL.md). No pixel buffer — glyphs are a
 * derived Pixi resource until `layer.rasterize`.
 */
export const TextLayerSchema = LayerBaseSchema.extend({
  type: z.literal('text'),
  textMode: TextModeSchema,
  content: z.string(),
  fontFamily: z.string().min(1),
  fontSize: finiteNumber.positive(),
  fontWeight: finiteNumber.min(100).max(900),
  italic: z.boolean(),
  underline: z.boolean(),
  color: CssColorSchema,
  /** Character spacing in 1/1000 em (Photoshop tracking). */
  tracking: finiteNumber,
  /** Line height in document px; `0` = auto (~1.2 × fontSize). */
  leading: finiteNumber.min(0),
  /** Baseline shift in document px (positive raises glyphs). */
  baselineShift: finiteNumber.default(0),
  horizontalScale: finiteNumber.default(100),
  verticalScale: finiteNumber.default(100),
  fauxBold: z.boolean().default(false),
  fauxItalic: z.boolean().default(false),
  allCaps: z.boolean().default(false),
  smallCaps: z.boolean().default(false),
  align: TextAlignSchema,
  bounds: TextBoundsSchema,
  /** Missing means system/bundled resolution; present requires Tier-3 bytes. */
  fontSource: GoogleFontSourceSchema.optional(),
  /** Resolved, contiguous character formatting. Empty when `content` is empty. */
  runs: z.array(TextRunSchema),
})
export type TextLayer = z.infer<typeof TextLayerSchema>

/**
 * Vector shape layer (SPECS/UX-PHOTOSHOP.md M4.5). No pixel buffer — live Pixi
 * Graphics in the compositor; bake via `layer.rasterize` (CPU Canvas2D).
 */
export const ShapeLayerSchema = LayerBaseSchema.extend({
  type: z.literal('shape'),
  primitive: z.enum(['rect', 'ellipse', 'polygon', 'star', 'line', 'arrow', 'svg-path']),
  bounds: z.object({
    x: finiteNumber,
    y: finiteNumber,
    w: finiteNumber.positive(),
    h: finiteNumber.positive(),
  }),
  fill: z.object({
    enabled: z.boolean(),
    color: CssColorSchema,
    opacity: unitInterval,
  }),
  stroke: z.object({
    enabled: z.boolean(),
    color: CssColorSchema,
    opacity: unitInterval,
    width: finiteNumber.min(0),
  }),
  cornerRadius: finiteNumber.min(0).optional(),
  /** Sides for regular polygons; omitted keeps legacy-compatible defaults. */
  sides: z.number().int().min(3).max(32).optional(),
  starPoints: z.number().int().min(3).max(32).optional(),
  /** Inner-star radius as a fraction of the outer radius. */
  starInset: finiteNumber.min(0.05).max(0.95).optional(),
  /** Editable simple SVG `d` data (M/L/H/V/C/Z). */
  pathData: z.string().min(1).max(100_000).optional(),
})
export type ShapeLayer = z.infer<typeof ShapeLayerSchema>

export const LayerSchema = z.discriminatedUnion('type', [
  RasterLayerSchema,
  GroupLayerSchema,
  AdjustmentLayerSchema,
  TextLayerSchema,
  ShapeLayerSchema,
])
export type Layer = z.infer<typeof LayerSchema>
export type LayerType = Layer['type']

export const CanvasBackgroundSchema = z.union([
  z.literal('transparent'),
  z.object({ color: CssColorSchema }),
])
export type CanvasBackground = z.infer<typeof CanvasBackgroundSchema>

export const CanvasSchema = z.object({
  width: z.number().int().positive().max(MAX_CANVAS_SIDE),
  height: z.number().int().positive().max(MAX_CANVAS_SIDE),
  colorSpace: z.literal('srgb'),
  pixelFormat: z.literal('rgba8'),
  background: CanvasBackgroundSchema,
})
export type Canvas = z.infer<typeof CanvasSchema>

/** Current document schema (text tracking 1/1000 em + baselineShift + justify). */
export const CURRENT_SCHEMA_VERSION = 7 as const

/** Pre-text documents. */
export const SCHEMA_VERSION_1 = 1 as const
/** Text/shape + v0.1 styles (drop-shadow offset/blur form). */
export const SCHEMA_VERSION_2 = 2 as const
/** Layer styles + the original rect/ellipse ShapeLayer scaffold. */
export const SCHEMA_VERSION_3 = 3 as const
/** Shape expansion, before selection-scoped text runs. */
export const SCHEMA_VERSION_4 = 4 as const
/** Rich text runs, before content-phase FX nodes. */
export const SCHEMA_VERSION_5 = 5 as const
/** Paths + content-phase FX; tracking still document px. */
export const SCHEMA_VERSION_6 = 6 as const

/** @deprecated Use SCHEMA_VERSION_1 — kept for existing imports. */
export const LEGACY_SCHEMA_VERSION = SCHEMA_VERSION_1

/** v5 text-run documents (frozen for v5 → v6 migration). */
const RasterLayerV5Schema = RasterLayerSchema.extend({
  effects: z.array(LayerEffectV5Schema),
})
const GroupLayerV5Schema = GroupLayerSchema.extend({
  effects: z.array(LayerEffectV5Schema),
})
const AdjustmentLayerV5Schema = AdjustmentLayerSchema.extend({
  effects: z.array(LayerEffectV5Schema),
})
const TextLayerV5Schema = TextLayerSchema.extend({
  effects: z.array(LayerEffectV5Schema),
})
const ShapeLayerV5Schema = ShapeLayerSchema.extend({
  effects: z.array(LayerEffectV5Schema),
})

export const HappyDocumentV5Schema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION_5),
  id: z.string().min(1),
  name: z.string().min(1),
  canvas: CanvasSchema,
  rootChildren: z.array(LayerIdSchema),
  layers: z.record(
    LayerIdSchema,
    z.discriminatedUnion('type', [
      RasterLayerV5Schema,
      GroupLayerV5Schema,
      AdjustmentLayerV5Schema,
      TextLayerV5Schema,
      ShapeLayerV5Schema,
    ]),
  ),
})
export type HappyDocumentV5 = z.infer<typeof HappyDocumentV5Schema>

export const HappyDocumentSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  canvas: CanvasSchema,
  /** Bottom -> top. */
  rootChildren: z.array(LayerIdSchema),
  layers: z.record(LayerIdSchema, LayerSchema),
  /** Pen tool work path + saved paths (additive v6 field). */
  paths: DocumentPathStoreSchema.optional(),
})
export type HappyDocument = z.infer<typeof HappyDocumentSchema>

/** Frozen v6 documents (tracking still in document px; no baselineShift required). */
export const HappyDocumentV6Schema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION_6),
  id: z.string().min(1),
  name: z.string().min(1),
  canvas: CanvasSchema,
  rootChildren: z.array(LayerIdSchema),
  layers: z.record(LayerIdSchema, LayerSchema),
  paths: DocumentPathStoreSchema.optional(),
})
export type HappyDocumentV6 = z.infer<typeof HappyDocumentV6Schema>

/**
 * v1 document shape for migration only. Layer union omits `text`/`shape`;
 * no fillOpacity; v0.1 effect subset.
 */
const LegacyDropShadowV1 = z.object({
  id: z.string().min(1),
  type: z.literal('drop-shadow'),
  enabled: z.boolean(),
  color: CssColorSchema,
  opacity: unitInterval,
  offsetX: finiteNumber,
  offsetY: finiteNumber,
  blur: finiteNumber.min(0),
  spread: finiteNumber.min(0),
})
const LegacyStrokeV1 = z.object({
  id: z.string().min(1),
  type: z.literal('stroke'),
  enabled: z.boolean(),
  color: CssColorSchema,
  opacity: unitInterval,
  size: finiteNumber.min(0),
  position: z.enum(['inside', 'center', 'outside']),
})
const LegacyColorOverlayV1 = z.object({
  id: z.string().min(1),
  type: z.literal('color-overlay'),
  enabled: z.boolean(),
  color: CssColorSchema,
  opacity: unitInterval,
  blendMode: BlendModeSchema,
})
const LegacyChromaKeyV1 = ChromaKeyEffectSchema
const LegacyEffectV1 = z.discriminatedUnion('type', [
  LegacyDropShadowV1,
  LegacyStrokeV1,
  LegacyColorOverlayV1,
  LegacyChromaKeyV1,
])

const LayerBaseV1Schema = z.object({
  id: LayerIdSchema,
  name: z.string().min(1),
  parentId: LayerIdSchema.nullable(),
  visible: z.boolean(),
  locked: z.boolean(),
  opacity: unitInterval,
  blendMode: BlendModeSchema,
  transform: TransformSchema,
  mask: RasterMaskRefSchema.optional(),
  maskEnabled: z.boolean().optional(),
  effects: z.array(LegacyEffectV1),
})

const RasterLayerV1Schema = LayerBaseV1Schema.extend({
  type: z.literal('raster'),
  pixels: RasterAssetRefSchema,
})
const GroupLayerV1Schema = LayerBaseV1Schema.extend({
  type: z.literal('group'),
  children: z.array(LayerIdSchema),
  isolated: z.boolean(),
})
const AdjustmentLayerV1Schema = LayerBaseV1Schema.extend({
  type: z.literal('adjustment'),
  adjustment: AdjustmentSchema,
})

export const HappyDocumentV1Schema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION_1),
  id: z.string().min(1),
  name: z.string().min(1),
  canvas: CanvasSchema,
  rootChildren: z.array(LayerIdSchema),
  layers: z.record(
    LayerIdSchema,
    z.discriminatedUnion('type', [
      RasterLayerV1Schema,
      GroupLayerV1Schema,
      AdjustmentLayerV1Schema,
    ]),
  ),
})
export type HappyDocumentV1 = z.infer<typeof HappyDocumentV1Schema>

/** v2: text + shape; same legacy effect field names as v1 (+ chroma-key). */
const LayerBaseV2Schema = LayerBaseV1Schema
const RasterLayerV2Schema = RasterLayerV1Schema
const GroupLayerV2Schema = GroupLayerV1Schema
const AdjustmentLayerV2Schema = AdjustmentLayerV1Schema
const TextLayerV2Schema = LayerBaseV2Schema.extend({
  type: z.literal('text'),
  textMode: TextModeSchema,
  content: z.string(),
  fontFamily: z.string().min(1),
  fontSize: finiteNumber.positive(),
  fontWeight: finiteNumber.min(100).max(900),
  italic: z.boolean(),
  underline: z.boolean(),
  color: CssColorSchema,
  tracking: finiteNumber,
  leading: finiteNumber.min(0),
  align: TextAlignSchema,
  bounds: TextBoundsSchema,
})
const ShapeLayerV2Schema = LayerBaseV2Schema.extend({
  type: z.literal('shape'),
  primitive: z.enum(['rect', 'ellipse']),
  bounds: z.object({
    x: finiteNumber,
    y: finiteNumber,
    w: finiteNumber.positive(),
    h: finiteNumber.positive(),
  }),
  fill: z.object({
    enabled: z.boolean(),
    color: CssColorSchema,
    opacity: unitInterval,
  }),
  stroke: z.object({
    enabled: z.boolean(),
    color: CssColorSchema,
    opacity: unitInterval,
    width: finiteNumber.min(0),
  }),
  cornerRadius: finiteNumber.min(0).optional(),
})

/** Frozen v3 shape representation, used exclusively for additive v3 → v4 migration. */
const ShapeLayerV3Schema = LayerBaseSchema.extend({
  type: z.literal('shape'),
  primitive: z.enum(['rect', 'ellipse']),
  bounds: z.object({
    x: finiteNumber,
    y: finiteNumber,
    w: finiteNumber.positive(),
    h: finiteNumber.positive(),
  }),
  fill: z.object({
    enabled: z.boolean(),
    color: CssColorSchema,
    opacity: unitInterval,
  }),
  stroke: z.object({
    enabled: z.boolean(),
    color: CssColorSchema,
    opacity: unitInterval,
    width: finiteNumber.min(0),
  }),
  cornerRadius: finiteNumber.min(0).optional(),
})

export const HappyDocumentV3Schema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION_3),
  id: z.string().min(1),
  name: z.string().min(1),
  canvas: CanvasSchema,
  rootChildren: z.array(LayerIdSchema),
  layers: z.record(
    LayerIdSchema,
    z.discriminatedUnion('type', [
      RasterLayerSchema,
      GroupLayerSchema,
      AdjustmentLayerSchema,
      TextLayerSchema,
      ShapeLayerV3Schema,
    ]),
  ),
})
export type HappyDocumentV3 = z.infer<typeof HappyDocumentV3Schema>

/** v4 shape documents used the layer-wide TextLayer representation. */
export const HappyDocumentV4Schema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION_4),
  id: z.string().min(1),
  name: z.string().min(1),
  canvas: CanvasSchema,
  rootChildren: z.array(LayerIdSchema),
  layers: z.record(
    LayerIdSchema,
    z.discriminatedUnion('type', [
      RasterLayerSchema,
      GroupLayerSchema,
      AdjustmentLayerSchema,
      TextLayerSchema.omit({ runs: true }),
      ShapeLayerSchema,
    ]),
  ),
})
export type HappyDocumentV4 = z.infer<typeof HappyDocumentV4Schema>

export const HappyDocumentV2Schema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION_2),
  id: z.string().min(1),
  name: z.string().min(1),
  canvas: CanvasSchema,
  rootChildren: z.array(LayerIdSchema),
  layers: z.record(
    LayerIdSchema,
    z.discriminatedUnion('type', [
      RasterLayerV2Schema,
      GroupLayerV2Schema,
      AdjustmentLayerV2Schema,
      TextLayerV2Schema,
      ShapeLayerV2Schema,
    ]),
  ),
})
export type HappyDocumentV2 = z.infer<typeof HappyDocumentV2Schema>

/** Envelope for documents whose `schemaVersion` we cannot parse (SPEC §8.2). */
export const UnknownVersionEnvelopeSchema = z.object({
  schemaVersion: z.unknown(),
})
export type UnknownVersionEnvelope = z.infer<
  typeof UnknownVersionEnvelopeSchema
>
