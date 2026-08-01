/** Quote a CSS font-family name when it contains spaces or special characters. */
export function cssQuoteFontFamily(family: string): string {
  const trimmed = family.trim()
  if (!trimmed) return trimmed
  // Already a stack or quoted list — leave intact (e.g. `Inter, sans-serif`).
  if (trimmed.includes(',') || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed
  }
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed
  return `"${trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
