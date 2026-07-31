import { describe, expect, test } from 'bun:test'
import { CAMERA_MAX_ZOOM, CAMERA_MIN_ZOOM, ViewportCamera } from './ViewportCamera'

describe('ViewportCamera transforms', () => {
  test('defaults to identity (zoom 1, no offset)', () => {
    const camera = new ViewportCamera()
    expect(camera.getState()).toEqual({ zoom: 1, offsetX: 0, offsetY: 0 })
  })

  test('at 100% zoom and no pan, screen maps 1:1 to document', () => {
    const camera = new ViewportCamera({ zoom: 1, offsetX: 0, offsetY: 0 })
    const screen = { x: 64, y: 32 }
    expect(camera.screenToDocument(screen)).toEqual(screen)
    expect(camera.documentToScreen(screen)).toEqual(screen)
  })

  test('documentToScreen / screenToDocument round-trip', () => {
    const camera = new ViewportCamera({ zoom: 2, offsetX: 50, offsetY: 20 })
    const doc = { x: 123, y: 45 }
    const screen = camera.documentToScreen(doc)
    expect(screen).toEqual({ x: 123 * 2 + 50, y: 45 * 2 + 20 })
    const back = camera.screenToDocument(screen)
    expect(back.x).toBeCloseTo(doc.x, 10)
    expect(back.y).toBeCloseTo(doc.y, 10)
  })

  test('screenToDevice / deviceToScreen round-trip with a given DPR', () => {
    const camera = new ViewportCamera()
    const screen = { x: 10, y: 20 }
    const device = camera.screenToDevice(screen, 2)
    expect(device).toEqual({ x: 20, y: 40 })
    expect(camera.deviceToScreen(device, 2)).toEqual(screen)
  })

  test('panBy shifts the screen-space offset', () => {
    const camera = new ViewportCamera({ zoom: 1, offsetX: 0, offsetY: 0 })
    camera.panBy(15, -5)
    expect(camera.getState()).toEqual({ zoom: 1, offsetX: 15, offsetY: -5 })
  })
})

describe('ViewportCamera zoom anchoring', () => {
  test('zoomTo keeps the anchor point fixed in document space', () => {
    const camera = new ViewportCamera({ zoom: 1, offsetX: 0, offsetY: 0 })
    const anchor = { x: 200, y: 100 }
    const docBefore = camera.screenToDocument(anchor)

    camera.zoomTo(4, anchor)

    const docAfter = camera.screenToDocument(anchor)
    expect(docAfter.x).toBeCloseTo(docBefore.x, 10)
    expect(docAfter.y).toBeCloseTo(docBefore.y, 10)
    expect(camera.getState().zoom).toBe(4)
  })

  test('zoomBy multiplies the current zoom around the anchor', () => {
    const camera = new ViewportCamera({ zoom: 2, offsetX: 0, offsetY: 0 })
    const anchor = { x: 50, y: 50 }
    camera.zoomBy(1.5, anchor)
    expect(camera.getState().zoom).toBeCloseTo(3, 10)
  })

  test('zoom is clamped to [CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM]', () => {
    const camera = new ViewportCamera()
    camera.zoomTo(0, { x: 0, y: 0 })
    expect(camera.getState().zoom).toBe(CAMERA_MIN_ZOOM)
    camera.zoomTo(1_000_000, { x: 0, y: 0 })
    expect(camera.getState().zoom).toBe(CAMERA_MAX_ZOOM)
  })

  test('repeated zoom in/out around the same anchor is stable', () => {
    const camera = new ViewportCamera({ zoom: 1, offsetX: 30, offsetY: 30 })
    const anchor = { x: 300, y: 150 }
    for (let i = 0; i < 20; i++) camera.zoomBy(1.1, anchor)
    for (let i = 0; i < 20; i++) camera.zoomBy(1 / 1.1, anchor)
    const state = camera.getState()
    expect(state.zoom).toBeCloseTo(1, 6)
    expect(state.offsetX).toBeCloseTo(30, 4)
    expect(state.offsetY).toBeCloseTo(30, 4)
  })
})

describe('ViewportCamera.fitToViewport', () => {
  test('centers and scales a wider-than-tall document to fit', () => {
    const camera = new ViewportCamera()
    camera.fitToViewport(1000, 500, 800, 800)
    const state = camera.getState()
    expect(state.zoom).toBeCloseTo(0.8, 10)
    expect(state.offsetX).toBeCloseTo(0, 10)
    expect(state.offsetY).toBeCloseTo(200, 10)
  })

  test('centers and scales a taller-than-wide document to fit', () => {
    const camera = new ViewportCamera()
    camera.fitToViewport(400, 800, 800, 800)
    const state = camera.getState()
    expect(state.zoom).toBeCloseTo(1, 10)
    expect(state.offsetX).toBeCloseTo(200, 10)
    expect(state.offsetY).toBeCloseTo(0, 10)
  })

  test('respects padding', () => {
    const camera = new ViewportCamera()
    camera.fitToViewport(100, 100, 300, 300, 50)
    const state = camera.getState()
    expect(state.zoom).toBeCloseTo(2, 10)
    expect(state.offsetX).toBeCloseTo(50, 10)
    expect(state.offsetY).toBeCloseTo(50, 10)
  })
})

describe('ViewportCamera.reset', () => {
  test('returns to identity', () => {
    const camera = new ViewportCamera({ zoom: 5, offsetX: 100, offsetY: 100 })
    camera.reset()
    expect(camera.getState()).toEqual({ zoom: 1, offsetX: 0, offsetY: 0 })
  })
})
