import { hexToCssColor, normalizeHexColor } from './normalizeHex'

type Rgb = { r: number; g: number; b: number }

function parseHexRgb(hex: string): Rgb | null {
  try {
    const normalized = normalizeHexColor(hex)
    const n = normalized.slice(1)
    return {
      r: parseInt(n.slice(0, 2), 16),
      g: parseInt(n.slice(2, 4), 16),
      b: parseInt(n.slice(4, 6), 16),
    }
  } catch {
    return null
  }
}

function colorDistanceSq(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return dr * dr + dg * dg + db * db
}

/** Map an arbitrary hex color to the nearest swatch in `palette` (ΔRGB). */
export function nearestPaletteColor(color: string, palette: readonly string[]): string {
  if (palette.length === 0) return color
  const input = parseHexRgb(color)
  if (!input) return color

  let best = palette[0]!
  let bestDist = Infinity
  for (const swatch of palette) {
    const rgb = parseHexRgb(swatch)
    if (!rgb) continue
    const dist = colorDistanceSq(input, rgb)
    if (dist < bestDist) {
      bestDist = dist
      best = swatch
    }
  }
  return hexToCssColor(best)
}
