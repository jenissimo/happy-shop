/**
 * Migrate v1/v2 LayerEffect shapes → v3 Photoshop-faithful params.
 */
import { BLEND_MODES, type BlendMode } from './schemaPrimitives'
import {
  CONTOUR_PRESETS,
  DEFAULT_GRADIENT,
  type ContourPreset,
  type LayerEffect,
} from './layerEffectsSchema'

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0))
}

function asBlend(value: unknown, fallback: BlendMode): BlendMode {
  return typeof value === 'string' && (BLEND_MODES as readonly string[]).includes(value)
    ? (value as BlendMode)
    : fallback
}

function asContour(value: unknown): ContourPreset {
  return typeof value === 'string' &&
    (CONTOUR_PRESETS as readonly string[]).includes(value)
    ? (value as ContourPreset)
    : 'linear'
}

function offsetToAngleDistance(
  offsetX: number,
  offsetY: number,
): { angle: number; distance: number } {
  const distance = Math.hypot(offsetX, offsetY)
  // PS: 0° = right, angles increase CCW; screen Y grows down so negate Y.
  const angle =
    distance === 0 ? 120 : (Math.atan2(-offsetY, offsetX) * 180) / Math.PI
  return { angle, distance }
}

export function migrateLegacyEffect(raw: unknown): LayerEffect | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  const type = e.type
  const id = typeof e.id === 'string' ? e.id : null
  const enabled = Boolean(e.enabled)
  if (!id) return null

  if (type === 'drop-shadow') {
    const offsetX = Number(e.offsetX ?? 0)
    const offsetY = Number(e.offsetY ?? 0)
    const { angle, distance } =
      e.angle != null && e.distance != null
        ? { angle: Number(e.angle), distance: Number(e.distance) }
        : offsetToAngleDistance(offsetX, offsetY)
    return {
      id,
      type: 'drop-shadow',
      enabled,
      blendMode: asBlend(e.blendMode, 'multiply'),
      color: typeof e.color === 'string' ? e.color : '#000000',
      opacity: clamp01(Number(e.opacity ?? 0.75)),
      angle,
      useGlobalLight: e.useGlobalLight !== false,
      distance: Math.max(0, distance),
      spread: clampPct(Number(e.spread ?? 0)),
      size: Math.max(0, Number(e.size ?? e.blur ?? 0)),
      contour: asContour(e.contour),
      noise: clamp01(Number(e.noise ?? 0)),
      layerKnocksOutDropShadow: e.layerKnocksOutDropShadow !== false,
    }
  }

  if (type === 'stroke') {
    return {
      id,
      type: 'stroke',
      enabled,
      blendMode: asBlend(e.blendMode, 'normal'),
      opacity: clamp01(Number(e.opacity ?? 1)),
      overprint: Boolean(e.overprint),
      size: Math.max(0, Number(e.size ?? 0)),
      position:
        e.position === 'inside' || e.position === 'center' || e.position === 'outside'
          ? e.position
          : 'outside',
      fillType:
        e.fillType === 'gradient' || e.fillType === 'pattern' ? e.fillType : 'color',
      color: typeof e.color === 'string' ? e.color : '#000000',
      gradient:
        e.gradient && typeof e.gradient === 'object'
          ? (e.gradient as typeof DEFAULT_GRADIENT)
          : undefined,
      pattern:
        e.pattern === 'checker' ||
        e.pattern === 'stripes' ||
        e.pattern === 'dots' ||
        e.pattern === 'noise'
          ? e.pattern
          : undefined,
    }
  }

  if (type === 'color-overlay') {
    return {
      id,
      type: 'color-overlay',
      enabled,
      blendMode: asBlend(e.blendMode, 'normal'),
      color: typeof e.color === 'string' ? e.color : '#ff0000',
      opacity: clamp01(Number(e.opacity ?? 1)),
    }
  }

  if (type === 'chroma-key') {
    return {
      id,
      type: 'chroma-key',
      enabled,
      keyColor: typeof e.keyColor === 'string' ? e.keyColor : '#00FF00',
      mode: e.mode === 'flood' ? 'flood' : 'global',
      floodOrigins: Array.isArray(e.floodOrigins)
        ? (e.floodOrigins as { x: number; y: number }[])
        : [],
      tolerance: clampPct(Number(e.tolerance ?? 30)),
      softness: clampPct(Number(e.softness ?? 30)),
      despill: clamp01(Number(e.despill ?? 0.7)),
      choke: Math.max(0, Math.min(5, Math.round(Number(e.choke ?? 0)))),
      edgeBlur: Math.max(0, Math.min(10, Number(e.edgeBlur ?? 0))),
    }
  }

  // Already-v3 effect types: trust Zod later; pass through if well-formed enough.
  if (
    type === 'inner-shadow' ||
    type === 'inner-glow' ||
    type === 'outer-glow' ||
    type === 'bevel-emboss' ||
    type === 'satin' ||
    type === 'gradient-overlay' ||
    type === 'pattern-overlay' ||
    type === 'gaussian-blur' ||
    type === 'sharpen' ||
    type === 'noise' ||
    type === 'adjustment'
  ) {
    return e as unknown as LayerEffect
  }

  return null
}

export function migrateLegacyEffects(effects: unknown[]): LayerEffect[] {
  const out: LayerEffect[] = []
  for (const raw of effects) {
    const migrated = migrateLegacyEffect(raw)
    if (migrated) out.push(migrated)
  }
  return out
}

/** Convert PS angle (°)+distance → document-space offset (Y-down). */
export function angleDistanceToOffset(
  angleDeg: number,
  distance: number,
): { offsetX: number; offsetY: number } {
  const rad = (angleDeg * Math.PI) / 180
  return {
    offsetX: Math.cos(rad) * distance,
    offsetY: -Math.sin(rad) * distance,
  }
}
