import { create } from 'zustand'
import type { CommandRegistry } from '../../../core/commands/registry'
import type { LayerId, Transform } from '../../../core/document'
import { getLayer, isLayerImageLocked } from '../../../core/document'
import { createRasterEntry } from '../../../core/history/rasterEntry'
import {
  buildDefaultCage,
  hitTestCageEdge,
  hitTestCagePoint,
  insertCageCol,
  insertCageRow,
  removeCagePoint,
  warpCageRegion,
  type WarpPoint,
} from '../../../imaging/warp/cageWarp'
import {
  ensureEditableSurface,
  syncEditableSurfaceToBitmap,
} from '../../../imaging/surfaces/EditableSurfaceStore'
import { TiledRasterSurface, type RasterPatch } from '../../../imaging/surfaces/TiledRasterSurface'
import { documentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { activeSelectionMask } from '../../session/selectionClip'
import { layerLocalToDocument } from '../brush/layerCoords'
import {
  buildDocSampleFn,
  captureDocRegion,
  layerLocalRegionFromDocBounds,
} from './cageSurfaceOps'

export const DEFAULT_CAGE_DENSITY = 3
export const CAGE_DENSITY_PRESETS = [2, 3, 4] as const
export const DEFAULT_CAGE_FEATHER_RADIUS = 0
export const MAX_CAGE_FEATHER_RADIUS = 250
export type CageDensityPreset = (typeof CAGE_DENSITY_PRESETS)[number]

export type CageTransformSession = {
  layerId: LayerId
  surfaceId: string
  transform: Transform
  docBounds: { x: number; y: number; width: number; height: number }
  baselinePixels: Uint8ClampedArray
  restCage: WarpPoint[]
  cage: WarpPoint[]
  cols: number
  rows: number
  featherRadius: number
  baselinePatch: RasterPatch | null
}

type CageTransformState = {
  session: CageTransformSession | null
  activePoint: number | null
  gesturing: boolean
  begin: (session: CageTransformSession) => void
  end: () => void
  setCage: (cage: WarpPoint[]) => void
  setCageTopology: (
    restCage: WarpPoint[],
    cage: WarpPoint[],
    cols: number,
    rows: number,
  ) => void
  setFeatherRadius: (featherRadius: number) => void
  setActivePoint: (index: number | null) => void
  setGesturing: (gesturing: boolean) => void
  setBaselinePatch: (patch: RasterPatch | null) => void
}

export const useCageTransformStore = create<CageTransformState>((set) => ({
  session: null,
  activePoint: null,
  gesturing: false,
  begin: (session) => set({ session, activePoint: null, gesturing: false }),
  end: () => set({ session: null, activePoint: null, gesturing: false }),
  setCage: (cage) =>
    set((state) => (state.session ? { session: { ...state.session, cage } } : state)),
  setCageTopology: (restCage, cage, cols, rows) =>
    set((state) =>
      state.session
        ? { session: { ...state.session, restCage, cage, cols, rows } }
        : state,
    ),
  setFeatherRadius: (featherRadius) =>
    set((state) =>
      state.session
        ? {
            session: {
              ...state.session,
              featherRadius: Math.max(
                0,
                Math.min(
                  MAX_CAGE_FEATHER_RADIUS,
                  Number.isFinite(featherRadius) ? featherRadius : DEFAULT_CAGE_FEATHER_RADIUS,
                ),
              ),
            },
          }
        : state,
    ),
  setActivePoint: (activePoint) => set({ activePoint }),
  setGesturing: (gesturing) => set({ gesturing }),
  setBaselinePatch: (baselinePatch) =>
    set((state) => (state.session ? { session: { ...state.session, baselinePatch } } : state)),
}))

function warpDocBounds(session: CageTransformSession): {
  x: number
  y: number
  width: number
  height: number
} {
  const { docBounds, restCage, cage } = session
  let minX = docBounds.x
  let minY = docBounds.y
  let maxX = docBounds.x + docBounds.width
  let maxY = docBounds.y + docBounds.height
  for (const p of [...restCage, ...cage]) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const pad = 2
  return {
    x: Math.floor(minX) - pad,
    y: Math.floor(minY) - pad,
    width: Math.ceil(maxX - minX) + pad * 2,
    height: Math.ceil(maxY - minY) + pad * 2,
  }
}

function coverageForSession(
  session: CageTransformSession,
  mask: ReturnType<typeof activeSelectionMask>,
): (localX: number, localY: number) => number {
  return (localX, localY) => {
    if (!mask) return 255
    const doc = layerLocalToDocument({ x: localX, y: localY }, session.transform)
    return mask.sample(doc.x, doc.y)
  }
}

async function applyWarpToSurface(session: CageTransformSession): Promise<RasterPatch | null> {
  const surface = await ensureEditableSurface(session.surfaceId)
  if (!surface) return null
  const canvas = useEditorSessionStore.getState().document.canvas
  const mask = activeSelectionMask(canvas.width, canvas.height)
  const coverage = coverageForSession(session, mask)

  const warped = warpCageRegion({
    source: session.baselinePixels,
    srcBounds: session.docBounds,
    restCage: session.restCage,
    deformedCage: session.cage,
    cols: session.cols,
    rows: session.rows,
    coverage: (localX, localY) => coverage(localX, localY),
    featherRadius: session.featherRadius,
  })

  const region = layerLocalRegionFromDocBounds(
    warpDocBounds(session),
    session.transform,
    surface.width,
    surface.height,
  )
  if (region.width < 1 || region.height < 1) return null

  const sample = buildDocSampleFn(
    session.transform,
    { docBounds: warped.bounds, data: warped.data },
    { docBounds: session.docBounds, data: session.baselinePixels },
    coverage,
  )

  const patch = surface.paintDocPixels({ region, sample })
  if (typeof OffscreenCanvas !== 'undefined') {
    await syncEditableSurfaceToBitmap(session.surfaceId)
  }
  useEditorSessionStore.getState().bumpRasterEpoch()
  return patch
}

function resolveDocBounds(
  layer: { transform: Transform },
  surfaceWidth: number,
  surfaceHeight: number,
  canvas: { width: number; height: number },
): { x: number; y: number; width: number; height: number } | null {
  const mask = activeSelectionMask(canvas.width, canvas.height)
  if (mask) {
    const b = mask.bounds()
    if (!b || b.width < 1 || b.height < 1) return null
    return {
      x: Math.floor(b.x),
      y: Math.floor(b.y),
      width: Math.ceil(b.width),
      height: Math.ceil(b.height),
    }
  }
  const corners = [
    { x: 0, y: 0 },
    { x: surfaceWidth, y: 0 },
    { x: 0, y: surfaceHeight },
    { x: surfaceWidth, y: surfaceHeight },
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of corners) {
    const doc = layerLocalToDocument(c, layer.transform)
    minX = Math.min(minX, doc.x)
    minY = Math.min(minY, doc.y)
    maxX = Math.max(maxX, doc.x)
    maxY = Math.max(maxY, doc.y)
  }
  const x = Math.max(0, Math.floor(minX))
  const y = Math.max(0, Math.floor(minY))
  const right = Math.min(canvas.width, Math.ceil(maxX))
  const bottom = Math.min(canvas.height, Math.ceil(maxY))
  const w = right - x
  const h = bottom - y
  if (w < 1 || h < 1) return null
  return { x, y, width: w, height: h }
}

export async function beginCageTransform(): Promise<boolean> {
  const session = useEditorSessionStore.getState()
  const layerId = session.selectedLayerIds[0]
  if (!layerId) return false
  const layer = getLayer(session.document, layerId)
  if (!layer || layer.type !== 'raster' || isLayerImageLocked(layer)) return false

  const surface = await ensureEditableSurface(
    String(layer.pixels),
    session.document.canvas,
  )
  if (!surface) return false

  const docBounds = resolveDocBounds(
    layer,
    surface.width,
    surface.height,
    session.document.canvas,
  )
  if (!docBounds) return false

  const mask = activeSelectionMask(
    session.document.canvas.width,
    session.document.canvas.height,
  )
  const coverage = (localX: number, localY: number) => {
    if (!mask) return 255
    const doc = layerLocalToDocument({ x: localX, y: localY }, layer.transform)
    return mask.sample(doc.x, doc.y)
  }

  const baselinePixels = captureDocRegion(surface, layer.transform, docBounds, coverage)
  const cols = DEFAULT_CAGE_DENSITY
  const rows = DEFAULT_CAGE_DENSITY
  const restCage = buildDefaultCage(docBounds, cols, rows)

  useCageTransformStore.getState().begin({
    layerId,
    surfaceId: String(layer.pixels),
    transform: { ...layer.transform },
    docBounds,
    baselinePixels,
    restCage,
    cage: restCage.map((p) => ({ ...p })),
    cols,
    rows,
    featherRadius: DEFAULT_CAGE_FEATHER_RADIUS,
    baselinePatch: null,
  })
  return true
}

export async function setCageDensity(density: CageDensityPreset): Promise<boolean> {
  const store = useCageTransformStore.getState()
  const session = store.session
  if (!session) return false

  const restCage = buildDefaultCage(session.docBounds, density, density)
  store.setCageTopology(
    restCage,
    restCage.map((p) => ({ ...p })),
    density,
    density,
  )

  const updated = useCageTransformStore.getState().session
  if (!updated) return false
  await applyWarpAndRefreshPreview(updated)
  return true
}

export async function setCageFeatherRadius(radius: number): Promise<boolean> {
  const store = useCageTransformStore.getState()
  if (!store.session) return false
  store.setFeatherRadius(radius)
  const updated = useCageTransformStore.getState().session
  if (!updated) return false
  await applyWarpAndRefreshPreview(updated)
  return true
}

async function applyWarpAndRefreshPreview(session: CageTransformSession): Promise<void> {
  const surface = await ensureEditableSurface(session.surfaceId)
  if (!surface) return

  const region = layerLocalRegionFromDocBounds(
    warpDocBounds(session),
    session.transform,
    surface.width,
    surface.height,
  )

  if (!session.baselinePatch) {
    const before = surface.snapshotRegion(region)
    await applyWarpToSurface(session)
    const after = surface.snapshotRegion(region)
    const merged = TiledRasterSurface.mergePatches(session.surfaceId, [before, after])
    useCageTransformStore.getState().setBaselinePatch(merged)
    return
  }

  surface.applyPatch(session.baselinePatch, 'undo')
  await applyWarpToSurface(session)
}

export function registerCageTransformCommand(registry: CommandRegistry): void {
  registry.register({
    id: 'edit.transform.cage',
    title: 'Cage Transform',
    enabled: () => {
      if (useCageTransformStore.getState().session) return true
      const session = useEditorSessionStore.getState()
      const layerId = session.selectedLayerIds[0]
      if (!layerId) return false
      const layer = getLayer(session.document, layerId)
      return !!layer && layer.type === 'raster' && !isLayerImageLocked(layer)
    },
    run: () => {
      if (useCageTransformStore.getState().session) {
        void commitCageTransform()
        return
      }
      void beginCageTransform()
    },
  })

  for (const density of CAGE_DENSITY_PRESETS) {
    registry.register({
      id: `edit.transform.cage.density.${density}`,
      title: `Cage Density ${density}×${density}`,
      enabled: () => useCageTransformStore.getState().session !== null,
      run: () => {
        void setCageDensity(density)
      },
    })
  }
}

export async function commitCageTransform(): Promise<boolean> {
  const session = useCageTransformStore.getState().session
  if (!session) return false

  let patch = session.baselinePatch
  const surface = await ensureEditableSurface(session.surfaceId)
  if (surface && patch) {
    const region = layerLocalRegionFromDocBounds(
      warpDocBounds(session),
      session.transform,
      surface.width,
      surface.height,
    )
    const after = surface.snapshotRegion(region)
    patch = TiledRasterSurface.mergePatches(session.surfaceId, [
      { ...patch, tiles: patch.tiles.map((t) => ({ ...t, after: t.before })) },
      after,
    ])
  }

  if (patch && patch.tiles.length > 0) {
    documentHistory.push(
      createRasterEntry({
        label: 'Cage Transform',
        patch,
        onInvalidated: () => {
          useEditorSessionStore.getState().bumpRasterEpoch()
        },
      }),
    )
    useEditorSessionStore.setState({
      dirty: true,
      historyVersion: documentHistory.version,
    })
  }

  useCageTransformStore.getState().end()
  return true
}

export function cancelCageTransform(): boolean {
  const session = useCageTransformStore.getState().session
  if (!session) return false
  void (async () => {
    const surface = await ensureEditableSurface(session.surfaceId)
    if (surface && session.baselinePatch) {
      surface.applyPatch(session.baselinePatch, 'undo')
      if (typeof OffscreenCanvas !== 'undefined') {
        await syncEditableSurfaceToBitmap(session.surfaceId)
      }
      useEditorSessionStore.getState().bumpRasterEpoch()
    } else if (surface) {
      const canvas = useEditorSessionStore.getState().document.canvas
      const mask = activeSelectionMask(canvas.width, canvas.height)
      const coverage = coverageForSession(session, mask)
      const region = layerLocalRegionFromDocBounds(
        session.docBounds,
        session.transform,
        surface.width,
        surface.height,
      )
      const sample = (localX: number, localY: number) => {
        const cover = coverage(localX, localY)
        if (cover <= 0) return null
        const doc = layerLocalToDocument({ x: localX, y: localY }, session.transform)
        const lx = doc.x - session.docBounds.x
        const ly = doc.y - session.docBounds.y
        const w = session.docBounds.width
        const h = session.docBounds.height
        if (lx < 0 || ly < 0 || lx >= w || ly >= h) return null
        const i = (Math.floor(ly) * w + Math.floor(lx)) * 4
        const a = session.baselinePixels[i + 3]!
        if (a <= 0) return null
        return [
          session.baselinePixels[i]!,
          session.baselinePixels[i + 1]!,
          session.baselinePixels[i + 2]!,
          Math.round((a * cover) / 255),
        ] as [number, number, number, number]
      }
      surface.paintDocPixels({ region, sample })
      if (typeof OffscreenCanvas !== 'undefined') {
        await syncEditableSurfaceToBitmap(session.surfaceId)
      }
      useEditorSessionStore.getState().bumpRasterEpoch()
    }
  })()
  useCageTransformStore.getState().end()
  return true
}

type Gesture = { pointerId: number; pointIndex: number }

export class CageTransformController {
  private gesture: Gesture | null = null

  get isDragging(): boolean {
    return this.gesture !== null
  }

  pointerDown(
    docX: number,
    docY: number,
    pointerId: number,
    zoom: number,
    altKey = false,
  ): boolean {
    const state = useCageTransformStore.getState()
    if (!state.session) return false
    const doc = { x: docX, y: docY }
    const hitRadius = 8 / Math.max(zoom, 0.02)
    const edgeRadius = 6 / Math.max(zoom, 0.02)
    const { session } = state

    const pointHit = hitTestCagePoint(doc, session.cage, hitRadius)
    if (pointHit >= 0) {
      if (altKey) {
        const next = removeCagePoint(
          session.restCage,
          session.cage,
          session.cols,
          session.rows,
          pointHit,
        )
        if (!next) return false
        state.setCageTopology(next.restCage, next.cage, next.cols, next.rows)
        void applyWarpAndRefreshPreview(useCageTransformStore.getState().session!)
        return true
      }
      this.gesture = { pointerId, pointIndex: pointHit }
      state.setActivePoint(pointHit)
      state.setGesturing(true)
      return true
    }

    const edgeHit = hitTestCageEdge(doc, session.cage, session.cols, session.rows, edgeRadius)
    if (!edgeHit) return false

    const next =
      edgeHit.kind === 'h'
        ? insertCageRow(session.restCage, session.cage, session.cols, session.rows, edgeHit.afterRow)
        : insertCageCol(session.restCage, session.cage, session.cols, session.rows, edgeHit.afterCol)
    if (!next) return false

    state.setCageTopology(next.restCage, next.cage, next.cols, next.rows)
    void applyWarpAndRefreshPreview(useCageTransformStore.getState().session!)
    return true
  }

  pointerMove(docX: number, docY: number, pointerId: number): void {
    const gesture = this.gesture
    const store = useCageTransformStore.getState()
    if (!gesture || !store.session || gesture.pointerId !== pointerId) return
    const cage = store.session.cage.map((p, i) =>
      i === gesture.pointIndex ? { x: docX, y: docY } : p,
    )
    store.setCage(cage)
    const updated = useCageTransformStore.getState().session
    if (updated) void applyWarpAndRefreshPreview(updated)
  }

  pointerUp(pointerId: number): void {
    if (!this.gesture || this.gesture.pointerId !== pointerId) return
    this.gesture = null
    useCageTransformStore.getState().setGesturing(false)
    useCageTransformStore.getState().setActivePoint(null)
  }

  cancelGesture(): void {
    this.gesture = null
    useCageTransformStore.getState().setGesturing(false)
    useCageTransformStore.getState().setActivePoint(null)
  }
}
