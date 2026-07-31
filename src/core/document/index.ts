/**
 * Public API for the HappyDocument domain model (SPEC §8). Pure data +
 * pure functions only — no Pixi, no React, no worker/bridge dependencies.
 */

export {
  BLEND_MODES,
  BlendModeSchema,
  CURRENT_SCHEMA_VERSION,
  SCHEMA_VERSION_1,
  SCHEMA_VERSION_2,
  SCHEMA_VERSION_3,
  CanvasSchema,
  CanvasBackgroundSchema,
  CssColorSchema,
  AdjustmentSchema,
  BrightnessContrastAdjustmentSchema,
  HueSaturationAdjustmentSchema,
  LevelsAdjustmentSchema,
  LayerEffectSchema,
  DropShadowEffectSchema,
  InnerShadowEffectSchema,
  OuterGlowEffectSchema,
  InnerGlowEffectSchema,
  BevelEmbossEffectSchema,
  SatinEffectSchema,
  StrokeEffectSchema,
  ColorOverlayEffectSchema,
  GradientOverlayEffectSchema,
  PatternOverlayEffectSchema,
  ChromaKeyEffectSchema,
  GaussianBlurEffectSchema,
  SharpenEffectSchema,
  AdjustmentEffectSchema,
  NoiseEffectSchema,
  CONTOUR_PRESETS,
  ContourPresetSchema,
  DEFAULT_GRADIENT,
  GradientSchema,
  PATTERN_KINDS,
  PatternKindSchema,
  HappyDocumentV2Schema,
  HappyDocumentV3Schema,
  HappyDocumentV4Schema,
  HappyDocumentV5Schema,
  SCHEMA_VERSION_5,
  LayerSchema,
  RasterLayerSchema,
  GroupLayerSchema,
  AdjustmentLayerSchema,
  TextLayerSchema,
  ShapeLayerSchema,
  GoogleFontSourceSchema,
  TextRunSchema,
  TextAlignSchema,
  TextModeSchema,
  TextBoundsSchema,
  TEXT_ALIGNS,
  TransformSchema,
  LayerLockFlagsSchema,
  HappyDocumentSchema,
  HappyDocumentV1Schema,
  LEGACY_SCHEMA_VERSION,
  LayerIdSchema,
  AssetIdSchema,
  RasterAssetRefSchema,
  RasterMaskRefSchema,
  UnknownVersionEnvelopeSchema,
} from './schema'

export type {
  BlendMode,
  Canvas,
  CanvasBackground,
  CssColor,
  Adjustment,
  AdjustmentType,
  BrightnessContrastAdjustment,
  HueSaturationAdjustment,
  LevelsAdjustment,
  LayerEffect,
  LayerEffectType,
  DropShadowEffect,
  InnerShadowEffect,
  OuterGlowEffect,
  InnerGlowEffect,
  BevelEmbossEffect,
  SatinEffect,
  StrokeEffect,
  ColorOverlayEffect,
  GradientOverlayEffect,
  PatternOverlayEffect,
  ChromaKeyEffect,
  GaussianBlurEffect,
  SharpenEffect,
  NoiseEffect,
  AdjustmentEffect,
  ContourPreset,
  Gradient,
  PatternKind,
  HappyDocumentV2,
  HappyDocumentV3,
  HappyDocumentV4,
  HappyDocumentV5,
  Layer,
  LayerType,
  LayerBase,
  RasterLayer,
  GroupLayer,
  AdjustmentLayer,
  TextLayer,
  ShapeLayer,
  GoogleFontSource,
  TextRun,
  TextAlign,
  TextMode,
  TextBounds,
  Transform,
  LayerLockFlags,
  HappyDocument,
  HappyDocumentV1,
  LayerId,
  AssetId,
  RasterAssetRef,
  RasterMaskRef,
  UnknownVersionEnvelope,
} from './schema'

export {
  MAX_CANVAS_SIDE,
  SOFT_MEGAPIXEL_LIMIT,
  computeMegapixels,
  exceedsMaxSide,
  exceedsSoftMegapixelLimit,
} from './limits'

