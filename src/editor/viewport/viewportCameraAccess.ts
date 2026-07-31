import type { ViewportCamera } from './ViewportCamera'

/**
 * Live handle to the active ViewportHost camera so View menu / shortcuts can
 * drive zoom without React prop drilling. Bound on ViewportHost mount.
 */
export type ViewportCameraHandle = {
  camera: ViewportCamera
  getViewportSize: () => { width: number; height: number }
  getDocSize: () => { width: number; height: number }
}

let handle: ViewportCameraHandle | null = null

export function bindViewportCamera(next: ViewportCameraHandle): () => void {
  handle = next
  return () => {
    if (handle === next) handle = null
  }
}

export function getViewportCameraHandle(): ViewportCameraHandle | null {
  return handle
}
