import type { CommandRegistry } from '../../core/commands/registry'
import { getViewportCameraHandle } from './viewportCameraAccess'

const ZOOM_STEP = 1.25

function viewportCenter(): { x: number; y: number } {
  const h = getViewportCameraHandle()
  if (!h) return { x: 0, y: 0 }
  const { width, height } = h.getViewportSize()
  return { x: width / 2, y: height / 2 }
}

/** Overwrites View zoom stubs so Mod+=/−/0/1 drive the live camera. */
export function registerViewZoomCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'view.zoomIn',
    title: 'Zoom In',
    shortcut: 'Mod+=',
    enabled: () => getViewportCameraHandle() != null,
    run: () => {
      const h = getViewportCameraHandle()
      if (!h) return
      h.camera.zoomBy(ZOOM_STEP, viewportCenter())
    },
  })

  registry.register({
    id: 'view.zoomOut',
    title: 'Zoom Out',
    shortcut: 'Mod+-',
    enabled: () => getViewportCameraHandle() != null,
    run: () => {
      const h = getViewportCameraHandle()
      if (!h) return
      h.camera.zoomBy(1 / ZOOM_STEP, viewportCenter())
    },
  })

  registry.register({
    id: 'view.fit',
    title: 'Fit on Screen',
    shortcut: 'Mod+0',
    enabled: () => getViewportCameraHandle() != null,
    run: () => {
      const h = getViewportCameraHandle()
      if (!h) return
      const doc = h.getDocSize()
      const vp = h.getViewportSize()
      h.camera.fitToViewport(doc.width, doc.height, vp.width, vp.height, 32)
    },
  })

  registry.register({
    id: 'view.actualPixels',
    title: 'Actual Pixels',
    shortcut: 'Mod+1',
    enabled: () => getViewportCameraHandle() != null,
    run: () => {
      const h = getViewportCameraHandle()
      if (!h) return
      h.camera.zoomTo(1, viewportCenter())
    },
  })
}
