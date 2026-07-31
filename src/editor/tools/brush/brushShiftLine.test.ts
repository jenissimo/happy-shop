import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
} from '../../../core/document'
import { createDocumentFromDialog } from '../../../ui/features/new-document/createDocumentFromDialog'
import { createDefaultFormState } from '../../../ui/features/new-document/validation'
import { documentHistory, resetDocumentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import {
  clearEditableSurfaces,
  getEditableSurface,
  setEditableSurface,
} from '../../../imaging/surfaces/EditableSurfaceStore'
import { TiledRasterSurface } from '../../../imaging/surfaces/TiledRasterSurface'
import { BrushToolController } from './BrushToolController'
import { pressureSizeScale } from './pointerPressure'

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

describe('BrushToolController Shift-line', () => {
  let restoreCanvasStubs: () => void

  beforeEach(() => {
    restoreCanvasStubs = installCanvasStubs()
    resetDocumentHistory()
    clearEditableSurfaces()

    const assetId = 'brush-line-surface'
    const layer = createRasterLayer({
      name: 'Paint',
      pixels: asRasterAssetRef(assetId),
    })
    let document = createEmptyDocument({ name: 'Brush line' })
    document = addLayer(document, layer)
    useEditorSessionStore.setState({
      document,
      selectedLayerIds: [layer.id],
      dirty: false,
      historyVersion: documentHistory.version,
    })
    setEditableSurface(new TiledRasterSurface(assetId, 64, 64))
  })

  afterEach(() => {
    restoreCanvasStubs()
    clearEditableSurfaces()
    resetDocumentHistory()
  })

  test('samples a Shift line by spacing, records one history entry, and advances its anchor', async () => {
    const controller = new BrushToolController({
      size: 10,
      spacing: 0.25,
      hardness: 1,
    })
    await controller.pointerDown(10, 10)
    await controller.pointerUp()
    expect(controller.getAnchor()).toEqual({ x: 10, y: 10 })
    expect(documentHistory.undoCount).toBe(1)

    const editable = getEditableSurface('brush-line-surface')!
    let dabs = 0
    const stampTip = editable.stampTip.bind(editable)
    editable.stampTip = ((options) => {
      dabs++
      return stampTip(options)
    }) as typeof editable.stampTip

    await controller.pointerDown(20, 10, 1, { shift: true })
    await controller.pointerUp()

    expect(dabs).toBe(4)
    expect(documentHistory.undoCount).toBe(2)
    expect(documentHistory.undoLabel).toBe('Brush (line)')
    expect(controller.getAnchor()).toEqual({ x: 20, y: 10 })
  })

  test('stamps distinct pressure-scaled radii and keeps the spacing ratio coherent', async () => {
    const controller = new BrushToolController({
      size: 20,
      spacing: 0.25,
      hardness: 1,
      pressureControlsSize: true,
    })
    const editable = getEditableSurface('brush-line-surface')!
    const radii: number[] = []
    const stampTip = editable.stampTip.bind(editable)
    editable.stampTip = ((options) => {
      radii.push(options.radius)
      return stampTip(options)
    }) as typeof editable.stampTip

    await controller.pointerDown(10, 10, 0.1)
    await controller.pointerUp()
    await controller.pointerDown(30, 10, 0.5)
    await controller.pointerUp()
    await controller.pointerDown(50, 10, 1)
    await controller.pointerUp()

    expect(radii).toEqual([
      10 * pressureSizeScale(0.1, true),
      10 * pressureSizeScale(0.5, true),
      10 * pressureSizeScale(1, true),
    ])

    // A low-pressure move uses its scaled diameter for both stamps and spacing.
    radii.length = 0
    await controller.pointerDown(5, 30, 0.1)
    controller.pointerMove(15, 30, 0.1)
    await controller.pointerUp()
    expect(radii.length).toBeGreaterThan(2)
  })

  test('can paint the selected initial raster from a new document', async () => {
    const document = createDocumentFromDialog(createDefaultFormState())
    const layerId = document.rootChildren[0]!
    const layer = document.layers[layerId]!
    expect(layer.type).toBe('raster')
    if (layer.type !== 'raster') return

    setEditableSurface(
      new TiledRasterSurface(String(layer.pixels), document.canvas.width, document.canvas.height),
    )
    useEditorSessionStore.setState({
      document,
      selectedLayerIds: [layerId],
      dirty: false,
      historyVersion: documentHistory.version,
    })

    const controller = new BrushToolController({ size: 10, hardness: 1 })
    expect(await controller.pointerDown(10, 10)).toBe(true)
    await controller.pointerUp()
  })
})
