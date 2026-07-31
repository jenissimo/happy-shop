import type { GoogleFontAxis, GoogleFontCatalogEntry, GoogleFontFile } from './catalogTypes'

/** UI-facing axis labels per OpenType tag. */
export const AXIS_LABELS: Record<string, string> = {
  wght: 'Weight',
  wdth: 'Width',
  opsz: 'Optical size',
  ital: 'Italic',
  slnt: 'Slant',
}

/** Sliders exposed in the font picker / Character panel (P1). */
export const UI_AXIS_TAGS = ['wght', 'wdth', 'opsz'] as const

export type UiAxisTag = (typeof UI_AXIS_TAGS)[number]

export type ResolvedAxisValues = Record<string, number>

function roundAxis(value: number): number {
  return Math.round(value * 100) / 100
}

export function defaultAxisValues(axes: readonly GoogleFontAxis[]): ResolvedAxisValues {
  const values: ResolvedAxisValues = {}
  for (const axis of axes) values[axis.tag] = axis.default
  return values
}

export function normalizeAxisValues(
  axes: readonly GoogleFontAxis[],
  partial: ResolvedAxisValues,
): ResolvedAxisValues {
  const values = defaultAxisValues(axes)
  for (const axis of axes) {
    const raw = partial[axis.tag]
    if (raw === undefined) continue
    values[axis.tag] = roundAxis(Math.min(axis.max, Math.max(axis.min, raw)))
  }
  return values
}

export function uiAxes(entry: Pick<GoogleFontCatalogEntry, 'variable' | 'axes'>): GoogleFontAxis[] {
  if (!entry.variable) return []
  const allowed = new Set<string>(UI_AXIS_TAGS)
  return entry.axes.filter((axis) => allowed.has(axis.tag))
}

export function nominalWeightFromAxes(values: ResolvedAxisValues, fallback = 400): number {
  const weight = values.wght
  if (weight === undefined) return fallback
  return Math.round(Math.min(900, Math.max(100, weight)))
}

export function variationSettingsString(values: ResolvedAxisValues): string {
  return Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, value]) => `'${tag}' ${value}`)
    .join(', ')
}

/** Stable cache / fontSource key for a pinned variable instance. */
export async function hashVariationPin(values: ResolvedAxisValues): Promise<string> {
  const payload = Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, value]) => `${tag}:${value}`)
    .join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return [...new Uint8Array(digest)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Synchronous pin hash for tests and keyOf fallbacks when Web Crypto is unavailable. */
export function hashVariationPinSync(values: ResolvedAxisValues): string {
  const payload = Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, value]) => `${tag}:${value}`)
    .join('|')
  let hash = 2166136261
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export async function variationPin(values: ResolvedAxisValues): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) return hashVariationPin(values)
  return hashVariationPinSync(values)
}

function axisValuesMatchDefaults(values: ResolvedAxisValues, axes: readonly GoogleFontAxis[]): boolean {
  for (const axis of axes) {
    if (roundAxis(values[axis.tag] ?? axis.default) !== roundAxis(axis.default)) return false
  }
  return true
}

/**
 * When axis values sit at catalog defaults and weight matches a shipped static
 * instance, commit the static WOFF2 (bake-safe, smaller download).
 */
export function findMatchingStaticFile(
  entry: GoogleFontCatalogEntry,
  style: 'normal' | 'italic',
  values: ResolvedAxisValues,
): GoogleFontFile | undefined {
  if (!axisValuesMatchDefaults(values, entry.axes)) return undefined
  const weight = nominalWeightFromAxes(values)
  return entry.files.find((file) => file.weight === weight && file.style === style)
}

export function needsVariablePin(
  entry: GoogleFontCatalogEntry,
  style: 'normal' | 'italic',
  values: ResolvedAxisValues,
): boolean {
  if (!entry.variable || !entry.variableFile) return false
  return findMatchingStaticFile(entry, style, values) === undefined
}

export function resolveStyleFromAxes(
  entry: GoogleFontCatalogEntry,
  values: ResolvedAxisValues,
  requested: 'normal' | 'italic',
): 'normal' | 'italic' {
  if (requested === 'italic') return 'italic'
  const ital = values.ital
  if (ital !== undefined && ital >= 0.5) return 'italic'
  const slnt = values.slnt
  if (slnt !== undefined && slnt !== 0) return 'italic'
  const hasItalicStatic = entry.files.some((file) => file.style === 'italic')
  return hasItalicStatic ? requested : 'normal'
}
