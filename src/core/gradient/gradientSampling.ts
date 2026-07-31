import type { GradientStop } from '../document/layerEffectsSchema'

export type SampledGradient = {
  r: number
  g: number
  b: number
  opacity: number
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function ordered(stops: readonly GradientStop[]): GradientStop[] {
  return [...stops].sort((a, b) => a.offset - b.offset)
}

function parseHex(color: string): [number, number, number] {
  const hex = color.replace('#', '')
  const full = hex.length === 3
    ? hex.split('').map((channel) => channel + channel).join('')
    : hex.padEnd(6, '0').slice(0, 6)
  return [
    Number.parseInt(full.slice(0, 2), 16) || 0,
    Number.parseInt(full.slice(2, 4), 16) || 0,
    Number.parseInt(full.slice(4, 6), 16) || 0,
  ]
}

function toHex(value: number): string {
  return Math.round(clamp01(value / 255) * 255).toString(16).padStart(2, '0')
}

/**
 * CPU equivalent of GradientOverlayFilter's N-stop GLSL sampler.
 * Stops are sorted at the boundary so Layer Style and destructive tools share
 * identical clamping and interpolation semantics.
 */
export function sampleGradientStops(
  stops: readonly GradientStop[],
  offset: number,
): SampledGradient {
  const sorted = ordered(stops)
  const fallback: GradientStop = { offset: 0, color: '#000000', opacity: 1 }
  const first = sorted[0] ?? fallback
  const last = sorted.at(-1) ?? fallback
  const t = clamp01(offset)
  const before = [...sorted].reverse().find((stop) => stop.offset <= t) ?? first
  const after = sorted.find((stop) => stop.offset >= t) ?? last
  const span = Math.max(after.offset - before.offset, 1e-6)
  const localT = clamp01((t - before.offset) / span)
  const from = parseHex(before.color)
  const to = parseHex(after.color)

  return {
    r: from[0] * (1 - localT) + to[0] * localT,
    g: from[1] * (1 - localT) + to[1] * localT,
    b: from[2] * (1 - localT) + to[2] * localT,
    opacity: clamp01(before.opacity * (1 - localT) + after.opacity * localT),
  }
}

/** Color and opacity for a newly inserted ramp stop. */
export function interpolateGradientStop(
  stops: readonly GradientStop[],
  offset: number,
): GradientStop {
  const sample = sampleGradientStops(stops, offset)
  return {
    offset: clamp01(offset),
    color: `#${toHex(sample.r)}${toHex(sample.g)}${toHex(sample.b)}`,
    opacity: sample.opacity,
  }
}
