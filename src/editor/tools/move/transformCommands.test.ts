import { beforeEach, describe, expect, test } from 'bun:test'
import {
  addLayer,
  createEmptyDocument,
  createShapeLayer,
} from '../../../core/document'
import { CommandRegistry } from '../../../core/commands/registry'
import {
  documentHistory,
  resetDocumentHistory,
} from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { MoveToolController } from './MoveToolController'
import { registerTransformCommands } from './transformCommands'
import {
  shouldShowTransformHandles,
  useTransformStore,
} from './transformStore'

describe('edit.freeTransform with Show Transform Controls off', () => {
  let registry: CommandRegistry
  let layerId: ReturnType<typeof createShapeLayer>['id']

  beforeEach(() => {
    resetDocumentHistory()
    const layer = createShapeLayer({
      name: 'Box',
      primitive: 'rect',
      bounds: { x: 0, y: 0, w: 100, h: 80 },
    })
    layerId = layer.id
    const doc = addLayer(createEmptyDocument({ width: 400, height: 400 }), layer)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [layerId],
      // Mod+T is global: the Move tool need not be active yet.
      activeToolId: 'brush',
      historyVersion: documentHistory.version,
    })
    useTransformStore.setState({
      session: null,
      showTransformControls: false,
      autoSelectLayer: false,
      activeHandle: null,
      gesturing: false,
    })
    registry = new CommandRegistry()
    registerTransformCommands(registry)
  })

  test('Mod+T is enabled and starts a session that shows handles', () => {
    expect(registry.get('edit.freeTransform')?.shortcut).toBe('Mod+T')
    expect(registry.get('edit.freeTransform')?.enabled()).toBe(true)
    expect(registry.run('edit.freeTransform')).toBe(true)

    const state = useTransformStore.getState()
    expect(state.session?.layerIds).toEqual([layerId])
    expect(useEditorSessionStore.getState().activeToolId).toBe('move')
    // Session wins over the hidden preference.
    expect(state.showTransformControls).toBe(false)
    expect(shouldShowTransformHandles('move', state)).toBe(true)
  })

  test('session handles are grabbable while the preference stays off', async () => {
    registry.run('edit.freeTransform')

    const ctl = new MoveToolController()
    // SE handle of the 100x80 box.
    expect(
      await ctl.pointerDown(100, 80, 1, 1, {
        shift: false,
        alt: false,
        ctrl: false,
        meta: false,
      }),
    ).toBe(true)
    expect(ctl.gestureKind).toBe('scale')
    ctl.pointerMove(200, 160, 1)
    ctl.pointerUp(1)

    expect(
      useEditorSessionStore.getState().document.layers[layerId]!.transform
        .scaleX,
    ).toBeCloseTo(2, 6)
    expect(useTransformStore.getState().showTransformControls).toBe(false)
  })

  test('committing the session restores hidden handles, preference untouched', () => {
    registry.run('edit.freeTransform')
    // Second invocation commits the session (PS: Enter / Mod+T again).
    registry.run('edit.freeTransform')

    const state = useTransformStore.getState()
    expect(state.session).toBeNull()
    expect(state.showTransformControls).toBe(false)
    expect(shouldShowTransformHandles('move', state)).toBe(false)
  })
})
