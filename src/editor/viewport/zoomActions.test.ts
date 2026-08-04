import { describe, expect, test } from 'bun:test'
import { ViewportCamera } from './ViewportCamera'
import { bindViewportCamera } from './viewportCameraAccess'
import {
  isViewportZoomShortcut,
  resolveZoomAnchor,
  setViewportPointerAnchor,
  zoomViewportBy,
  ZOOM_STEP,
} from './zoomActions'

function bind(camera: ViewportCamera, onChanged?: () => void) {
  return bindViewportCamera({
    camera,
    getViewportSize: () => ({ width: 400, height: 300 }),
    getDocSize: () => ({ width: 200, height: 100 }),
    notifyChanged: onChanged,
  })
}

describe('zoom anchor', () => {
  test('falls back to the viewport centre with no pointer', () => {
    const unbind = bind(new ViewportCamera({ zoom: 1, offsetX: 0, offsetY: 0 }))
    setViewportPointerAnchor(null)
    expect(resolveZoomAnchor()).toEqual({ x: 200, y: 150 })
    unbind()
  })

  test('uses the cursor while it is over the viewport', () => {
    const unbind = bind(new ViewportCamera({ zoom: 1, offsetX: 0, offsetY: 0 }))
    setViewportPointerAnchor({ x: 40, y: 20 })
    expect(resolveZoomAnchor()).toEqual({ x: 40, y: 20 })
    unbind()
  })

  test('ignores a stale cursor outside the viewport', () => {
    const unbind = bind(new ViewportCamera({ zoom: 1, offsetX: 0, offsetY: 0 }))
    setViewportPointerAnchor({ x: 900, y: 20 })
    expect(resolveZoomAnchor()).toEqual({ x: 200, y: 150 })
    unbind()
  })
})

describe('zoomViewportBy', () => {
  test('keeps the cursor pinned to the same document point', () => {
    const camera = new ViewportCamera({ zoom: 1, offsetX: 0, offsetY: 0 })
    let notified = 0
    const unbind = bind(camera, () => {
      notified++
    })
    setViewportPointerAnchor({ x: 100, y: 50 })
    const docBefore = camera.screenToDocument({ x: 100, y: 50 })

    expect(zoomViewportBy(ZOOM_STEP)).toBe(true)

    expect(camera.getState().zoom).toBeCloseTo(ZOOM_STEP, 6)
    const docAfter = camera.screenToDocument({ x: 100, y: 50 })
    expect(docAfter.x).toBeCloseTo(docBefore.x, 6)
    expect(docAfter.y).toBeCloseTo(docBefore.y, 6)
    expect(notified).toBe(1)
    unbind()
  })

  test('reports false with no bound viewport', () => {
    setViewportPointerAnchor(null)
    expect(zoomViewportBy(2)).toBe(false)
  })
})

describe('isViewportZoomShortcut', () => {
  const ev = (partial: Partial<KeyboardEvent>): KeyboardEvent =>
    ({
      key: '',
      code: '',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      ...partial,
    }) as KeyboardEvent

  test('claims the browser zoom keystrokes', () => {
    expect(isViewportZoomShortcut(ev({ key: '+', code: 'Equal', ctrlKey: true }))).toBe(true)
    expect(isViewportZoomShortcut(ev({ key: '=', code: 'Equal', ctrlKey: true }))).toBe(true)
    expect(isViewportZoomShortcut(ev({ key: '-', code: 'Minus', metaKey: true }))).toBe(true)
    expect(isViewportZoomShortcut(ev({ key: '0', code: 'Digit0', ctrlKey: true }))).toBe(true)
    expect(
      isViewportZoomShortcut(ev({ key: '+', code: 'NumpadAdd', ctrlKey: true })),
    ).toBe(true)
  })

  test('leaves unrelated keys alone', () => {
    expect(isViewportZoomShortcut(ev({ key: '=', code: 'Equal' }))).toBe(false)
    expect(isViewportZoomShortcut(ev({ key: 's', code: 'KeyS', ctrlKey: true }))).toBe(false)
    // Alt+Mod+- is not a browser zoom keystroke.
    expect(
      isViewportZoomShortcut(ev({ key: '-', code: 'Minus', ctrlKey: true, altKey: true })),
    ).toBe(false)
  })
})
