import { beforeEach, describe, expect, test } from 'bun:test'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
  getLayer,
  type LayerId,
} from '../../core/document'
import { documentHistory, resetDocumentHistory } from './documentHistory'
import { useEditorSessionStore } from './EditorSessionStore'
import { nudgeSelectedLayers } from './nudgeLayers'

function seedLayer(): LayerId {
  const layer = createRasterLayer({ pixels: asRasterAssetRef('nudge-asset') })
  const doc = addLayer(createEmptyDocument({ width: 64, height: 48 }), layer)
  useEditorSessionStore.setState({
    document: doc,
    dirty: false,
    selectedLayerIds: [layer.id],
  })
  return layer.id
}

function transformOf(id: LayerId) {
  return getLayer(useEditorSessionStore.getState().document, id)!.transform
}

describe('nudgeSelectedLayers', () => {
  beforeEach(() => {
    resetDocumentHistory()
  })

  test('offsets the selected layer transform', () => {
    const id = seedLayer()
    expect(nudgeSelectedLayers(-1, 0)).toBe(true)
    expect(transformOf(id).x).toBe(-1)
    expect(transformOf(id).y).toBe(0)

    expect(nudgeSelectedLayers(0, 10)).toBe(true)
    expect(transformOf(id).y).toBe(10)
  })

  test('coalesces consecutive nudges into one undo step', async () => {
    const id = seedLayer()
    nudgeSelectedLayers(1, 0)
    nudgeSelectedLayers(1, 0)
    nudgeSelectedLayers(1, 0)
    expect(transformOf(id).x).toBe(3)
    expect(documentHistory.undoCount).toBe(1)

    await documentHistory.undo()
    expect(transformOf(id).x).toBe(0)
  })

  test('is a no-op without a selection', () => {
    seedLayer()
    useEditorSessionStore.setState({ selectedLayerIds: [] })
    expect(nudgeSelectedLayers(1, 1)).toBe(false)
    expect(documentHistory.undoCount).toBe(0)
  })

  test('ignores a zero delta', () => {
    seedLayer()
    expect(nudgeSelectedLayers(0, 0)).toBe(false)
    expect(documentHistory.undoCount).toBe(0)
  })
})
