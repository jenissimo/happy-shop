import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { CommandRegistry } from '../../core/commands/registry'
import {
  addLayer,
  asRasterAssetRef,
  createAdjustmentLayer,
  createEmptyDocument,
  createRasterLayer,
  createTextLayer,
  getLayer,
} from '../../core/document'
import { documentHistory, resetDocumentHistory } from '../session/documentHistory'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { registerFilterCommands } from '../tools/crop/registerFilterCommands'
import { applySharpen, canApplySharpen } from './sharpen'

function setupRasterLayer(): ReturnType<typeof createRasterLayer> {
  const layer = createRasterLayer({
    name: 'L',
    pixels: asRasterAssetRef('px1'),
  })
  const doc = addLayer(createEmptyDocument({ width: 32, height: 32 }), layer)
  useEditorSessionStore.setState({
    document: doc,
    selectedLayerIds: [layer.id],
  })
  return layer
}

describe('sharpen filter', () => {
  beforeEach(() => {
    resetDocumentHistory()
    useEditorSessionStore.setState({
      document: createEmptyDocument({ width: 32, height: 32 }),
      dirty: false,
      selectedLayerIds: [],
      historyVersion: documentHistory.version,
    })
  })

  afterEach(() => {
    resetDocumentHistory()
  })

  test('canApplySharpen requires an unlocked paintable layer', () => {
    expect(canApplySharpen()).toBe(false)

    setupRasterLayer()
    expect(canApplySharpen()).toBe(true)

    const text = createTextLayer({ name: 'T' })
    const doc = addLayer(createEmptyDocument({ width: 32, height: 32 }), text)
    useEditorSessionStore.setState({ document: doc, selectedLayerIds: [text.id] })
    expect(canApplySharpen()).toBe(true)

    const adjustment = createAdjustmentLayer({ name: 'Adj' })
    const adjustmentDoc = addLayer(createEmptyDocument({ width: 32, height: 32 }), adjustment)
    useEditorSessionStore.setState({
      document: adjustmentDoc,
      selectedLayerIds: [adjustment.id],
    })
    expect(canApplySharpen()).toBe(false)
  })

  test('applySharpen adds a content-phase FX node', async () => {
    const layer = setupRasterLayer()

    expect(await applySharpen(1, 2)).toBe(true)
    expect(documentHistory.undoLabel).toBe('Add Sharpen')

    const updated = getLayer(useEditorSessionStore.getState().document, layer.id)
    expect(updated?.effects[0]?.type).toBe('sharpen')
    if (updated?.effects[0]?.type === 'sharpen') {
      expect(updated.effects[0].amount).toBe(1)
      expect(updated.effects[0].radius).toBe(2)
    }
  })

  test('filter commands are registered and gated on layer type', () => {
    const registry = new CommandRegistry()
    registerFilterCommands(registry)

    expect(registry.get('filter.sharpen')?.title).toBe('Sharpen…')
    expect(registry.get('filter.adjust.brightnessContrast')?.title).toBe(
      'Brightness/Contrast…',
    )
    expect(registry.get('filter.sharpen')?.enabled()).toBe(false)

    setupRasterLayer()
    expect(registry.get('filter.sharpen')?.enabled()).toBe(true)
    expect(registry.get('filter.adjust.levels')?.enabled()).toBe(true)

    registry.get('filter.adjust.hueSaturation')?.run()
    expect(documentHistory.undoLabel).toBe('Add Hue/Saturation')
  })
})
