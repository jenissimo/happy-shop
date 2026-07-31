/** Browser custom-cursor bitmap limit; above this we force an overlay ring. */
export const MAX_CSS_CURSOR_DIAMETER_PX = 128

export type BrushTipCursorMode = 'brush' | 'eraser'

export type BrushTipRing = {
  /** Outer tip diameter in CSS px (screen space). */
  diameterPx: number
  /** Optional hardness ghost diameter; null when hard tip. */
  hardnessGhostPx: number | null
  mode: BrushTipCursorMode
}

/**
 * Screen-space tip diameter = document tip size × camera zoom.
 * Always at least 1 px so a 1px brush remains visible.
 */
export function tipDiameterScreenPx(sizeDocPx: number, zoom: number): number {
  const d = Math.max(1, sizeDocPx) * Math.max(zoom, 0.02)
  return Math.max(1, d)
}

export function buildBrushTipRing(
  sizeDocPx: number,
  zoom: number,
  hardness: number,
  mode: BrushTipCursorMode,
): BrushTipRing {
  const diameterPx = tipDiameterScreenPx(sizeDocPx, zoom)
  const hard = hardness >= 0.98
  const hardnessGhostPx = hard
    ? null
    : Math.max(1, diameterPx * Math.max(0, Math.min(1, hardness)))
  return { diameterPx, hardnessGhostPx, mode }
}

/**
 * Encode a dual-stroke tip circle as a data-URL SVG cursor.
 * Returns null when diameter exceeds browser cursor limits (use overlay).
 */
export function brushTipCursorCss(
  ring: BrushTipRing,
): { css: string; useOverlay: boolean } {
  const useOverlay = ring.diameterPx > MAX_CSS_CURSOR_DIAMETER_PX
  if (useOverlay) {
    return { css: 'none', useOverlay: true }
  }

  // Pad so stroke isn't clipped; hotspot at center.
  const pad = 2
  const size = Math.ceil(ring.diameterPx + pad * 2)
  const c = size / 2
  const r = ring.diameterPx / 2
  const dash =
    ring.mode === 'eraser' ? ` stroke-dasharray="${Math.max(2, r * 0.35)} ${Math.max(2, r * 0.25)}"` : ''
  const ghost =
    ring.hardnessGhostPx != null
      ? `<circle cx="${c}" cy="${c}" r="${ring.hardnessGhostPx / 2}" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.55"/>` +
        `<circle cx="${c}" cy="${c}" r="${ring.hardnessGhostPx / 2}" fill="none" stroke="#111" stroke-width="0.75" opacity="0.7"/>`
      : ''

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#fff" stroke-width="1.75"${dash}/>` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#111" stroke-width="0.9"${dash}/>` +
    ghost +
    `</svg>`

  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`
  const hs = Math.round(c)
  return {
    css: `url("${url}") ${hs} ${hs}, crosshair`,
    useOverlay: false,
  }
}