export {
  createLayerId,
  createAssetId,
  createPathId,
  asRasterAssetRef,
  asRasterMaskRef,
  EMPTY_INITIAL_RASTER_ASSET_ID,
} from './ids'

export {
  createIdentityTransform,
  createEmptyDocument,
  createInitialLayer,
  ensureDocumentHasLayer,
  ensureDocumentHasPaintableLayer,
  createRasterLayer,
  createGroupLayer,
  createAdjustmentLayer,
  createTextLayer,
  createShapeLayer,
  DEFAULT_TEXT_FONT_FAMILY,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_COLOR,
} from './factories'
export type {
  CreateEmptyDocumentOptions,
  CreateRasterLayerOptions,
  CreateGroupLayerOptions,
  CreateAdjustmentLayerOptions,
  CreateTextLayerOptions,
  CreateShapeLayerOptions,
} from './factories'

export {
  EMPTY_PATH_STORE,
  normalizePathStore,
  resolveActivePath,
  DocumentPathStoreSchema,
  PathIdSchema,
  PathKnotSchema,
  VectorPathSchema,
} from './pathSchema'
export type {
  PathId,
  PathKnot,
  PathHandle,
  VectorPath,
  DocumentPathStore,
} from './pathSchema'

export {
  ensurePathStore,
  setWorkPath,
  setActivePathId,
  upsertSavedPath,
  deletePath,
  renamePath,
  saveWorkPath,
  nextSavedPathName,
} from './pathOperations'

export {
  checkLayerIdsMatchKeys,
  checkMinimumLayerCount,
  checkSingleParent,
  checkNoCycles,
  checkOpacityRange,
  checkCanvasLimits,
  checkEffectStack,
  validateDocumentInvariants,
} from './invariants'
export type { ValidationIssue, ValidationResult } from './invariants'

export {
  EFFECT_MULTIPLICITY,
  MAX_EFFECT_NODES_PER_LAYER,
  SOFT_EFFECT_NODES_HINT,
  maxInstancesForType,
  countEffectType,
  canAddEffectType,
  normalizeEffectStack,
} from './effectMultiplicity'
export type {
  EffectStackRepair,
  NormalizeEffectStackResult,
} from './effectMultiplicity'

export {
  CANONICAL_PAINT_ORDER,
  effectPhase,
  canonicalPaintSlot,
  canonicalInsertIndex,
  wouldCrossEffectPhase,
} from './effectStackOrder'
export type { EffectPhase, CanonicalEffectType } from './effectStackOrder'

export { parseDocument, assertValidDocument } from './validate'
export type { ParseDocumentResult } from './validate'

export {
  openDocument,
  isReadOnlyOutcome,
  migrateV1ToV2,
  migrateV2ToV3,
  migrateV4ToV5,
  migrateV5ToV6,
} from './migration'
export type { OpenDocumentOutcome } from './migration'
export {
  angleDistanceToOffset,
  migrateLegacyEffect,
  migrateLegacyEffects,
} from './effectMigration'

export {
  getLayer,
  getChildrenIds,
  getParentId,
  isSelfOrDescendant,
  flattenPaintOrder,
} from './query'

export {
  isLayerFullyLocked,
  isLayerImageLocked,
  isLayerPositionLocked,
  isLayerTransparentPixelsLocked,
} from './layerLocks'

export {
  addLayer,
  removeLayer,
  reorderLayer,
  moveLayer,
  setVisibility,
  setLocked,
  setLayerLockFlag,
  setOpacity,
  setFillOpacity,
  setBlendMode,
  setGroupIsolated,
  renameLayer,
  setTransform,
  setMask,
  setMaskEnabled,
  setMaskHidesEffects,
  groupLayers,
  ungroupLayer,
  addEffect,
  removeEffect,
  replaceEffect,
  setLayerEffects,
  toggleEffect,
  duplicateEffect,
  reorderEffect,
  setAdjustment,
  updateTextLayer,
  replaceLayer,
} from './operations'
export type {
  AddLayerOptions,
  MoveLayerOptions,
  TextLayerPropsPatch,
} from './operations'
