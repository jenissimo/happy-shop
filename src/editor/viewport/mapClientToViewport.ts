import type { Point } from './ViewportCamera'

/**
 * PointerEvent client coords → viewport screen CSS px (camera space).
 *
 * Normalizes by the element's painted box so CSS stretch (Pixi `autoDensity`
 * inline size vs `width:100%` host fill, DPR backing-store mismatch, or
 * options-bar/tools-strip layout shifts) cannot skew the hit point.
 * `viewportWidth`/`viewportHeight` must be the same logical size passed to
 * `PixiRenderBackend.render` / `ViewportCamera.fitToViewport`.
 */
export function mapClientToViewport(
  clientX: number,
  clientY: number,
  element: HTMLElement,
  viewportWidth: number,
  viewportHeight: number,
): Point {
  const rect = element.getBoundingClientRect()
  const rw = rect.width > 1e-6 ? rect.width : 1
  const rh = rect.height > 1e-6 ? rect.height : 1
  const vw = viewportWidth > 0 ? viewportWidth : rw
  const vh = viewportHeight > 0 ? viewportHeight : rh
  return {
    x: ((clientX - rect.left) / rw) * vw,
    y: ((clientY - rect.top) / rh) * vh,
  }
}
