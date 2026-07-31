/**
 * Owns pan/zoom and all screen <-> document coordinate transforms for the
 * viewport (SPEC §11.1). No tool should compute scale/offset math itself —
 * everything goes through an instance of this class.
 *
 * Coordinate systems in play:
 * - screen: CSS pixels relative to the viewport host element's top-left.
 * - device: physical canvas pixels (`screen * devicePixelRatio`).
 * - document: canvas/document pixel coordinates (0,0 = document top-left),
 *   independent of camera pan/zoom.
 *
 * Layer-local and raster-pixel coordinate systems (SPEC §11.1) belong to
 * layer transforms / raster storage respectively and are out of scope here.
 */

export interface Point {
  x: number
  y: number
}

export interface CameraState {
  /** Document units per screen CSS pixel is `1 / zoom`. */
  zoom: number
  /** Screen CSS-pixel position of document (0, 0). */
  offsetX: number
  offsetY: number
}

export const CAMERA_MIN_ZOOM = 0.02
export const CAMERA_MAX_ZOOM = 64

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export class ViewportCamera {
  private zoom: number
  private offsetX: number
  private offsetY: number

  constructor(initial?: Partial<CameraState>) {
    this.zoom = clamp(initial?.zoom ?? 1, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM)
    this.offsetX = initial?.offsetX ?? 0
    this.offsetY = initial?.offsetY ?? 0
  }

  getState(): CameraState {
    return { zoom: this.zoom, offsetX: this.offsetX, offsetY: this.offsetY }
  }

  setState(state: Partial<CameraState>): void {
    if (state.zoom !== undefined) {
      this.zoom = clamp(state.zoom, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM)
    }
    if (state.offsetX !== undefined) this.offsetX = state.offsetX
    if (state.offsetY !== undefined) this.offsetY = state.offsetY
  }

  /** Document point -> screen (viewport CSS px) point. */
  documentToScreen(point: Point): Point {
    return {
      x: point.x * this.zoom + this.offsetX,
      y: point.y * this.zoom + this.offsetY,
    }
  }

  /** Screen (viewport CSS px) point -> document point. */
  screenToDocument(point: Point): Point {
    return {
      x: (point.x - this.offsetX) / this.zoom,
      y: (point.y - this.offsetY) / this.zoom,
    }
  }

  /** Screen CSS px -> device (canvas backing store) px. */
  screenToDevice(point: Point, devicePixelRatio: number): Point {
    return { x: point.x * devicePixelRatio, y: point.y * devicePixelRatio }
  }

  /** Device (canvas backing store) px -> screen CSS px. */
  deviceToScreen(point: Point, devicePixelRatio: number): Point {
    return { x: point.x / devicePixelRatio, y: point.y / devicePixelRatio }
  }

  /** Pan by a screen-space delta (CSS px). */
  panBy(dx: number, dy: number): void {
    this.offsetX += dx
    this.offsetY += dy
  }

  /** Zoom by a multiplicative factor (>1 zooms in), keeping `screenAnchor` fixed in document space. */
  zoomBy(factor: number, screenAnchor: Point): void {
    this.zoomTo(this.zoom * factor, screenAnchor)
  }

  /** Set absolute zoom, keeping `screenAnchor` fixed in document space. */
  zoomTo(nextZoom: number, screenAnchor: Point): void {
    const clamped = clamp(nextZoom, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM)
    const anchorDoc = this.screenToDocument(screenAnchor)
    this.zoom = clamped
    this.offsetX = screenAnchor.x - anchorDoc.x * this.zoom
    this.offsetY = screenAnchor.y - anchorDoc.y * this.zoom
  }

  /** Center and scale the document to fit inside a viewport of the given CSS-px size. */
  fitToViewport(
    docWidth: number,
    docHeight: number,
    viewportWidth: number,
    viewportHeight: number,
    padding = 0,
  ): void {
    const availW = Math.max(1, viewportWidth - padding * 2)
    const availH = Math.max(1, viewportHeight - padding * 2)
    const fitZoom = Math.min(availW / docWidth, availH / docHeight)
    this.zoom = clamp(fitZoom, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM)
    this.offsetX = (viewportWidth - docWidth * this.zoom) / 2
    this.offsetY = (viewportHeight - docHeight * this.zoom) / 2
  }

  reset(): void {
    this.zoom = 1
    this.offsetX = 0
    this.offsetY = 0
  }
}
