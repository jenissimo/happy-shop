/** Camera state a `RenderBackend` needs to place the document under the viewport. */
export interface CameraFrame {
  /** Document units per screen CSS pixel is `1 / zoom`. */
  zoom: number
  /** Screen CSS-pixel position (relative to the viewport element) of document (0, 0). */
  offsetX: number
  offsetY: number
}

/**
 * Per-frame render request. `viewportWidth`/`viewportHeight` are CSS pixels of
 * the host element; the backend is responsible for reconciling those with
 * `devicePixelRatio` against the actual canvas backing store.
 */
export interface ViewportFrame {
  camera: CameraFrame
  viewportWidth: number
  viewportHeight: number
  devicePixelRatio: number
}
