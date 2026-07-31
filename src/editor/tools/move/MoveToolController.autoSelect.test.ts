import { beforeEach, describe, expect, test } from 'bun:test'
import {
  addLayer,
  createEmptyDocument,
  createShapeLayer,
} from '../../../core/document'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { useSelectionStore } from '../../session/selectionStore'
import { MoveToolController } from './MoveToolController'
import { useTransformStore } from './transformStore'

describe('MoveToolController Auto-Select', () => {
  let bottomId: ReturnType<typeof createShapeLayer>['id']
  let topId: ReturnType<typeof createShapeLayer>['id']

  beforeEach(() => {
    const bottom = createShapeLayer({
      name: 'Bottom',
      primitive: 'rect',
      bounds: { x: 0, y: 0, w: 50, h: 40 },
    })
    const top = createShapeLayer({
      name: 'Top',
      primitive: 'rect',
      bounds: { x: 30, y: 0, w: 50, h: 40 },
    })
    bottomId = bottom.id
    topId = top.id
    const doc = addLayer(
      addLayer(createEmptyDocument({ width: 120, height: 80 }), bottom),
      top,
    )
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [bottomId],
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
      showTransformControls: false,
      autoSelectLayer: true,
      activeHandle: null,
      gesturing: false,
    })
  })

  test('Auto-Select ON picks topmost layer and starts move', async () => {
    const ctl = new MoveToolController()
    // Overlap region — top wins.
    const ok = await ctl.pointerDown(40, 10, 1, 1, { shiftKey: false })
    expect(ok).toBe(true)
    expect(useEditorSessionStore.getState().selectedLayerIds).toEqual([topId])
    expect(ctl.isDragging).toBe(true)
    ctl.pointerUp(1)
  })

  test('Auto-Select ON miss does not move current selection', async () => {
    const ctl = new MoveToolController()
    const ok = await ctl.pointerDown(110, 70, 1, 1, { shiftKey: false })
    expect(ok).toBe(false)
    expect(useEditorSessionStore.getState().selectedLayerIds).toEqual([
      bottomId,
    ])
    expect(ctl.isDragging).toBe(false)
  })

  test('Auto-Select OFF moves current selection without re-picking', async () => {
    useTransformStore.getState().setAutoSelectLayer(false)
    const ctl = new MoveToolController()
    // Click on top layer — selection stays bottom, move starts.
    const ok = await ctl.pointerDown(40, 10, 1, 1, { shiftKey: false })
    expect(ok).toBe(true)
    expect(useEditorSessionStore.getState().selectedLayerIds).toEqual([
      bottomId,
    ])
    expect(ctl.isDragging).toBe(true)
    ctl.pointerUp(1)
  })
})
