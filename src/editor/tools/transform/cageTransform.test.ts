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
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { SelectionMask } from '../../session/SelectionMask'
import { useSelectionStore } from '../../session/selectionStore'
import {
  CageTransformController,
  beginCageTransform,
  cancelCageTransform,
  commitCageTransform,
  setCageDensity,
  setCageFeatherRadius,
  useCageTransformStore,
} from './cageTransform'

const SURFACE_ID = 'px-cage-test'

function setupRasterDocument(): void {
  const layer = createRasterLayer({
    name: 'Raster',
    pixels: asRasterAssetRef(SURFACE_ID),
  })
  const surface = new TiledRasterSurface(SURFACE_ID, 64, 64)
  for (let y = 10; y < 30; y++) {
    for (let x = 10; x < 30; x++) {
      const tile = surface.readTiles({ x, y, width: 1, height: 1 })[0]!
      tile.data[0] = 200
      tile.data[1] = 50
      tile.data[2] = 10
      tile.data[3] = 255
    }
  }
  setEditableSurface(surface)
  useEditorSessionStore.setState({
    document: addLayer(createEmptyDocument({ width: 64, height: 64 }), layer),
    selectedLayerIds: [layer.id],
    dirty: false,
  })
}

describe('Cage Transform', () => {
  beforeEach(() => {
    setupRasterDocument()
    useSelectionStore.setState({
      marquee: null,
      lastMarquee: null,
      mask: null,
      lastMask: null,
    })
    useCageTransformStore.setState({
      session: null,
      activePoint: null,
      gesturing: false,
    })
  })

  afterEach(() => {
    clearEditableSurfaces()
  })

  test('begins a session on the active raster layer', async () => {
    expect(await beginCageTransform()).toBe(true)
    expect(useCageTransformStore.getState().session?.cage).toHaveLength(9)
  })

  test('requires a raster layer target', async () => {
    useEditorSessionStore.setState({ selectedLayerIds: [] })
    expect(await beginCageTransform()).toBe(false)
  })

  test('Esc cancels and clears the session', async () => {
    await beginCageTransform()
    expect(cancelCageTransform()).toBe(true)
    expect(useCageTransformStore.getState().session).toBeNull()
  })

  test('dragging a cage point updates the deformed cage', async () => {
    await beginCageTransform()
    const controller = new CageTransformController()
    const cage = useCageTransformStore.getState().session!.cage
    const target = cage[8]!
    expect(controller.pointerDown(target.x, target.y, 1, 1)).toBe(true)
    controller.pointerMove(target.x + 12, target.y + 8, 1)
    controller.pointerUp(1)
    const moved = useCageTransformStore.getState().session!.cage[8]!
    expect(moved.x).toBeCloseTo(target.x + 12, 0)
    expect(moved.y).toBeCloseTo(target.y + 8, 0)
  })

  test('commit ends the session', async () => {
    await beginCageTransform()
    expect(await commitCageTransform()).toBe(true)
    expect(useCageTransformStore.getState().session).toBeNull()
  })

  test('respects selection bounds when present', async () => {
    useSelectionStore.getState().setMask(
      SelectionMask.fromRect(64, 64, { x: 12, y: 12, width: 16, height: 16 }),
    )
    await beginCageTransform()
    const bounds = useCageTransformStore.getState().session!.docBounds
    expect(bounds.x).toBe(12)
    expect(bounds.y).toBe(12)
    expect(bounds.width).toBe(16)
    expect(bounds.height).toBe(16)
  })

  test('clicking a cage edge inserts a row', async () => {
    await beginCageTransform()
    const controller = new CageTransformController()
    const session = useCageTransformStore.getState().session!
    expect(session.rows).toBe(3)
    const midRow = {
      x: (session.cage[0]!.x + session.cage[3]!.x) / 2,
      y: (session.cage[0]!.y + session.cage[3]!.y) / 2,
    }
    expect(controller.pointerDown(midRow.x, midRow.y, 1, 1)).toBe(true)
    expect(controller.isDragging).toBe(false)
    expect(useCageTransformStore.getState().session!.rows).toBe(4)
  })

  test('Alt+click removes an internal cage point row', async () => {
    await beginCageTransform()
    const controller = new CageTransformController()
    const center = useCageTransformStore.getState().session!.cage[4]!
    expect(controller.pointerDown(center.x, center.y, 1, 1, true)).toBe(true)
    expect(useCageTransformStore.getState().session!.rows).toBe(2)
  })

  test('density preset rebuilds the cage grid', async () => {
    await beginCageTransform()
    expect(await setCageDensity(2)).toBe(true)
    const session = useCageTransformStore.getState().session!
    expect(session.cols).toBe(2)
    expect(session.rows).toBe(2)
    expect(session.cage).toHaveLength(4)
  })

  test('feather radius updates the session and clamps to max', async () => {
    await beginCageTransform()
    expect(await setCageFeatherRadius(6)).toBe(true)
    expect(useCageTransformStore.getState().session!.featherRadius).toBe(6)
    expect(await setCageFeatherRadius(999)).toBe(true)
    expect(useCageTransformStore.getState().session!.featherRadius).toBe(250)
    expect(await setCageFeatherRadius(-3)).toBe(true)
    expect(useCageTransformStore.getState().session!.featherRadius).toBe(0)
  })
})
