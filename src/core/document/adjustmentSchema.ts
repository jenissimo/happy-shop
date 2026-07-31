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

export const AdjustmentSchema = z.discriminatedUnion('type', [
  BrightnessContrastAdjustmentSchema,
  HueSaturationAdjustmentSchema,
  LevelsAdjustmentSchema,
])
export type Adjustment = z.infer<typeof AdjustmentSchema>
export type AdjustmentType = Adjustment['type']
