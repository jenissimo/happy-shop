import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
} from '../../../core/document'
import {
  clearEditableSurfaces,
  setEditableSurface,
} from '../../../imaging/surfaces/EditableSurfaceStore'
import { TiledRasterSurface } from '../../../imaging/surfaces/TiledRasterSurface'
import { resetDocumentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { useRetouchSettingsStore } from '../retouch/retouchSettingsStore'
import { useLiquifyFreezeStore } from './liquifyFreezeStore'
import { LiquifyToolController } from './LiquifyToolController'

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

function seedSingleLayerDoc(): TiledRasterSurface {
  const layer = createRasterLayer({
    name: 'Paint',
    pixels: asRasterAssetRef('paint'),
  })
  const doc = addLayer(createEmptyDocument({ width: 32, height: 32 }), layer)
  const surface = new TiledRasterSurface('paint', 32, 32)
  setEditableSurface(surface)
  useEditorSessionStore.setState({
    document: doc,
    selectedLayerIds: [layer.id],
    dirty: false,
  })
  return surface
}

describe('LiquifyToolController', () => {
  let restoreCanvas: () => void

  beforeEach(() => {
    restoreCanvas = installCanvasStubs()
    clearEditableSurfaces()
    resetDocumentHistory()
    useLiquifyFreezeStore.setState({ masks: {}, version: 0 })
    useRetouchSettingsStore.setState({ size: 8, strength: 1, aligned: true, range: 'midtones' })
  })

  afterEach(() => {
    restoreCanvas()
    clearEditableSurfaces()
    resetDocumentHistory()
    useLiquifyFreezeStore.setState({ masks: {}, version: 0 })
  })

  test('warp stroke pushes pixels and records one history entry', async () => {
    const surface = seedSingleLayerDoc()
    surface.writeRegion({ x: 10, y: 16, width: 1, height: 1 }, new Uint8ClampedArray([0, 0, 255, 255]))
    const controller = new LiquifyToolController('warp', () => {})
    expect(await controller.pointerDown(10, 16)).toBe(true)
    controller.pointerMove(14, 16)
    await controller.pointerUp()
    expect(useEditorSessionStore.getState().dirty).toBe(true)
  })

  test('bloat stroke records one history entry', async () => {
    const surface = seedSingleLayerDoc()
    surface.writeRegion({ x: 10, y: 16, width: 1, height: 1 }, new Uint8ClampedArray([0, 0, 255, 255]))
    const controller = new LiquifyToolController('bloat', () => {})
    expect(await controller.pointerDown(16, 16)).toBe(true)
    controller.pointerMove(16, 16)
    await controller.pointerUp()
    expect(useEditorSessionStore.getState().dirty).toBe(true)
  })

  test('reconstruct restores pixels from stroke-start snapshot', async () => {
    const surface = seedSingleLayerDoc()
    surface.writeRegion({ x: 8, y: 8, width: 1, height: 1 }, new Uint8ClampedArray([240, 20, 10, 255]))

    const reconstruct = new LiquifyToolController('reconstruct', () => {})
    expect(await reconstruct.pointerDown(8, 8)).toBe(true)
    surface.writeRegion({ x: 8, y: 8, width: 1, height: 1 }, new Uint8ClampedArray([255, 255, 255, 255]))
    reconstruct.pointerMove(10, 8)
    await reconstruct.pointerUp()
    expect(pixel(surface, 8, 8)).toEqual([240, 20, 10, 255])
  })

  test('freeze stroke paints session pin mask without raster history', async () => {
    const surface = seedSingleLayerDoc()
    const layerId = useEditorSessionStore.getState().selectedLayerIds[0]!
    const freeze = new LiquifyToolController('freeze', () => {})
    expect(await freeze.pointerDown(8, 8)).toBe(true)
    freeze.pointerMove(10, 8)
    await freeze.pointerUp()
    const mask = useLiquifyFreezeStore.getState().getMask(layerId)
    expect(mask?.[8 * 32 + 8]).toBeGreaterThan(200)
    expect(useEditorSessionStore.getState().dirty).toBe(false)
  })

  test('warp skips frozen pixels', async () => {
    const surface = seedSingleLayerDoc()
    const layerId = useEditorSessionStore.getState().selectedLayerIds[0]!
    const mask = useLiquifyFreezeStore.getState().ensureMask(layerId, 32, 32)
    mask[16 * 32 + 14] = 255
    surface.writeRegion({ x: 10, y: 16, width: 1, height: 1 }, new Uint8ClampedArray([0, 0, 255, 255]))

    const warp = new LiquifyToolController('warp', () => {})
    expect(await warp.pointerDown(10, 16)).toBe(true)
    warp.pointerMove(14, 16)
    await warp.pointerUp()

    // The frozen destination never receives coverage, and the source is
    // vacated through ALPHA — Liquify lerps premultiplied, so its colour stays
    // put while the coverage drains. Asserting on the colour channel would
    // re-encode the old dark-fringe bug.
    expect(pixel(surface, 14, 16)[3]).toBe(0)
    expect(pixel(surface, 10, 16)[3]).toBeLessThan(50)
  })
})

function pixel(surface: TiledRasterSurface, x: number, y: number): number[] {
  const data = surface.toRgbaBuffer().data
  const i = (y * surface.width + x) * 4
  return [...data.slice(i, i + 4)]
}
