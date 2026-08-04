import type { RenderAdjustment } from '../contracts/RenderDocumentView'

/** Shader mode ids — must match `hsApplyAdjustment` in `GLSL_ADJUSTMENTS`. */
export const ADJUSTMENT_MODE = {
  brightnessContrast: 0,
  hueSaturation: 1,
  levels: 2,
  /** No GPU evaluator yet: the shader treats this as identity. */
  unsupported: 3,
} as const

export type AdjustmentUniforms = {
  mode: number
  params: [number, number, number]
}

/**
 * Packs an adjustment's parameters into the `(uMode, uParams)` pair every
 * adjustment shader reads. Curves has no GPU evaluator yet (see
 * `adjustmentCommands.ts`), so it packs as the identity mode rather than
 * silently rendering wrong colours.
 */
export function adjustmentUniforms(adjustment: RenderAdjustment): AdjustmentUniforms {
  switch (adjustment.type) {
    case 'brightness-contrast':
      return {
        mode: ADJUSTMENT_MODE.brightnessContrast,
        params: [adjustment.brightness, adjustment.contrast, 0],
      }
    case 'hue-saturation':
      return {
        mode: ADJUSTMENT_MODE.hueSaturation,
        params: [adjustment.hueDeg, adjustment.saturation, adjustment.lightness],
      }
    case 'levels':
      return {
        mode: ADJUSTMENT_MODE.levels,
        params: [adjustment.black, adjustment.white, adjustment.gamma],
      }
    case 'curves':
      return { mode: ADJUSTMENT_MODE.unsupported, params: [0, 0, 0] }
  }
}
