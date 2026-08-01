import { beforeEach, describe, expect, test } from 'bun:test'
import { getSubpath, penPathAnchorCount } from './penPath'
import { PenToolController } from './PenToolController'
import { useWorkPathStore } from './workPathStore'

const NO_MODS = { shift: false, alt: false, ctrl: false, meta: false }

describe('PenToolController', () => {
  beforeEach(() => {
    useWorkPathStore.setState({
      path: null,
      draft: null,
      rubberBand: null,
      activeSubpathIndex: 0,
      selectedAnchors: [],
      primaryAnchor: null,
      activeHandle: null,
    })
  })

  test('places a corner on click and keeps rubber-band', () => {
    const pen = new PenToolController()
    pen.pointerDown(10, 10, 1, NO_MODS)
    pen.pointerUp(10, 10, 1, NO_MODS)
    const draft = useWorkPathStore.getState().draft!
    expect(penPathAnchorCount(draft)).toBe(1)
    expect(getSubpath(draft).anchors[0]).toMatchObject({ x: 10, y: 10 })
    expect(useWorkPathStore.getState().rubberBand).toEqual({ x: 10, y: 10 })
  })

  test('live place-and-drag creates smooth linked handles', () => {
    const pen = new PenToolController()
    pen.pointerDown(0, 0, 1, NO_MODS)
    pen.pointerMove(40, 0, 1, NO_MODS)
    pen.pointerUp(40, 0, 1, NO_MODS)
    const anchor = getSubpath(useWorkPathStore.getState().draft!).anchors[0]!
    expect(anchor.out).toEqual({ x: 40, y: 0 })
    expect(anchor.in).toEqual({ x: -40, y: 0 })
    expect(anchor.linked).toBe(true)
  })

  test('Alt drag creates an unlinked cusp', () => {
    const pen = new PenToolController()
    const mods = { ...NO_MODS, alt: true }
    pen.pointerDown(0, 0, 1, mods)
    pen.pointerMove(30, 0, 1, mods)
    pen.pointerUp(30, 0, 1, mods)
    const anchor = getSubpath(useWorkPathStore.getState().draft!).anchors[0]!
    expect(anchor.out).toEqual({ x: 30, y: 0 })
    expect(anchor.in).toBeUndefined()
    expect(anchor.linked).toBe(false)
  })

  test('Shift constrains handle to 45°', () => {
    const pen = new PenToolController()
    const mods = { ...NO_MODS, shift: true }
    pen.pointerDown(0, 0, 1, mods)
    pen.pointerMove(40, 10, 1, mods)
    pen.pointerUp(40, 10, 1, mods)
    const out = getSubpath(useWorkPathStore.getState().draft!).anchors[0]!.out!
    expect(Math.abs(out.y)).toBeLessThan(1e-6)
    expect(out.x).toBeCloseTo(Math.hypot(40, 10), 5)
  })

  test('continues an open work path at the endpoint', () => {
    useWorkPathStore.getState().setPath({
      subpaths: [
        {
          closed: false,
          anchors: [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
          ],
        },
      ],
    })
    const pen = new PenToolController()
    // Attach to endpoint (no new knot yet).
    pen.pointerDown(50, 0, 1, NO_MODS)
    expect(penPathAnchorCount(useWorkPathStore.getState().draft!)).toBe(2)
    // Next click places a new anchor.
    pen.pointerDown(80, 20, 2, NO_MODS)
    pen.pointerUp(80, 20, 2, NO_MODS)
    expect(penPathAnchorCount(useWorkPathStore.getState().draft!)).toBe(3)
  })
})
