import { beforeEach, describe, expect, test } from 'bun:test'
import { createEmptyDocument } from '../../../core/document'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { SelectionMask } from '../../session/SelectionMask'
import { useSelectionStore } from '../../session/selectionStore'
import { useSelectionToolStore } from '../../session/selectionToolStore'
import { SelectionToolController } from './SelectionToolController'
import { computeEdgeField } from './magneticLasso'

function seedSelection(): void {
  useSelectionStore.getState().applyMask(
    SelectionMask.fromRect(100, 80, { x: 20, y: 20, width: 40, height: 30 }),
  )
  expect(useSelectionStore.getState().hasSelection()).toBe(true)
}

describe('SelectionToolController click-outside deselect', () => {
  beforeEach(() => {
    useEditorSessionStore.setState({
      document: createEmptyDocument({ width: 100, height: 80 }),
      activeToolId: 'marquee',
    })
    useSelectionStore.setState({
      marquee: null,
      lastMarquee: null,
      mask: null,
      lastMask: null,
    })
    useSelectionToolStore.setState({
      combineMode: 'new',
      marqueeShape: 'rect',
      marqueeStyle: 'normal',
      fixedMarqueeWidth: 64,
      fixedMarqueeHeight: 64,
      lassoMode: 'freehand',
      featherRadius: 0,
      antiAlias: false,
      wandTolerance: 32,
      preview: null,
    })
  })

  test('marquee click without drag deselects in New mode', () => {
    useSelectionToolStore.setState({ marqueeStyle: 'normal' })
    seedSelection()
    const ctl = new SelectionToolController()
    ctl.pointerDown(5, 5, 1)
    ctl.pointerUp(5, 5, 1)
    expect(useSelectionStore.getState().hasSelection()).toBe(false)
  })

  test('marquee click without drag keeps selection in Add mode', () => {
    seedSelection()
    useSelectionToolStore.setState({ combineMode: 'add' })
    const ctl = new SelectionToolController()
    ctl.pointerDown(5, 5, 1)
    ctl.pointerUp(5, 5, 1)
    expect(useSelectionStore.getState().hasSelection()).toBe(true)
    expect(useSelectionStore.getState().mask?.contains(25, 25)).toBe(true)
  })

  test('marquee drag replaces selection in New mode', () => {
    seedSelection()
    const ctl = new SelectionToolController()
    ctl.pointerDown(0, 0, 1)
    ctl.pointerMove(15, 12, 1)
    ctl.pointerUp(15, 12, 1)
    const mask = useSelectionStore.getState().mask
    expect(mask?.contains(5, 5)).toBe(true)
    expect(mask?.contains(25, 25)).toBe(false)
  })

  test('elliptical marquee commits an elliptical mask', () => {
    useSelectionToolStore.setState({ marqueeShape: 'ellipse' })
    const ctl = new SelectionToolController()
    ctl.pointerDown(10, 10, 1)
    ctl.pointerMove(30, 30, 1)
    expect(useSelectionToolStore.getState().preview?.kind).toBe('ellipse')
    ctl.pointerUp(30, 30, 1)

    const mask = useSelectionStore.getState().mask
    expect(mask?.contains(20, 20)).toBe(true)
    expect(mask?.contains(10, 10)).toBe(false)
    expect(mask?.outline()?.ellipses).toEqual([
      { x: 10, y: 10, width: 20, height: 20 },
    ])
  })

  test('marquee Shift drag locks 1:1 square', () => {
    const ctl = new SelectionToolController()
    ctl.pointerDown(10, 10, 1)
    ctl.pointerMove(50, 20, 1, { shiftKey: true })
    const preview = useSelectionToolStore.getState().preview
    expect(preview?.kind).toBe('rect')
    if (preview?.kind === 'rect') {
      expect(preview.rect).toEqual({ x: 10, y: 10, width: 40, height: 40 })
    }
    ctl.pointerUp(50, 20, 1, { shiftKey: true })
    expect(useSelectionStore.getState().mask?.contains(45, 45)).toBe(true)
    expect(useSelectionStore.getState().mask?.contains(45, 55)).toBe(false)
  })

  test('marquee Alt drag expands from center', () => {
    const ctl = new SelectionToolController()
    ctl.pointerDown(40, 40, 1)
    ctl.pointerMove(60, 50, 1, { altKey: true })
    const preview = useSelectionToolStore.getState().preview
    expect(preview?.kind).toBe('rect')
    if (preview?.kind === 'rect') {
      expect(preview.rect).toEqual({ x: 20, y: 30, width: 40, height: 20 })
    }
    ctl.pointerUp(60, 50, 1, { altKey: true })
  })

  test('freehand lasso click without a path deselects in New mode', () => {
    useEditorSessionStore.setState({ activeToolId: 'lasso' })
    seedSelection()
    const ctl = new SelectionToolController()
    ctl.pointerDown(2, 2, 1)
    ctl.pointerUp(2, 2, 1)
    expect(useSelectionStore.getState().hasSelection()).toBe(false)
  })

  test('marquee applies configured feather only when committed', () => {
    useSelectionToolStore.setState({ featherRadius: 2 })
    const ctl = new SelectionToolController()
    ctl.pointerDown(20, 20, 1)
    ctl.pointerMove(40, 40, 1)
    expect(useSelectionToolStore.getState().preview?.kind).toBe('rect')
    ctl.pointerUp(40, 40, 1)

    const mask = useSelectionStore.getState().mask
    expect(mask?.sample(19, 30)).toBeGreaterThan(0)
    expect(mask?.sample(19, 30)).toBeLessThan(255)
  })

  test('marquee anti-alias preserves partial edge coverage', () => {
    useSelectionToolStore.setState({ marqueeShape: 'ellipse', antiAlias: true })
    const ctl = new SelectionToolController()
    ctl.pointerDown(10, 10, 1)
    ctl.pointerMove(30, 30, 1)
    ctl.pointerUp(30, 30, 1)

    const mask = useSelectionStore.getState().mask
    expect(mask?.sample(10, 16)).toBeGreaterThan(0)
    expect(mask?.sample(10, 16)).toBeLessThan(255)
  })

  test('single pixel marquee selects one pixel on click', () => {
    useSelectionToolStore.setState({ marqueeStyle: 'singlePixel' })
    const ctl = new SelectionToolController()
    ctl.pointerDown(25, 30, 1)
    ctl.pointerUp(25, 30, 1)
    const mask = useSelectionStore.getState().mask
    expect(mask?.contains(25, 30)).toBe(true)
    expect(mask?.contains(26, 30)).toBe(false)
  })

  test('fixed size marquee commits without drag', () => {
    useSelectionToolStore.setState({
      marqueeStyle: 'fixedSize',
      fixedMarqueeWidth: 10,
      fixedMarqueeHeight: 6,
    })
    const ctl = new SelectionToolController()
    ctl.pointerDown(50, 40, 1)
    ctl.pointerUp(50, 40, 1)
    const mask = useSelectionStore.getState().mask
    expect(mask?.contains(50, 40)).toBe(true)
    expect(mask?.contains(45, 37)).toBe(true)
    expect(mask?.contains(44, 36)).toBe(false)
  })

  test('single row marquee creates a 1px-tall selection', () => {
    useSelectionToolStore.setState({ marqueeStyle: 'singleRow' })
    const ctl = new SelectionToolController()
    ctl.pointerDown(10, 20, 1)
    ctl.pointerUp(30, 35, 1)
    const mask = useSelectionStore.getState().mask
    expect(mask?.contains(15, 20)).toBe(true)
    expect(mask?.contains(15, 21)).toBe(false)
  })

  test('magnetic lasso commits a traced polygon when an edge field is set', () => {
    useEditorSessionStore.setState({ activeToolId: 'lasso' })
    useSelectionToolStore.setState({ lassoMode: 'magnetic' })
    const width = 40
    const height = 30
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = x < 20 ? 0 : 255
        const i = (y * width + x) * 4
        rgba[i] = v
        rgba[i + 1] = v
        rgba[i + 2] = v
        rgba[i + 3] = 255
      }
    }
    const ctl = new SelectionToolController()
    ctl.setMagneticField(computeEdgeField(rgba, width, height))
    ctl.pointerDown(5, 15, 1)
    ctl.pointerMove(35, 15, 1)
    ctl.pointerUp(35, 15, 1)
    expect(useSelectionStore.getState().hasSelection()).toBe(true)
  })
})
