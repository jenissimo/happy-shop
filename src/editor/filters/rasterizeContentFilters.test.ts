import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { CommandRegistry } from '../../core/commands/registry'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
  getLayer,
} from '../../core/document'
import {
  clearEditableSurfaces,
  getEditableSurface,
  setEditableSurface,
} from '../../imaging/surfaces/EditableSurfaceStore'
import { TiledRasterSurface } from '../../imaging/surfaces/TiledRasterSurface'
import { documentHistory, resetDocumentHistory } from '../session/documentHistory'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { registerFilterCommands } from '../tools/crop/registerFilterCommands'
import { createDefaultEffect } from '../../ui/features/layer-style/defaults'
import { addGaussianBlurNode } from './contentFilters'
import {
  canRasterizeContentFilters,
  layerHasContentFilters,
  rasterizeContentFilters,
} from './rasterizeContentFilters'

class TestCanvas {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  getContext() {
    return { putImageData() {} }
  }
}

class TestImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

function installCanvasStubs(): () => void {
  const globals = globalThis as typeof globalThis & {
    OffscreenCanvas?: typeof OffscreenCanvas
    ImageData?: typeof ImageData
    createImageBitmap?: typeof createImageBitmap
  }
  const prior = {
    OffscreenCanvas: globals.OffscreenCanvas,
    ImageData: globals.ImageData,
    createImageBitmap: globals.createImageBitmap,
  }
  globals.OffscreenCanvas = TestCanvas as unknown as typeof OffscreenCanvas
  globals.ImageData = TestImageData as unknown as typeof ImageData
  globals.createImageBitmap = (async () =>
    ({ close() {} }) as ImageBitmap) as typeof createImageBitmap
  return () => {
    globals.OffscreenCanvas = prior.OffscreenCanvas
    globals.ImageData = prior.ImageData
    globals.createImageBitmap = prior.createImageBitmap
  }
}

function setupRasterLayer(surfaceId = 'px1'): {
  layer: ReturnType<typeof createRasterLayer>
  surface: TiledRasterSurface
} {
  const layer = createRasterLayer({
    name: 'L',
    pixels: asRasterAssetRef(surfaceId),
  })
  const surface = new TiledRasterSurface(surfaceId, 32, 32)
  setEditableSurface(surface)
  const doc = addLayer(createEmptyDocument({ width: 32, height: 32 }), layer)
  useEditorSessionStore.setState({
    document: doc,
    selectedLayerIds: [layer.id],
  })
  return { layer, surface }
}

describe('rasterizeContentFilters', () => {
  let restoreCanvasStubs: () => void

  beforeEach(() => {
    restoreCanvasStubs = installCanvasStubs()
    clearEditableSurfaces()
    resetDocumentHistory()
    useEditorSessionStore.setState({
      document: createEmptyDocument({ width: 32, height: 32 }),
      dirty: false,
      selectedLayerIds: [],
      historyVersion: documentHistory.version,
      rasterEpoch: 0,
    })
  })

  afterEach(() => {
    restoreCanvasStubs()
  })

  test('canRasterizeContentFilters requires content nodes on an unlocked raster layer', () => {
    expect(canRasterizeContentFilters()).toBe(false)

    const { layer } = setupRasterLayer()
    expect(canRasterizeContentFilters()).toBe(false)

    addGaussianBlurNode(3)
    expect(canRasterizeContentFilters()).toBe(true)
    expect(layerHasContentFilters(getLayer(useEditorSessionStore.getState().document, layer.id)?.effects)).toBe(
      true,
    )
  })

  test('rasterizeContentFilters bakes blur into pixels and clears content nodes in one undo step', async () => {
    const { layer, surface } = setupRasterLayer()
    surface.writeRegion(
      { x: 16, y: 16, width: 1, height: 1 },
      new Uint8ClampedArray([255, 0, 0, 255]),
    )

    addGaussianBlurNode(3)
    expect(await rasterizeContentFilters()).toBe(true)
    expect(documentHistory.undoLabel).toBe('Rasterize Filters')

    const updated = getLayer(useEditorSessionStore.getState().document, layer.id)
    expect(updated?.effects).toHaveLength(0)

    const baked = getEditableSurface('px1')!.toRgbaBuffer().data
    const center = baked[(16 * 32 + 16) * 4]!
    expect(center).toBeGreaterThan(0)
    expect(center).toBeLessThan(255)

    await documentHistory.undo()
    expect(getLayer(useEditorSessionStore.getState().document, layer.id)?.effects).toHaveLength(1)
    const restored = getEditableSurface('px1')!.toRgbaBuffer().data
    expect(restored[(16 * 32 + 16) * 4]).toBe(255)
  })

  test('rasterizeContentFilters preserves style-phase Layer Styles', async () => {
    const { layer, surface } = setupRasterLayer()
    surface.writeRegion(
      { x: 16, y: 16, width: 1, height: 1 },
      new Uint8ClampedArray([255, 0, 0, 255]),
    )

    const stroke = createDefaultEffect('stroke')
    stroke.enabled = true
    stroke.size = 2
    const doc = useEditorSessionStore.getState().document
    const withStroke = {
      ...doc,
      layers: {
        ...doc.layers,
        [layer.id]: {
          ...layer,
          effects: [stroke],
        },
      },
    }
    useEditorSessionStore.setState({ document: withStroke })
    addGaussianBlurNode(3)

    expect(await rasterizeContentFilters()).toBe(true)
    const updated = getLayer(useEditorSessionStore.getState().document, layer.id)
    expect(updated?.effects).toHaveLength(1)
    expect(updated?.effects[0]?.type).toBe('stroke')
  })

  test('filter.rasterize command is registered and gated on content nodes', () => {
    const registry = new CommandRegistry()
    registerFilterCommands(registry)
    const command = registry.get('filter.rasterize')
    expect(command?.title).toBe('Rasterize Filters')
    expect(command?.enabled()).toBe(false)

    setupRasterLayer()
    expect(command?.enabled()).toBe(false)

    addGaussianBlurNode(2)
    expect(command?.enabled()).toBe(true)
  })
})
