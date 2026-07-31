import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
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
import { addAdjustmentFilterNode, addNoiseNode, addSharpenNode } from './contentFilters'

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

describe('contentFilters', () => {
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

  test('addNoiseNode adds a content-phase FX node', () => {
    const layer = setupRasterLayer()

    expect(addNoiseNode(0.5, 'uniform', true)).toBe(true)
    expect(documentHistory.undoLabel).toBe('Add Noise')

    const updated = getLayer(useEditorSessionStore.getState().document, layer.id)
    expect(updated?.effects[0]?.type).toBe('noise')
  })

  test('addSharpenNode adds a content-phase FX node', () => {
    const layer = setupRasterLayer()

    expect(addSharpenNode(1.5, 2)).toBe(true)
    expect(documentHistory.undoLabel).toBe('Add Sharpen')

    const updated = getLayer(useEditorSessionStore.getState().document, layer.id)
    expect(updated?.effects).toHaveLength(1)
    expect(updated?.effects[0]?.type).toBe('sharpen')
    if (updated?.effects[0]?.type === 'sharpen') {
      expect(updated.effects[0].amount).toBe(1.5)
      expect(updated.effects[0].radius).toBe(2)
    }
  })

  test('addAdjustmentFilterNode adds typed adjustment nodes', () => {
    const layer = setupRasterLayer()

    expect(
      addAdjustmentFilterNode({
        type: 'brightness-contrast',
        brightness: 0.1,
        contrast: -0.2,
      }),
    ).toBe(true)
    expect(documentHistory.undoLabel).toBe('Add Brightness/Contrast')

    let updated = getLayer(useEditorSessionStore.getState().document, layer.id)
    expect(updated?.effects[0]?.type).toBe('adjustment')
    if (updated?.effects[0]?.type === 'adjustment') {
      expect(updated.effects[0].adjustment.type).toBe('brightness-contrast')
    }

    expect(
      addAdjustmentFilterNode({
        type: 'hue-saturation',
        hueDeg: 15,
        saturation: 0.2,
        lightness: 0,
      }),
    ).toBe(true)
    expect(documentHistory.undoLabel).toBe('Add Hue/Saturation')

    expect(
      addAdjustmentFilterNode({
        type: 'levels',
        black: 10,
        white: 240,
        gamma: 1.2,
      }),
    ).toBe(true)
    expect(documentHistory.undoLabel).toBe('Add Levels')

    updated = getLayer(useEditorSessionStore.getState().document, layer.id)
    expect(updated?.effects).toHaveLength(3)
  })

  test('content filter commands refuse adjustment layers', () => {
    const adjustment = createAdjustmentLayer({ name: 'Adj' })
    const doc = addLayer(createEmptyDocument({ width: 32, height: 32 }), adjustment)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [adjustment.id],
    })

    expect(addSharpenNode(1, 1)).toBe(false)
    expect(
      addAdjustmentFilterNode({
        type: 'levels',
        black: 0,
        white: 255,
        gamma: 1,
      }),
    ).toBe(false)
  })

  test('content filter commands accept text layers', () => {
    const text = createTextLayer({ name: 'T' })
    const doc = addLayer(createEmptyDocument({ width: 32, height: 32 }), text)
    useEditorSessionStore.setState({ document: doc, selectedLayerIds: [text.id] })

    expect(
      addAdjustmentFilterNode({
        type: 'brightness-contrast',
        brightness: 0,
        contrast: 0,
      }),
    ).toBe(true)
  })
})
