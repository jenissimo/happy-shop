import { beforeEach, describe, expect, test } from 'bun:test'
import { CommandRegistry } from '../../core/commands/registry'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
} from '../../core/document'
import {
  clearEditableSurfaces,
  getEditableSurface,
  setEditableSurface,
} from '../../imaging/surfaces/EditableSurfaceStore'
import { TiledRasterSurface } from '../../imaging/surfaces/TiledRasterSurface'
import { documentHistory, resetDocumentHistory } from './documentHistory'
import {
  fillSelection,
  registerEditSelectionCommands,
} from './editSelectionCommands'
import { useEditorSessionStore } from './EditorSessionStore'
import { useSelectionStore } from './selectionStore'
import { useBrushSettingsStore } from '../tools/brush/brushSettingsStore'

describe('editSelectionCommands', () => {
  beforeEach(() => {
    clearEditableSurfaces()
    resetDocumentHistory()
    useBrushSettingsStore.setState({ color: '#ff0000' })
    useEditorSessionStore.setState({
      document: createEmptyDocument({ width: 32, height: 32 }),
      dirty: false,
      selectedLayerIds: [],
      historyVersion: documentHistory.version,
      rasterEpoch: 0,
    })
    useSelectionStore.setState({
      marquee: null,
      lastMarquee: null,
      mask: null,
      lastMask: null,
    })
  })

  test('edit.fill paints only under the selection', async () => {
    const layer = createRasterLayer({
      name: 'L',
      pixels: asRasterAssetRef('px1'),
    })
    const surface = new TiledRasterSurface('px1', 32, 32)
    setEditableSurface(surface)
    const doc = addLayer(createEmptyDocument({ width: 32, height: 32 }), layer)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [layer.id],
    })
    useSelectionStore.getState().setMarquee({
      x: 4,
      y: 4,
      width: 4,
      height: 4,
    })

    const registry = new CommandRegistry()
    registerEditSelectionCommands(registry)
    expect(registry.get('edit.fill')?.enabled()).toBe(true)
    expect(await fillSelection()).toBe(true)

    const after = getEditableSurface('px1')!
    const img = after.toRgbaBuffer()
    expect(img.data[(5 * 32 + 5) * 4]).toBe(255)
    expect(img.data[(5 * 32 + 5) * 4 + 3]).toBe(255)
    expect(img.data[(0 * 32 + 0) * 4 + 3]).toBe(0)
  })

  test('select.inverse flips the mask', () => {
    useSelectionStore.getState().setMarquee({
      x: 8,
      y: 8,
      width: 8,
      height: 8,
    })
    const registry = new CommandRegistry()
    registerEditSelectionCommands(registry)
    registry.run('select.inverse')
    expect(useSelectionStore.getState().mask?.contains(0, 0)).toBe(true)
    expect(useSelectionStore.getState().mask?.contains(10, 10)).toBe(false)
  })
})
