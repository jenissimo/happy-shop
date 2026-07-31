import { describe, expect, test } from 'bun:test'
import { CommandRegistry } from '../../core/commands/registry'
import { ViewportCamera } from './ViewportCamera'
import { bindViewportCamera } from './viewportCameraAccess'
import { registerViewZoomCommands } from './registerViewZoomCommands'

describe('registerViewZoomCommands', () => {
  test('zoomIn / actualPixels / fit drive the bound camera', () => {
    const camera = new ViewportCamera({ zoom: 1, offsetX: 0, offsetY: 0 })
    const unbind = bindViewportCamera({
      camera,
      getViewportSize: () => ({ width: 400, height: 300 }),
      getDocSize: () => ({ width: 200, height: 100 }),
    })

    const reg = new CommandRegistry()
    registerViewZoomCommands(reg)

    expect(reg.run('view.zoomIn')).toBe(true)
    expect(camera.getState().zoom).toBeGreaterThan(1)

    expect(reg.run('view.actualPixels')).toBe(true)
    expect(camera.getState().zoom).toBe(1)

    expect(reg.run('view.fit')).toBe(true)
    // avail 336×236 vs doc 200×100 → zoom = 336/200 = 1.68
    expect(camera.getState().zoom).toBeCloseTo(1.68, 5)

    unbind()
  })
})
