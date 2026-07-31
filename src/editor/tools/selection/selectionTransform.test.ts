import { beforeEach, describe, expect, test } from 'bun:test'
import { addLayer, createEmptyDocument, createShapeLayer } from '../../../core/document'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { SelectionMask } from '../../session/SelectionMask'
import { useSelectionStore } from '../../session/selectionStore'
import { NO_MODIFIERS } from '../toolModifiers'
import {
  SelectionTransformController,
  beginSelectionTransform,
  cancelSelectionTransform,
  commitSelectionTransform,
  resampleSelectionMask,
  useSelectionTransformStore,
} from './selectionTransform'

describe('Transform Selection', () => {
  beforeEach(() => {
    const layer = createShapeLayer({
      primitive: 'rect',
      bounds: { x: 0, y: 0, w: 80, h: 60 },
    })
    useEditorSessionStore.setState({
      document: addLayer(createEmptyDocument({ width: 100, height: 80 }), layer),
      selectedLayerIds: [layer.id],
      dirty: false,
    })
    useSelectionStore.setState({
      marquee: null,
      lastMarquee: null,
      mask: null,
      lastMask: null,
    })
    useSelectionTransformStore.setState({
      session: null,
      activeHandle: null,
      gesturing: false,
    })
  })

  test('scales the selection mask without changing layer metadata', () => {
    useSelectionStore.getState().setMask(
      SelectionMask.fromRect(100, 80, { x: 10, y: 10, width: 20, height: 10 }),
    )
    const documentBefore = useEditorSessionStore.getState().document
    const controller = new SelectionTransformController()

    expect(beginSelectionTransform()).toBe(true)
    expect(controller.pointerDown(30, 20, 1, 1)).toBe(true)
    controller.pointerMove(50, 30, 1)
    controller.pointerUp(1)
    expect(commitSelectionTransform()).toBe(true)

    const bounds = useSelectionStore.getState().mask?.bounds()
    expect(bounds?.x).toBeLessThanOrEqual(10)
    expect(bounds?.y).toBeLessThanOrEqual(10)
    expect(bounds?.width).toBeGreaterThanOrEqual(39)
    expect(bounds?.height).toBeGreaterThanOrEqual(19)
    expect(useEditorSessionStore.getState().document).toBe(documentBefore)
  })

  test('Ctrl+side handle skews the selection mask', () => {
    useSelectionStore.getState().setMask(
      SelectionMask.fromRect(100, 80, { x: 20, y: 20, width: 20, height: 10 }),
    )
    const before = useSelectionStore.getState().mask!.clone()
    const controller = new SelectionTransformController()

    beginSelectionTransform()
    expect(
      controller.pointerDown(30, 20, 3, 1, { ...NO_MODIFIERS, ctrl: true }),
    ).toBe(true)
    controller.pointerMove(45, 20, 3, { ...NO_MODIFIERS, ctrl: true })
    controller.pointerUp(3)

    const session = useSelectionTransformStore.getState().session!
    expect(session.transform.skewXDeg).not.toBe(0)
    const warped = resampleSelectionMask(session)
    expect(warped.bounds()?.width).toBeGreaterThan(before.bounds()!.width)
  })

  test('Ctrl+Alt+corner handle applies perspective warp', () => {
    useSelectionStore.getState().setMask(
      SelectionMask.fromRect(100, 80, { x: 20, y: 20, width: 20, height: 10 }),
    )
    const controller = new SelectionTransformController()

    beginSelectionTransform()
    expect(
      controller.pointerDown(40, 20, 4, 1, { ...NO_MODIFIERS, ctrl: true, alt: true }),
    ).toBe(true)
    controller.pointerMove(50, 15, 4, { ...NO_MODIFIERS, ctrl: true, alt: true })
    controller.pointerUp(4)

    const session = useSelectionTransformStore.getState().session!
    expect(session.perspective).not.toBeNull()
    expect(session.perspective!.destQuad[1]!.x).toBeGreaterThan(40)
  })

  test('Esc cancellation restores the original mask', () => {
    useSelectionStore.getState().setMask(
      SelectionMask.fromEllipse(100, 80, { x: 20, y: 15, width: 20, height: 20 }),
    )
    const before = useSelectionStore.getState().mask!.clone()
    const controller = new SelectionTransformController()

    beginSelectionTransform()
    controller.pointerDown(30, 25, 2, 1)
    controller.pointerMove(45, 35, 2)
    controller.pointerUp(2)
    expect(useSelectionStore.getState().mask?.bounds()).not.toEqual(before.bounds())

    expect(cancelSelectionTransform()).toBe(true)
    const restored = useSelectionStore.getState().mask!
    expect(restored.bounds()).toEqual(before.bounds())
    for (let y = 0; y < 80; y += 4) {
      for (let x = 0; x < 100; x += 4) {
        expect(restored.sample(x, y)).toBe(before.sample(x, y))
      }
    }
  })
})
