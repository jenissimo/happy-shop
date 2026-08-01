import { z } from 'zod'
import { finiteNumber } from './schemaPrimitives'

export const BrightnessContrastAdjustmentSchema = z.object({
  type: z.literal('brightness-contrast'),
  brightness: finiteNumber,
  contrast: finiteNumber,
})
export type BrightnessContrastAdjustment = z.infer<
  typeof BrightnessContrastAdjustmentSchema
>

export const HueSaturationAdjustmentSchema = z.object({
  type: z.literal('hue-saturation'),
  hueDeg: finiteNumber,
  saturation: finiteNumber,
  lightness: finiteNumber,
})
export type HueSaturationAdjustment = z.infer<
  typeof HueSaturationAdjustmentSchema
>

export const LevelsAdjustmentSchema = z.object({
  type: z.literal('levels'),
  black: finiteNumber,
  white: finiteNumber,
  gamma: finiteNumber,
})
export type LevelsAdjustment = z.infer<typeof LevelsAdjustmentSchema>

export const CurvePointSchema = z.object({
  x: finiteNumber.min(0).max(255),
  y: finiteNumber.min(0).max(255),
})
export type CurvePoint = z.infer<typeof CurvePointSchema>

export const CurvesAdjustmentSchema = z.object({
  type: z.literal('curves'),
  master: z.array(CurvePointSchema),
  red: z.array(CurvePointSchema).optional(),
  green: z.array(CurvePointSchema).optional(),
  blue: z.array(CurvePointSchema).optional(),
})
export type CurvesAdjustment = z.infer<typeof CurvesAdjustmentSchema>

export const AdjustmentSchema = z.discriminatedUnion('type', [
  BrightnessContrastAdjustmentSchema,
  HueSaturationAdjustmentSchema,
  LevelsAdjustmentSchema,
  CurvesAdjustmentSchema,
])
export type Adjustment = z.infer<typeof AdjustmentSchema>
export type AdjustmentType = Adjustment['type']
