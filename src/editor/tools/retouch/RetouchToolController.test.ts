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
import { resetDocumentHistory, documentHistory } from '../../session/documentHistory'
import { createRasterEntry } from '../../../core/history/rasterEntry'
import { samplePattern } from '../../../rendering/effects/patterns'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { useSelectionStore } from '../../session/selectionStore'
import { useRetouchSettingsStore } from './retouchSettingsStore'
import { RetouchToolController } from './RetouchToolController'

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

function patternPixel(x: number, y: number): number[] {
  const value = samplePattern(x, y, { kind: 'checker', scale: 100, angle: 0, invert: false })
  const gray = Math.round((0.15 + value * 0.7) * 255)
  return [gray, gray, gray, 255]
}

function pushRetouchHistory(surface: TiledRasterSurface, label: string, x: number, y: number): void {
  surface.beginStrokeCapture()
  surface.retouchDab({ kind: 'blur', x, y, radius: 1, strength: 1 })
  documentHistory.push(createRasterEntry({ label, patch: surface.endStrokeCapture() }))
}

function pixel(surface: TiledRasterSurface, x: number, y: number): number[] {
  const data = surface.toRgbaBuffer().data
  const i = (y * surface.width + x) * 4
  return [...data.slice(i, i + 4)]
}

function seedTwoLayerDoc(): { topSurface: TiledRasterSurface; bottomSurface: TiledRasterSurface } {
  const bottom = createRasterLayer({
    name: 'Bottom',
    pixels: asRasterAssetRef('bottom'),
  })
  const top = createRasterLayer({
    name: 'Top',
    pixels: asRasterAssetRef('top'),
    transform: { x: 16, y: 16, scaleX: 1, scaleY: 1, rotationDeg: 0, skewXDeg: 0, skewYDeg: 0 },
  })
  const doc = addLayer(addLayer(createEmptyDocument({ width: 32, height: 32 }), bottom), top)

  const bottomSurface = new TiledRasterSurface('bottom', 32, 32)
  const topSurface = new TiledRasterSurface('top', 32, 32)
  setEditableSurface(bottomSurface)
  setEditableSurface(topSurface)

  useEditorSessionStore.setState({
    document: doc,
    selectedLayerIds: [top.id],
    dirty: false,
  })
  return { topSurface, bottomSurface }
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

describe('RetouchToolController stamp variants', () => {
  let restoreCanvasStubs: () => void

  beforeEach(() => {
    restoreCanvasStubs = installCanvasStubs()
    clearEditableSurfaces()
    resetDocumentHistory()
    useSelectionStore.setState({ marquee: null, lastMarquee: null, mask: null, lastMask: null })
    useRetouchSettingsStore.setState({ size: 3, strength: 1, aligned: false, sampleAllLayers: false })
  })

  afterEach(() => {
    restoreCanvasStubs()
  })

  test('history brush captures the layer on first use and restores that snapshot', async () => {
    const surface = seedSingleLayerDoc()
    surface.writeRegion(
      { x: 8, y: 8, width: 1, height: 1 },
      new Uint8ClampedArray([240, 20, 10, 255]),
    )

    const history = new RetouchToolController('history', () => {})
    expect(await history.pointerDown(8, 8, false)).toBe(true)
    await history.pointerUp()

    surface.writeRegion(
      { x: 8, y: 8, width: 1, height: 1 },
      new Uint8ClampedArray([255, 255, 255, 255]),
    )

    expect(await history.pointerDown(8, 8, false)).toBe(true)
    await history.pointerUp()

    expect(pixel(surface, 8, 8)).toEqual([240, 20, 10, 255])
  })

  test('history brush can paint from a selected history depth', async () => {
    const surface = seedSingleLayerDoc()
    surface.writeRegion(
      { x: 8, y: 8, width: 1, height: 1 },
      new Uint8ClampedArray([240, 20, 10, 255]),
    )
    pushRetouchHistory(surface, 'Blur dab', 8, 8)

    useRetouchSettingsStore.setState({ historySourceDepth: 0 })
    const history = new RetouchToolController('history', () => {})
    expect(await history.pointerDown(8, 8, false)).toBe(true)
    await history.pointerUp()

    expect(pixel(surface, 8, 8)).toEqual([240, 20, 10, 255])
  })

  test('pattern stamp paints the selected checker pattern', async () => {
    const surface = seedSingleLayerDoc()
    const pattern = new RetouchToolController('pattern', () => {})

    expect(await pattern.pointerDown(6, 6, false)).toBe(true)
    await pattern.pointerUp()

    expect(pixel(surface, 6, 6)).toEqual(patternPixel(6, 6))
  })

  test('pattern stamp honors the selected procedural pattern kind', async () => {
    const surface = seedSingleLayerDoc()
    useRetouchSettingsStore.setState({ patternKind: 'stripes', patternScale: 100, patternAngle: 0 })
    const pattern = new RetouchToolController('pattern', () => {})

    expect(await pattern.pointerDown(6, 6, false)).toBe(true)
    await pattern.pointerUp()

    const painted = pixel(surface, 6, 6)
    expect(painted[0]).toBe(painted[1])
    expect(painted[1]).toBe(painted[2])
    expect(painted[0]).not.toBe(234)
  })

  test('dodge and sponge honor protect tones and saturate prefs', async () => {
    const surface = seedSingleLayerDoc()
    const color = new Uint8ClampedArray([200, 40, 40, 255])
    surface.writeRegion({ x: 8, y: 8, width: 1, height: 1 }, color)

    useRetouchSettingsStore.setState({ protectTones: false })
    const linearDodge = new RetouchToolController('dodge', () => {})
    expect(await linearDodge.pointerDown(8, 8, false)).toBe(true)
    await linearDodge.pointerUp()
    const linear = pixel(surface, 8, 8)

    surface.writeRegion({ x: 8, y: 8, width: 1, height: 1 }, color)
    useRetouchSettingsStore.setState({ protectTones: true })
    const protectedDodge = new RetouchToolController('dodge', () => {})
    expect(await protectedDodge.pointerDown(8, 8, false)).toBe(true)
    await protectedDodge.pointerUp()
    const protectedResult = pixel(surface, 8, 8)
    expect(protectedResult[0]).toBeGreaterThan(linear[0]!)
    expect(protectedResult[1]).toBeLessThan(linear[1]!)
    expect(protectedResult[2]).toBeLessThan(linear[2]!)

    surface.writeRegion(
      { x: 10, y: 8, width: 1, height: 1 },
      new Uint8ClampedArray([200, 140, 140, 255]),
    )
    useRetouchSettingsStore.setState({ spongeMode: 'saturate' })
    const sponge = new RetouchToolController('sponge', () => {})
    expect(await sponge.pointerDown(10, 8, false)).toBe(true)
    await sponge.pointerUp()
    const saturated = pixel(surface, 10, 8)
    expect(saturated[0]).toBeGreaterThan(200)
    expect(saturated[1]).toBeLessThan(140)
  })
})

describe('RetouchToolController cross-layer sources', () => {
  let restoreCanvasStubs: () => void

  beforeEach(() => {
    restoreCanvasStubs = installCanvasStubs()
    clearEditableSurfaces()
    resetDocumentHistory()
    useSelectionStore.setState({ marquee: null, lastMarquee: null, mask: null, lastMask: null })
    useRetouchSettingsStore.setState({ size: 3, strength: 1, aligned: false, sampleAllLayers: false })
  })

  afterEach(() => {
    restoreCanvasStubs()
  })

  test('clone stamp samples the visible layer under Alt-click', async () => {
    const { bottomSurface, topSurface } = seedTwoLayerDoc()
    bottomSurface.writeRegion(
      { x: 8, y: 8, width: 1, height: 1 },
      new Uint8ClampedArray([240, 10, 10, 255]),
    )
    topSurface.writeRegion(
      { x: 4, y: 4, width: 1, height: 1 },
      new Uint8ClampedArray([10, 10, 240, 255]),
    )

    const clone = new RetouchToolController('clone', () => {})
    expect(await clone.pointerDown(8, 8, true)).toBe(true)
    expect(clone.hasCloneSource()).toBe(true)

    expect(await clone.pointerDown(20, 20, false)).toBe(true)
    clone.pointerMove(20, 20)
    await clone.pointerUp()

    const painted = pixel(topSurface, 4, 4)
    expect(painted[0]).toBeGreaterThan(200)
    expect(painted[2]).toBeLessThan(50)
  })

  test('healing brush blends source detail into destination tone', async () => {
    const { bottomSurface, topSurface } = seedTwoLayerDoc()
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        bottomSurface.writeRegion(
          { x, y, width: 1, height: 1 },
          new Uint8ClampedArray([20, 70, 180, 255]),
        )
        topSurface.writeRegion(
          { x, y, width: 1, height: 1 },
          new Uint8ClampedArray([180, 130, 80, 255]),
        )
      }
    }
    bottomSurface.writeRegion(
      { x: 8, y: 8, width: 1, height: 1 },
      new Uint8ClampedArray([255, 70, 180, 255]),
    )

    const heal = new RetouchToolController('heal', () => {})
    expect(await heal.pointerDown(8, 8, true)).toBe(true)

    expect(await heal.pointerDown(20, 20, false)).toBe(true)
    heal.pointerMove(20, 20)
    await heal.pointerUp()

    const healed = pixel(topSurface, 4, 4)
    expect(healed[0]).toBeGreaterThan(170)
    expect(healed[1]).toBe(130)
    expect(healed[2]).toBe(80)
  })

  test('clone stamp with sample all layers reads merged pixels through transparent top', async () => {
    const { bottomSurface, topSurface } = seedTwoLayerDoc()
    bottomSurface.writeRegion(
      { x: 8, y: 8, width: 1, height: 1 },
      new Uint8ClampedArray([240, 10, 10, 255]),
    )
    // Top layer is transparent at doc (8,8) but still owns the hit-test bounds.
    topSurface.writeRegion(
      { x: 4, y: 4, width: 1, height: 1 },
      new Uint8ClampedArray([10, 10, 240, 255]),
    )

    useRetouchSettingsStore.setState({ sampleAllLayers: true })
    const clone = new RetouchToolController('clone', () => {})
    expect(await clone.pointerDown(8, 8, true)).toBe(true)

    expect(await clone.pointerDown(20, 20, false)).toBe(true)
    clone.pointerMove(20, 20)
    await clone.pointerUp()

    const painted = pixel(topSurface, 4, 4)
    expect(painted[0]).toBeGreaterThan(200)
    expect(painted[2]).toBeLessThan(50)
  })

  test('healing brush with sample all layers blends merged source detail', async () => {
    const { bottomSurface, topSurface } = seedTwoLayerDoc()
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        bottomSurface.writeRegion(
          { x, y, width: 1, height: 1 },
          new Uint8ClampedArray([20, 70, 180, 255]),
        )
        topSurface.writeRegion(
          { x, y, width: 1, height: 1 },
          new Uint8ClampedArray([180, 130, 80, 255]),
        )
      }
    }
    bottomSurface.writeRegion(
      { x: 8, y: 8, width: 1, height: 1 },
      new Uint8ClampedArray([255, 70, 180, 255]),
    )

    useRetouchSettingsStore.setState({ sampleAllLayers: true })
    const heal = new RetouchToolController('heal', () => {})
    expect(await heal.pointerDown(8, 8, true)).toBe(true)

    expect(await heal.pointerDown(20, 20, false)).toBe(true)
    heal.pointerMove(20, 20)
    await heal.pointerUp()

    const healed = pixel(topSurface, 4, 4)
    expect(healed[0]).toBeGreaterThan(170)
    expect(healed[1]).toBe(130)
    expect(healed[2]).toBe(80)
  })
})
