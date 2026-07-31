import { describe, expect, test } from 'bun:test'
import { mapClientToViewport } from './mapClientToViewport'
import { ViewportCamera } from './ViewportCamera'

function fakeElement(rect: {
  left: number
  top: number
  width: number
  height: number
}): HTMLElement {
  return {
    getBoundingClientRect: () =>
      ({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        x: rect.left,
        y: rect.top,
        toJSON: () => ({}),
      }) as DOMRect,
  } as HTMLElement
}

describe('mapClientToViewport', () => {
  test('identity when painted box matches logical viewport', () => {
    const el = fakeElement({ left: 100, top: 50, width: 800, height: 600 })
    const screen = mapClientToViewport(100 + 200, 50 + 150, el, 800, 600)
    expect(screen.x).toBeCloseTo(200, 10)
    expect(screen.y).toBeCloseTo(150, 10)
  })

  test('normalizes CSS stretch so cursor maps to logical pixel', () => {
    // Host painted 1000×500 but renderer/camera use 800×400 (stretch).
    const el = fakeElement({ left: 0, top: 0, width: 1000, height: 500 })
    const screen = mapClientToViewport(500, 250, el, 800, 400)
    expect(screen.x).toBeCloseTo(400, 10)
    expect(screen.y).toBeCloseTo(200, 10)
  })

  test('end-to-end: 100% zoom, no pan, stretch → document under cursor', () => {
    const el = fakeElement({ left: 40, top: 80, width: 900, height: 600 })
    const camera = new ViewportCamera({ zoom: 1, offsetX: 0, offsetY: 0 })
    const screen = mapClientToViewport(40 + 225, 80 + 150, el, 900, 600)
    const doc = camera.screenToDocument(screen)
    expect(doc.x).toBeCloseTo(225, 10)
    expect(doc.y).toBeCloseTo(150, 10)
  })

  test('end-to-end: zoomed + panned camera stays aligned', () => {
    const el = fakeElement({ left: 0, top: 0, width: 800, height: 600 })
    const camera = new ViewportCamera({ zoom: 2, offsetX: 100, offsetY: 50 })
    const screen = mapClientToViewport(300, 200, el, 800, 600)
    const doc = camera.screenToDocument(screen)
    // screen 300,200 → doc ((300-100)/2, (200-50)/2) = (100, 75)
    expect(doc.x).toBeCloseTo(100, 10)
    expect(doc.y).toBeCloseTo(75, 10)
    const back = camera.documentToScreen(doc)
    expect(back.x).toBeCloseTo(300, 10)
    expect(back.y).toBeCloseTo(200, 10)
  })
})
