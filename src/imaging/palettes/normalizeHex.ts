/** Normalize user or catalog hex to uppercase `#RRGGBB`. */
export function normalizeHexColor(value: string): string {
  const trimmed = value.trim()
  const match = /^#?([0-9a-fA-F]{6})$/.exec(trimmed)
  if (!match) throw new Error(`Invalid hex color: ${value}`)
  return `#${match[1]!.toUpperCase()}`
}

/** Lowercase form for CSS / color store (matches existing `#rrggbb` convention). */
export function hexToCssColor(normalized: string): string {
  return normalized.toLowerCase()
}
