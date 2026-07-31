/**
 * Build high-contrast CSS cursor values from Phosphor SVG assets
 * (`@phosphor-icons/core`, same family as the tools strip).
 */

const CURSOR_SIZE = 24
const VIEW = 256

export type PhosphorHotspot = {
  /** Hotspot in CSS px within the 24×24 cursor bitmap. */
  x: number
  y: number
  fallback: string
}

/** Extract the primary path `d` from a Phosphor SVG string. */
export function phosphorPathD(svgRaw: string): string {
  const m = svgRaw.match(/<path[^>]*\sd="([^"]+)"/)
  if (!m?.[1]) {
    throw new Error('phosphorCursor: no path d in SVG')
  }
  return m[1]
}

/**
 * Dual-tone cursor: white fat stroke under black fill so the glyph
 * stays readable on light and dark document pixels.
 */
export function phosphorCursorDataUrl(pathD: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CURSOR_SIZE}" height="${CURSOR_SIZE}" viewBox="0 0 ${VIEW} ${VIEW}" fill="none">` +
    `<path d="${pathD}" fill="none" stroke="#fff" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="${pathD}" fill="#111"/>` +
    `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function cssCursorFromPhosphor(
  svgRaw: string,
  hotspot: PhosphorHotspot,
): string {
  const url = phosphorCursorDataUrl(phosphorPathD(svgRaw))
  return `url("${url}") ${hotspot.x} ${hotspot.y}, ${hotspot.fallback}`
}
