import { beforeEach, describe, expect, test } from 'bun:test'
import {
  addLayer,
  createEmptyDocument,
  createShapeLayer,
} from '../../../core/document'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { SelectionMask } from '../../session/SelectionMask'
import { useSelectionStore } from '../../session/selectionStore'
import { MoveToolController } from './MoveToolController'
import { useTransformStore } from './transformStore'

describe('MoveToolController pixel-selection deselect', () => {
  beforeEach(() => {
    const layer = createShapeLayer({
      primitive: 'rect',
      bounds: { x: 0, y: 0, w: 80, h: 60 },
    })
    const doc = addLayer(
      createEmptyDocument({ width: 100, height: 80 }),
      layer,
    )
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [layer.id],
      activeToolId: 'move',
    })
    useSelectionStore.setState({
      marquee: null,
      lastMarquee: null,
      mask: null,
      lastMask: null,
    })
    useTransformStore.setState({
      session: null,
      showTransformControls: true,
      autoSelectLayer: false,
      activeHandle: null,
      gesturing: false,
    })
    useSelectionStore.getState().applyMask(
      SelectionMask.fromRect(100, 80, { x: 10, y: 10, width: 30, height: 20 }),
    )
  })

  test('click outside selection deselects and does not start move', async () => {
    const ctl = new MoveToolController()
    const ok = await ctl.pointerDown(90, 70, 1, 1, { shiftKey: false })
    expect(ok).toBe(true)
    expect(useSelectionStore.getState().hasSelection()).toBe(false)
    expect(ctl.isDragging).toBe(false)
  })

  test('click inside selection starts a move gesture', async () => {
    const ctl = new MoveToolController()
    const ok = await ctl.pointerDown(20, 15, 1, 1, { shiftKey: false })
    expect(ok).toBe(true)
    expect(useSelectionStore.getState().hasSelection()).toBe(true)
    expect(ctl.isDragging).toBe(true)
    ctl.pointerUp(1)
  })

  test('transform handle hit is preferred over deselect', async () => {
    // NW handle of shape at local (0,0) with identity transform → doc (0,0).
    const ctl = new MoveToolController()
    const ok = await ctl.pointerDown(0, 0, 1, 1, { shiftKey: false })
    expect(ok).toBe(true)
    // Outside the 10,10–40,30 selection — but NW handle wins, so no deselect.
    expect(useSelectionStore.getState().hasSelection()).toBe(true)
    expect(ctl.isDragging).toBe(true)
    ctl.pointerUp(1)
  })
})
