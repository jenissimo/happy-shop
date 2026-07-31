import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { CommandRegistry } from '../../core/commands/registry'
import { registerFilterCommands } from '../tools/crop/registerFilterCommands'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
  getLayer,
} from '../../core/document'
import { documentHistory, resetDocumentHistory } from '../session/documentHistory'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { addNoiseNode } from './contentFilters'

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

describe('noise filter', () => {
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

    expect(addNoiseNode(0.25, 'gaussian', false)).toBe(true)
    expect(documentHistory.undoLabel).toBe('Add Noise')

    const updated = getLayer(useEditorSessionStore.getState().document, layer.id)
    expect(updated?.effects).toHaveLength(1)
    expect(updated?.effects[0]?.type).toBe('noise')
    if (updated?.effects[0]?.type === 'noise') {
      expect(updated.effects[0].amount).toBe(0.25)
      expect(updated.effects[0].distribution).toBe('gaussian')
      expect(updated.effects[0].monochromatic).toBe(false)
    }
  })

  test('filter.noise command is registered', () => {
    const registry = new CommandRegistry()
    registerFilterCommands(registry)
    expect(registry.get('filter.noise')?.title).toBe('Add Noise…')
  })

  test('filter.noise enabled when raster layer selected', () => {
    const registry = new CommandRegistry()
    registerFilterCommands(registry)
    expect(registry.get('filter.noise')?.enabled()).toBe(false)
    setupRasterLayer()
    expect(registry.get('filter.noise')?.enabled()).toBe(true)
  })
})
