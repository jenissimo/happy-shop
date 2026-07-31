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
import {
  clearEditableSurfaces,
  getEditableSurface,
  setEditableSurface,
} from '../../imaging/surfaces/EditableSurfaceStore'
import { TiledRasterSurface } from '../../imaging/surfaces/TiledRasterSurface'
import { documentHistory, resetDocumentHistory } from '../session/documentHistory'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { useSelectionStore } from '../session/selectionStore'
import { registerFilterCommands } from '../tools/crop/registerFilterCommands'
import {
  applyGaussianBlur,
  applyGaussianBlurDestructive,
  canApplyGaussianBlur,
} from './gaussianBlur'

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

describe('gaussianBlur', () => {
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
    useSelectionStore.setState({
      marquee: null,
      lastMarquee: null,
      mask: null,
      lastMask: null,
    })
  })

  afterEach(() => {
    restoreCanvasStubs()
  })

  test('canApplyGaussianBlur requires an unlocked paintable layer', () => {
    expect(canApplyGaussianBlur()).toBe(false)

    setupRasterLayer()
    expect(canApplyGaussianBlur()).toBe(true)

    const text = createTextLayer({ name: 'T' })
    const doc = addLayer(createEmptyDocument({ width: 32, height: 32 }), text)
    useEditorSessionStore.setState({ document: doc, selectedLayerIds: [text.id] })
    expect(canApplyGaussianBlur()).toBe(true)

    const adjustment = createAdjustmentLayer({ name: 'Adj' })
    const adjustmentDoc = addLayer(createEmptyDocument({ width: 32, height: 32 }), adjustment)
    useEditorSessionStore.setState({
      document: adjustmentDoc,
      selectedLayerIds: [adjustment.id],
    })
    expect(canApplyGaussianBlur()).toBe(false)
  })

  test('applyGaussianBlur adds a content-phase FX node', async () => {
    const { layer } = setupRasterLayer()

    expect(await applyGaussianBlur(3)).toBe(true)
    expect(documentHistory.canUndo).toBe(true)
    expect(documentHistory.undoLabel).toBe('Add Gaussian Blur')

    const updated = getLayer(useEditorSessionStore.getState().document, layer.id)
    expect(updated?.effects).toHaveLength(1)
    expect(updated?.effects[0]?.type).toBe('gaussian-blur')
    if (updated?.effects[0]?.type === 'gaussian-blur') {
      expect(updated.effects[0].radius).toBe(3)
    }

    await documentHistory.undo()
    expect(getLayer(useEditorSessionStore.getState().document, layer.id)?.effects).toHaveLength(0)
  })

  test('applyGaussianBlurDestructive blurs raster pixels in one undo step', async () => {
    const { surface } = setupRasterLayer()
    surface.writeRegion(
      { x: 16, y: 16, width: 1, height: 1 },
      new Uint8ClampedArray([255, 0, 0, 255]),
    )

    expect(await applyGaussianBlurDestructive(3)).toBe(true)
    expect(documentHistory.undoLabel).toBe('Gaussian Blur')

    const blurred = getEditableSurface('px1')!.toRgbaBuffer().data
    const center = blurred[(16 * 32 + 16) * 4]!
    expect(center).toBeGreaterThan(0)
    expect(center).toBeLessThan(255)
  })

  test('filter.blur.gaussian command is registered and gated on layer type', () => {
    const registry = new CommandRegistry()
    registerFilterCommands(registry)
    const command = registry.get('filter.blur.gaussian')
    expect(command?.title).toBe('Gaussian Blur…')
    expect(command?.enabled()).toBe(false)

    setupRasterLayer()
    expect(command?.enabled()).toBe(true)
  })
})
