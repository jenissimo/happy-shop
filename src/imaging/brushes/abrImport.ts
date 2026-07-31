import type { BrushTipDescriptor } from './tipDescriptor'
import type { TipAlpha } from './tipRegistry'

type AbrShape = {
  type: 'computed' | 'sampled' | 'dynamic' | 'tips'
  size: number
  angle: number
  roundness?: number
  hardness?: number
  spacing: number
  sampledData?: string
}

export type AbrDocument = {
  brushes: Array<{ name: string; shape: AbrShape; spacing?: number }>
  samples: Array<{
    id: string
    bounds: { w: number; h: number }
    alpha: Uint8Array
  }>
}

export type ImportedUserTip = {
  descriptor: BrushTipDescriptor
  alpha?: TipAlpha
}

const USER_LICENSE = {
  spdx: 'User-supplied',
  pack: 'Imported by this user',
  source: 'https://local.invalid/happy-shop/user-brush-import',
}

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : fallback
}

function userTipId(index: number): string {
  return `user.${crypto.randomUUID().replaceAll('-', '')}-${index + 1}`
}

/**
 * Reduce ABR presets to Happy Shop's deliberately small tip model. Unsupported
 * Photoshop dynamics are omitted; sampled brush alpha is preserved separately.
 */
export function convertAbrToUserTips(
  abr: AbrDocument,
  createId: (index: number) => string = userTipId,
): ImportedUserTip[] {
  const samples = new Map(abr.samples.map((sample) => [sample.id, sample]))

  return abr.brushes.flatMap((brush, index) => {
    const shape = brush.shape
    const sample = shape.type === 'sampled' ? samples.get(shape.sampledData ?? '') : undefined
    const hasUsableSample =
      sample &&
      sample.bounds.w > 0 &&
      sample.bounds.h > 0 &&
      sample.alpha.byteLength === sample.bounds.w * sample.bounds.h
    const id = createId(index)
    const descriptor: BrushTipDescriptor = {
      id,
      name: brush.name.trim() || `Imported brush ${index + 1}`,
      pack: 'user',
      kind: hasUsableSample ? 'stamp' : 'procedural',
      shape: 'round',
      hardness: clamp(shape.hardness, 0, 1, 0.85),
      roundness: clamp(shape.roundness, 0.05, 1, 1),
      angle: Number.isFinite(shape.angle) ? shape.angle : 0,
      spacing: clamp(brush.spacing ?? shape.spacing, 0.02, 2, 0.25),
      defaults: {
        ...(Number.isFinite(shape.size) && shape.size > 0
          ? { size: Math.min(500, shape.size) }
          : {}),
      },
      license: USER_LICENSE,
      ...(hasUsableSample
        ? {
            texture: {
              src: `indexeddb://happy-shop-user-brushes/${id}`,
              width: sample.bounds.w,
              height: sample.bounds.h,
            },
          }
        : {}),
    }

    return [{
      descriptor,
      ...(hasUsableSample
        ? {
            alpha: {
              data: new Uint8ClampedArray(sample.alpha),
              width: sample.bounds.w,
              height: sample.bounds.h,
            },
          }
        : {}),
    }]
  })
}
