import { beforeEach, describe, expect, test } from 'bun:test'
import { createEmptyDocument } from '../../core/document'
import { useEditorSessionStore } from './EditorSessionStore'
import { SelectionMask } from './SelectionMask'
import { useSelectionStore } from './selectionStore'
import { useSelectionToolStore } from './selectionToolStore'

describe('selectionStore', () => {
  beforeEach(() => {
    useEditorSessionStore.setState({
      document: createEmptyDocument({ width: 100, height: 80 }),
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
      lassoMode: 'freehand',
      wandTolerance: 32,
      preview: null,
    })
  })

  test('setMarquee builds a mask and bounds', () => {
    useSelectionStore.getState().setMarquee({
      x: 10,
      y: 20,
      width: 30,
      height: 15,
    })
    const s = useSelectionStore.getState()
    expect(s.hasSelection()).toBe(true)
    expect(s.marquee).toEqual({ x: 10, y: 20, width: 30, height: 15 })
    expect(s.mask?.contains(10, 20)).toBe(true)
    expect(s.mask?.contains(9, 20)).toBe(false)
  })

  test('zero-size drag keeps preview without a mask', () => {
    useSelectionStore.getState().setMarquee({ x: 5, y: 5, width: 0, height: 0 })
    const s = useSelectionStore.getState()
    expect(s.marquee).toEqual({ x: 5, y: 5, width: 0, height: 0 })
    expect(s.mask).toBeNull()
    expect(s.hasSelection()).toBe(false)
  })

  test('inverse and reselect round-trip', () => {
    useSelectionStore.getState().setMarquee({
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    })
    useSelectionStore.getState().inverse(100, 80)
    expect(useSelectionStore.getState().mask?.contains(0, 0)).toBe(true)
    expect(useSelectionStore.getState().mask?.contains(15, 15)).toBe(false)

    useSelectionStore.getState().deselect()
    expect(useSelectionStore.getState().hasSelection()).toBe(false)

    useSelectionStore.getState().reselect()
    expect(useSelectionStore.getState().mask?.contains(0, 0)).toBe(true)
    expect(useSelectionStore.getState().mask?.contains(15, 15)).toBe(false)
  })

  test('selectAll covers the canvas', () => {
    useSelectionStore.getState().selectAll(100, 80)
    expect(useSelectionStore.getState().mask?.contains(0, 0)).toBe(true)
    expect(useSelectionStore.getState().mask?.contains(99, 79)).toBe(true)
  })

  test('applyMask respects combine modes', () => {
    useSelectionToolStore.setState({ combineMode: 'new' })
    useSelectionStore.getState().applyMask(
      SelectionMask.fromRect(100, 80, { x: 0, y: 0, width: 20, height: 20 }),
    )
    useSelectionToolStore.setState({ combineMode: 'add' })
    useSelectionStore.getState().applyMask(
      SelectionMask.fromRect(100, 80, { x: 30, y: 0, width: 20, height: 20 }),
    )
    expect(useSelectionStore.getState().mask?.contains(5, 5)).toBe(true)
    expect(useSelectionStore.getState().mask?.contains(35, 5)).toBe(true)
    expect(useSelectionStore.getState().mask?.contains(25, 5)).toBe(false)
  })

  test('canvasResized moves the selection with the canvas anchor', () => {
    useSelectionStore.getState().setMarquee({
      x: 10,
      y: 20,
      width: 30,
      height: 15,
    })
    // 100×80 → 140×80 anchored center: old origin shifts right by 20.
    useSelectionStore.getState().canvasResized(140, 80, 20, 0)
    const s = useSelectionStore.getState()
    expect(s.mask?.width).toBe(140)
    expect(s.mask?.height).toBe(80)
    expect(s.marquee).toEqual({ x: 30, y: 20, width: 30, height: 15 })
    expect(s.containsPoint(35, 25)).toBe(true)
    // The pixels the selection used to cover are no longer selected.
    expect(s.containsPoint(15, 25)).toBe(false)
    // Selection clipping must agree with the mask across the whole new canvas.
    expect(s.mask?.contains(139, 79)).toBe(false)
  })

  test('canvasResized drops a selection pushed off a shrunk canvas', () => {
    useSelectionStore.getState().setMarquee({
      x: 80,
      y: 60,
      width: 20,
      height: 20,
    })
    useSelectionStore.getState().canvasResized(40, 40, 0, 0)
    const s = useSelectionStore.getState()
    expect(s.hasSelection()).toBe(false)
    expect(s.mask).toBeNull()
    expect(s.marquee).toBeNull()
  })

  test('documentResampled scales the selection with the image', () => {
    useSelectionStore.getState().setMarquee({
      x: 10,
      y: 20,
      width: 30,
      height: 15,
    })
    useSelectionStore.getState().documentResampled(200, 160)
    const s = useSelectionStore.getState()
    expect(s.mask?.width).toBe(200)
    expect(s.mask?.height).toBe(160)
    expect(s.marquee).toEqual({ x: 20, y: 40, width: 60, height: 30 })
    expect(s.containsPoint(25, 45)).toBe(true)
    expect(s.containsPoint(15, 45)).toBe(false)
  })

  test('containsPoint samples the active mask', () => {
    useSelectionStore.getState().setMarquee({
      x: 10,
      y: 20,
      width: 30,
      height: 15,
    })
    expect(useSelectionStore.getState().containsPoint(10, 20)).toBe(true)
    expect(useSelectionStore.getState().containsPoint(9, 20)).toBe(false)
    useSelectionStore.getState().deselect()
    expect(useSelectionStore.getState().containsPoint(10, 20)).toBe(false)
  })
})
