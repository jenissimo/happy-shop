/**
 * Resolves trackpad / mouse wheel into Figma-like viewport navigation:
 * plain scroll → pan, pinch or Mod+scroll → zoom toward cursor.
 */

/** Matches the previous ViewportHost wheel zoom curve. */
export const ZOOM_WHEEL_SENSITIVITY = 0.0015

/** Approx. CSS px per DOM_DELTA_LINE tick (mouse wheels). */
const LINE_HEIGHT_PX = 16

export type WheelNavigationInput = {
  deltaX: number
  deltaY: number
  /** WheelEvent.deltaMode: 0 = pixel, 1 = line, 2 = page. */
  deltaMode: number
  ctrlKey: boolean
  metaKey: boolean
}

export type WheelNavigationAction =
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoom'; factor: number }

function toPixelDeltas(input: WheelNavigationInput): {
  deltaX: number
  deltaY: number
} {
  const scale =
    input.deltaMode === 1
      ? LINE_HEIGHT_PX
      : input.deltaMode === 2
        ? LINE_HEIGHT_PX * 16
        : 1
  return {
    deltaX: input.deltaX * scale,
    deltaY: input.deltaY * scale,
  }
}

/**
 * Map a wheel event to pan or zoom. Pinch on Mac is synthesized as
 * `wheel` + `ctrlKey`; Cmd/Ctrl+scroll also zooms.
 */
export function resolveWheelNavigation(
  input: WheelNavigationInput,
): WheelNavigationAction {
  const { deltaX, deltaY } = toPixelDeltas(input)

  if (input.ctrlKey || input.metaKey) {
    return {
      type: 'zoom',
      factor: Math.exp(-deltaY * ZOOM_WHEEL_SENSITIVITY),
    }
  }

  // Natural scrolling: negate so the canvas moves like a page.
  // `0 - x` avoids signed-zero from unary minus on 0.
  return { type: 'pan', dx: 0 - deltaX, dy: 0 - deltaY }
}
