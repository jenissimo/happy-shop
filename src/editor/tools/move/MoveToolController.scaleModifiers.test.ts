import { beforeEach, describe, expect, test } from 'bun:test'
import {
  addLayer,
  createEmptyDocument,
  createShapeLayer,
} from '../../../core/document'
import {
  documentHistory,
  resetDocumentHistory,
} from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { useSelectionStore } from '../../session/selectionStore'
import { MoveToolController } from './MoveToolController'
import { boxCenter } from './transformMath'
import { useTransformStore } from './transformStore'
import type { ToolModifiers } from '../toolModifiers'

const BOUNDS = { x: 0, y: 0, w: 100, h: 80 }

function mods(patch: Partial<ToolModifiers> = {}): ToolModifiers {
  return { shift: false, alt: false, ctrl: false, meta: false, ...patch }
}

describe('MoveToolController handle scaling modifiers', () => {
  let layerId: ReturnType<typeof createShapeLayer>['id']

  beforeEach(() => {
    resetDocumentHistory()
    const layer = createShapeLayer({
      name: 'Box',
      primitive: 'rect',
      bounds: { ...BOUNDS },
    })
    layerId = layer.id
    const doc = addLayer(createEmptyDocument({ width: 400, height: 400 }), layer)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [layerId],
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
      showTransformControls: true,
      autoSelectLayer: false,
      activeHandle: null,
      gesturing: false,
    })
  })

  function currentTransform() {
    return useEditorSessionStore.getState().document.layers[layerId]!.transform
  }

  function currentCenter() {
    return boxCenter({ bounds: BOUNDS, transform: currentTransform() })
  }

  test('Alt held mid-drag re-anchors the corner scale to the center', async () => {
    const ctl = new MoveToolController()
    // Grab the SE handle without Alt, then press it during the drag.
    expect(await ctl.pointerDown(100, 80, 1, 1, mods())).toBe(true)
    expect(ctl.gestureKind).toBe('scale')

    ctl.pointerMove(150, 120, 1, mods())
    expect(currentTransform().scaleX).toBeCloseTo(1.5, 6)
    expect(currentCenter().x).toBeCloseTo(75, 6)

    ctl.pointerMove(150, 120, 1, mods({ alt: true }))
    const alt = currentTransform()
    expect(alt.scaleX).toBeCloseTo(2, 6)
    expect(alt.scaleY).toBeCloseTo(2, 6)
    expect(currentCenter().x).toBeCloseTo(50, 6)
    expect(currentCenter().y).toBeCloseTo(40, 6)

    // Releasing Alt returns to the opposite-handle anchor.
    ctl.pointerMove(150, 120, 1, mods())
    expect(currentTransform().scaleX).toBeCloseTo(1.5, 6)
    expect(currentCenter().x).toBeCloseTo(75, 6)
    ctl.pointerUp(1)
  })

  test('Shift+Alt scales proportionally about the center', async () => {
    const ctl = new MoveToolController()
    // E handle: without Shift this would only change scaleX.
    expect(await ctl.pointerDown(100, 40, 1, 1, mods())).toBe(true)
    ctl.pointerMove(150, 40, 1, mods({ shift: true, alt: true }))

    const t = currentTransform()
    expect(t.scaleX).toBeCloseTo(2, 6)
    expect(Math.abs(t.scaleY)).toBeCloseTo(Math.abs(t.scaleX), 6)
    expect(currentCenter().x).toBeCloseTo(50, 6)
    expect(currentCenter().y).toBeCloseTo(40, 6)
    ctl.pointerUp(1)
  })

  test('Alt on an edge handle grows both sides', async () => {
    const ctl = new MoveToolController()
    expect(await ctl.pointerDown(50, 0, 1, 1, mods())).toBe(true)
    ctl.pointerMove(50, -20, 1, mods({ alt: true }))

    const t = currentTransform()
    expect(t.scaleX).toBeCloseTo(1, 6)
    expect(t.scaleY).toBeCloseTo(1.5, 6)
    expect(currentCenter().y).toBeCloseTo(40, 6)
    ctl.pointerUp(1)
  })
})
