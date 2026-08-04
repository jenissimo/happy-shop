import { getViewportCameraHandle } from './viewportCameraAccess'

/** Photoshop-ish zoom step for the Zoom tool, View menu and Mod+± shortcuts. */
export const ZOOM_STEP = 1.25

/**
 * Last pointer position over the viewport, in viewport CSS px. Kept here (not
 * in the camera) so every zoom entry point — Zoom tool click, View menu,
 * Mod+`+`/`-` — anchors identically: on the cursor when it is over the canvas,
 * on the viewport centre otherwise.
 */
let pointerAnchor: { x: number; y: number } | null = null

export function setViewportPointerAnchor(
  point: { x: number; y: number } | null,
): void {
  pointerAnchor = point
}

function viewportCenter(): { x: number; y: number } {
  const h = getViewportCameraHandle()
  if (!h) return { x: 0, y: 0 }
  const { width, height } = h.getViewportSize()
  return { x: width / 2, y: height / 2 }
}

/** Cursor when it is over the viewport, otherwise the viewport centre. */
export function resolveZoomAnchor(): { x: number; y: number } {
  const h = getViewportCameraHandle()
  if (!h) return { x: 0, y: 0 }
  const { width, height } = h.getViewportSize()
  const p = pointerAnchor
  if (p && p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height) {
    return { x: p.x, y: p.y }
  }
  return viewportCenter()
}

/**
 * The single zoom primitive. `anchor` defaults to `resolveZoomAnchor()`, which
 * is what makes keyboard zoom behave like the Zoom tool instead of always
 * pulling the view back to the centre.
 */
export function zoomViewportBy(
  factor: number,
  anchor?: { x: number; y: number },
): boolean {
  const h = getViewportCameraHandle()
  if (!h) return false
  h.camera.zoomBy(factor, anchor ?? resolveZoomAnchor())
  h.notifyChanged?.()
  return true
}

export function zoomViewportTo(
  zoom: number,
  anchor?: { x: number; y: number },
): boolean {
  const h = getViewportCameraHandle()
  if (!h) return false
  h.camera.zoomTo(zoom, anchor ?? resolveZoomAnchor())
  h.notifyChanged?.()
  return true
}

export function fitViewport(padding = 32): boolean {
  const h = getViewportCameraHandle()
  if (!h) return false
  const doc = h.getDocSize()
  const vp = h.getViewportSize()
  h.camera.fitToViewport(doc.width, doc.height, vp.width, vp.height, padding)
  h.notifyChanged?.()
  return true
}

/** True when the event is a browser-zoom keystroke the viewport owns. */
export function isViewportZoomShortcut(e: KeyboardEvent): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false
  return (
    e.key === '+' ||
    e.key === '=' ||
    e.key === '-' ||
    e.key === '_' ||
    e.key === '0' ||
    e.code === 'Equal' ||
    e.code === 'Minus' ||
    e.code === 'NumpadAdd' ||
    e.code === 'NumpadSubtract' ||
    e.code === 'Digit0' ||
    e.code === 'Numpad0'
  )
}
