/**
 * Shared Zod primitives used by document + layer-effect schemas.
 * Kept separate to avoid circular imports between schema.ts and layerEffectsSchema.ts.
 */
import { z } from 'zod'

const finiteNumber = z.number().finite()

export const BLEND_MODES = [
  'normal',
  'dissolve',
  'pass-through',
  'darken',
  'multiply',
  'color-burn',
  'linear-burn',
  'darker-color',
  'lighten',
  'screen',
  'color-dodge',
  'linear-dodge',
  'lighter-color',
  'overlay',
  'soft-light',
  'hard-light',
  'vivid-light',
  'linear-light',
  'pin-light',
  'hard-mix',
  'difference',
  'exclusion',
  'subtract',
  'divide',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const

export const BlendModeSchema = z.enum(BLEND_MODES)
export type BlendMode = z.infer<typeof BlendModeSchema>

/** CSS hex/alpha color string, e.g. `#RRGGBB` or `#RRGGBBAA` (SPEC §17). */
export const CssColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, 'expected #rrggbb or #rrggbbaa')
export type CssColor = z.infer<typeof CssColorSchema>

export const unitInterval = finiteNumber.min(0).max(1)
export { finiteNumber }
