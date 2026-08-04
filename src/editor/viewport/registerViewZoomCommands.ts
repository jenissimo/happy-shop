import type { CommandRegistry } from '../../core/commands/registry'
import { getViewportCameraHandle } from './viewportCameraAccess'
import {
  fitViewport,
  resolveZoomAnchor,
  zoomViewportBy,
  zoomViewportTo,
  ZOOM_STEP,
} from './zoomActions'

/**
 * Overwrites View zoom stubs so Mod+=/−/0/1 drive the live camera through the
 * same `zoomActions` primitives the Zoom tool and the wheel use — including
 * cursor anchoring.
 */
export function registerViewZoomCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'view.zoomIn',
    title: 'Zoom In',
    shortcut: 'Mod+=',
    enabled: () => getViewportCameraHandle() != null,
    run: () => {
      zoomViewportBy(ZOOM_STEP)
    },
  })

  registry.register({
    id: 'view.zoomOut',
    title: 'Zoom Out',
    shortcut: 'Mod+-',
    enabled: () => getViewportCameraHandle() != null,
    run: () => {
      zoomViewportBy(1 / ZOOM_STEP)
    },
  })

  registry.register({
    id: 'view.fit',
    title: 'Fit on Screen',
    shortcut: 'Mod+0',
    enabled: () => getViewportCameraHandle() != null,
    run: () => {
      fitViewport(32)
    },
  })

  registry.register({
    id: 'view.actualPixels',
    title: 'Actual Pixels',
    shortcut: 'Mod+1',
    enabled: () => getViewportCameraHandle() != null,
    run: () => {
      zoomViewportTo(1, resolveZoomAnchor())
    },
  })
}
