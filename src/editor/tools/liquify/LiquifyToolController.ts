import { createRasterEntry } from '../../../core/history/rasterEntry'
import { getLayer, isLayerImageLocked, type Transform } from '../../../core/document'
import {
  ensureEditableSurface,
  scheduleEditableSurfaceFlush,
  cancelEditableSurfaceFlush,
  syncEditableSurfaceToBitmap,
} from '../../../imaging/surfaces/EditableSurfaceStore'
import { TiledRasterSurface } from '../../../imaging/surfaces/TiledRasterSurface'
import { walkStroke } from '../../../imaging/brushes/strokeWalk'
import { documentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { buildPaintClip } from '../../session/paintClip'
import { documentToLayerLocal } from '../brush/layerCoords'
import { useRetouchSettingsStore } from '../retouch/retouchSettingsStore'
import { useLiquifyFreezeStore } from './liquifyFreezeStore'

export type LiquifyKind =
  | 'warp'
  | 'reconstruct'
  | 'bloat'
  | 'pucker'
  | 'twirl'
  | 'freeze'
  | 'thaw'

function isMaskKind(kind: LiquifyKind): kind is 'freeze' | 'thaw' {
  return kind === 'freeze' || kind === 'thaw'
}

export class LiquifyToolController {
  private surface: TiledRasterSurface | null = null
  private surfaceId: string | null = null
  private layerId: string | null = null
  private transform: Transform | null = null
  private clip: ((x: number, y: number) => number) | null = null
  private last = { x: 0, y: 0 }
  private residual = 0
  /** Immutable layer snapshot captured at stroke start for Reconstruct. */
  private strokeSnapshot: Uint8ClampedArray | null = null

  constructor(
    private readonly kind: LiquifyKind,
    private readonly onInvalidated: (surfaceId: string) => void,
  ) {}

  async pointerDown(docX: number, docY: number): Promise<boolean> {
    const session = useEditorSessionStore.getState()
    const id = session.selectedLayerIds[0]
    const layer = id && getLayer(session.document, id)
    if (!layer || layer.type !== 'raster' || isLayerImageLocked(layer)) return false
    const surfaceId = String(layer.pixels)
    const surface = await ensureEditableSurface(surfaceId, session.document.canvas)
    if (!surface) return false
    const local = documentToLayerLocal({ x: docX, y: docY }, layer.transform)
    this.surface = surface
    this.surfaceId = surfaceId
    this.layerId = layer.id
    this.transform = { ...layer.transform }
    this.clip = buildPaintClip(layer, surface) ?? null
    this.last = local
    this.residual = 0

    if (isMaskKind(this.kind)) {
      this.dab(local.x, local.y, local)
      return true
    }

    if (this.kind === 'reconstruct') {
      this.strokeSnapshot = surface.toRgbaBuffer().data
    }
    surface.beginStrokeCapture()
    this.dab(local.x, local.y, local)
    scheduleEditableSurfaceFlush(surfaceId, this.onInvalidated)
    useEditorSessionStore.setState({ dirty: true })
    return true
  }

  pointerMove(docX: number, docY: number): void {
    if (!this.surface || !this.transform) return
    const point = documentToLayerLocal({ x: docX, y: docY }, this.transform)
    const { size } = useRetouchSettingsStore.getState()
    const walked = walkStroke(
      this.last,
      point,
      Math.max(1, size * 0.2),
      this.residual,
      (next) => this.dab(next.x, next.y, this.last),
    )
    this.last = walked.end
    this.residual = walked.residual
    if (isMaskKind(this.kind)) return
    if (this.surfaceId) scheduleEditableSurfaceFlush(this.surfaceId, this.onInvalidated)
  }

  async pointerUp(): Promise<void> {
    if (!this.surface || !this.surfaceId) return
    if (isMaskKind(this.kind)) {
      this.surface = null
      this.surfaceId = null
      this.layerId = null
      this.transform = null
      this.clip = null
      return
    }

    const surface = this.surface
    const surfaceId = this.surfaceId
    cancelEditableSurfaceFlush(surfaceId)
    const patch = surface.endStrokeCapture()
    await syncEditableSurfaceToBitmap(surfaceId)
    this.onInvalidated(surfaceId)
    if (patch.tiles.length) {
      documentHistory.push(
        createRasterEntry({ label: this.label(), patch, onInvalidated: this.onInvalidated }),
      )
      useEditorSessionStore.setState({ dirty: true, historyVersion: documentHistory.version })
    }
    this.surface = null
    this.surfaceId = null
    this.layerId = null
    this.transform = null
    this.clip = null
    this.strokeSnapshot = null
  }

  private dab(x: number, y: number, previous: { x: number; y: number }): void {
    if (!this.surface) return
    const { size, strength } = useRetouchSettingsStore.getState()
    if (isMaskKind(this.kind)) {
      if (!this.layerId) return
      const mask = useLiquifyFreezeStore
        .getState()
        .ensureMask(this.layerId, this.surface.width, this.surface.height)
      this.surface.liquifyDab({
        kind: this.kind,
        x,
        y,
        radius: size / 2,
        strength,
        clip: this.clip ?? undefined,
        freezeMaskWrite: mask,
      })
      useLiquifyFreezeStore.getState().bumpVersion()
      return
    }

    const freezeMask = this.layerId
      ? useLiquifyFreezeStore.getState().getMask(this.layerId)
      : undefined
    this.surface.liquifyDab({
      kind: this.kind,
      x,
      y,
      radius: size / 2,
      strength,
      previous,
      strokeSnapshot: this.kind === 'reconstruct' ? this.strokeSnapshot ?? undefined : undefined,
      clip: this.clip ?? undefined,
      freezeMask,
    })
  }

  private label(): string {
    switch (this.kind) {
      case 'warp':
        return 'Liquify Forward Warp'
      case 'reconstruct':
        return 'Liquify Reconstruct'
      case 'bloat':
        return 'Liquify Bloat'
      case 'pucker':
        return 'Liquify Pucker'
      case 'twirl':
        return 'Liquify Twirl'
      case 'freeze':
        return 'Liquify Freeze Mask'
      case 'thaw':
        return 'Liquify Thaw Mask'
    }
  }
}
