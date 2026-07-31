import { beforeEach, describe, expect, test } from 'bun:test'
import {
  addLayer,
  createEmptyDocument,
  createShapeLayer,
} from '../../../core/document'
import { documentHistory, resetDocumentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { useSelectionStore } from '../../session/selectionStore'
import { MoveToolController } from './MoveToolController'
import { useTransformStore } from './transformStore'

describe('MoveToolController Alt-drag duplicate', () => {
  let sourceId: ReturnType<typeof createShapeLayer>['id']

  beforeEach(() => {
    resetDocumentHistory()
    const layer = createShapeLayer({
      name: 'Box',
      primitive: 'rect',
      bounds: { x: 10, y: 10, w: 40, h: 30 },
    })
    sourceId = layer.id
    const doc = addLayer(createEmptyDocument({ width: 120, height: 80 }), layer)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [sourceId],
      activeToolId: 'move',
      historyVersion: documentHistory.version,
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
      autoSelectLayer: false,
      activeHandle: null,
      gesturing: false,
    })
  })

  test('Alt+drag duplicates the layer and moves the copy', async () => {
    const beforeCount =
      useEditorSessionStore.getState().document.rootChildren.length
    const ctl = new MoveToolController()
    const ok = await ctl.pointerDown(20, 20, 1, 1, {
      shift: false,
      alt: true,
      ctrl: false,
      meta: false,
    })
    expect(ok).toBe(true)
    expect(ctl.isDragging).toBe(true)

    const afterDup = useEditorSessionStore.getState()
    expect(afterDup.document.rootChildren).toHaveLength(beforeCount + 1)
    const copyId = afterDup.selectedLayerIds[0]!
    expect(copyId).not.toBe(sourceId)
    expect(afterDup.document.layers[copyId]?.name).toBe('Box copy')
    expect(documentHistory.undoLabel).toBe('Duplicate Layer')

    const sourceBeforeMove = afterDup.document.layers[sourceId]!.transform
    ctl.pointerMove(50, 20, 1)
    ctl.pointerUp(1)

    const afterMove = useEditorSessionStore.getState()
    const sourceAfter = afterMove.document.layers[sourceId]!.transform
    const copyAfter = afterMove.document.layers[copyId]!.transform
    expect(sourceAfter.x).toBe(sourceBeforeMove.x)
    expect(sourceAfter.y).toBe(sourceBeforeMove.y)
    expect(copyAfter.x).not.toBe(sourceAfter.x)
  })

  test('plain drag does not duplicate', async () => {
    const beforeCount =
      useEditorSessionStore.getState().document.rootChildren.length
    const ctl = new MoveToolController()
    await ctl.pointerDown(20, 20, 1, 1, {
      shift: false,
      alt: false,
      ctrl: false,
      meta: false,
    })
    expect(useEditorSessionStore.getState().document.rootChildren).toHaveLength(
      beforeCount,
    )
    expect(documentHistory.canUndo).toBe(false)
    ctl.pointerUp(1)
  })

  test('position-locked layer is not duplicated', async () => {
    const beforeCount =
      useEditorSessionStore.getState().document.rootChildren.length
    const doc = useEditorSessionStore.getState().document
    const locked = {
      ...doc.layers[sourceId]!,
      lockFlags: { position: true },
    }
    useEditorSessionStore.setState({
      document: { ...doc, layers: { ...doc.layers, [sourceId]: locked } },
    })

    const ctl = new MoveToolController()
    const ok = await ctl.pointerDown(20, 20, 1, 1, {
      shift: false,
      alt: true,
      ctrl: false,
      meta: false,
    })
    expect(ok).toBe(false)
    expect(useEditorSessionStore.getState().document.rootChildren).toHaveLength(
      beforeCount,
    )
  })
})
