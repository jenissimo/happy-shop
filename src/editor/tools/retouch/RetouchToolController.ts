import { createRasterEntry } from '../../../core/history/rasterEntry'
import { getLayer, isLayerImageLocked, type Transform } from '../../../core/document'
import { ensureEditableSurface, scheduleEditableSurfaceFlush, cancelEditableSurfaceFlush, syncEditableSurfaceToBitmap } from '../../../imaging/surfaces/EditableSurfaceStore'
import { TiledRasterSurface } from '../../../imaging/surfaces/TiledRasterSurface'
import { walkStroke } from '../../../imaging/brushes/strokeWalk'
import { documentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { buildPaintClip } from '../../session/paintClip'
import {
  compositeRasterLayersSync,
  sampleRgbaFromComposited,
  visibleRasterLayers,
  type DocRegion,
} from '../../session/compositeRasters'
import { documentToLayerLocal, layerLocalToDocument } from '../brush/layerCoords'
import { hitTestTopVisibleLayer } from '../move/hitTestTopLayer'
import { samplePattern } from '../../../rendering/effects/patterns'
import { captureSurfaceAtHistoryDepth } from './historySurfaceSnapshot'
import { useRetouchSettingsStore } from './retouchSettingsStore'

export type RetouchKind =
  | 'clone'
  | 'history'
  | 'pattern'
  | 'smudge'
  | 'blur'
  | 'sharpen'
  | 'spotHeal'
  | 'heal'
  | 'dodge'
  | 'burn'
  | 'sponge'

export class RetouchToolController {
  private surface: TiledRasterSurface | null = null
  private surfaceId: string | null = null
  private transform: Transform | null = null
  private clip: ((x: number, y: number) => number) | null = null
  private last = { x: 0, y: 0 }
  private residual = 0
  private source: {
    x: number
    y: number
    docX: number
    docY: number
    surfaceId: string
    surface: TiledRasterSurface
    transform: Transform
  } | null = null
  private cloneOffset = { x: 0, y: 0 }
  private strokeStartDoc = { x: 0, y: 0 }
  /** First-use layer snapshot; retained while this history brush stays active. */
  private historySnapshot: Uint8ClampedArray | null = null
  private historySnapshotSurfaceId: string | null = null
  private historySnapshotKey: string | null = null

  constructor(private readonly kind: RetouchKind, private readonly onInvalidated: (surfaceId: string) => void) {}

  async pointerDown(docX: number, docY: number, alt: boolean): Promise<boolean> {
    const session = useEditorSessionStore.getState()
    const id = session.selectedLayerIds[0]
    const layer = id && getLayer(session.document, id)
    if (!layer || layer.type !== 'raster' || isLayerImageLocked(layer)) return false
    const surfaceId = String(layer.pixels)
    const surface = await ensureEditableSurface(surfaceId, session.document.canvas)
    if (!surface) return false
    const local = documentToLayerLocal({ x: docX, y: docY }, layer.transform)
    if ((this.kind === 'clone' || this.kind === 'heal') && alt) {
      const { sampleAllLayers } = useRetouchSettingsStore.getState()
      if (sampleAllLayers) {
        // PS-like merged source: anchor in document space; dabs read visible composite.
        this.source = {
          ...local,
          docX,
          docY,
          surfaceId,
          surface,
          transform: { ...layer.transform },
        }
        return true
      }
      // Source from the visible layer under the pointer when possible. This
      // keeps normal same-layer stamping intact while enabling cheap direct
      // cross-layer sampling without a full-canvas composite per dab.
      const hitId = hitTestTopVisibleLayer(session.document, docX, docY)
      const hit = hitId && getLayer(session.document, hitId)
      const sourceLayer = hit?.type === 'raster' ? hit : layer
      const sourceId = String(sourceLayer.pixels)
      const sourceSurface = await ensureEditableSurface(sourceId, session.document.canvas)
      if (!sourceSurface) return false
      this.source = {
        ...documentToLayerLocal({ x: docX, y: docY }, sourceLayer.transform),
        docX,
        docY,
        surfaceId: sourceId,
        surface: sourceSurface,
        transform: { ...sourceLayer.transform },
      }
      return true
    }
    if ((this.kind === 'clone' || this.kind === 'heal') && !this.source) return false
    if (this.kind === 'history') {
      const { historySourceDepth } = useRetouchSettingsStore.getState()
      const snapshotKey = `${surfaceId}:${historySourceDepth}:${documentHistory.version}`
      if (historySourceDepth === 'capture') {
        if (this.historySnapshotSurfaceId !== surfaceId) {
          this.historySnapshot = surface.toRgbaBuffer().data
          this.historySnapshotSurfaceId = surfaceId
          this.historySnapshotKey = snapshotKey
        }
      } else if (this.historySnapshotKey !== snapshotKey) {
        this.historySnapshot = captureSurfaceAtHistoryDepth(surface, historySourceDepth)
        this.historySnapshotSurfaceId = surfaceId
        this.historySnapshotKey = snapshotKey
      }
    }
    this.surface = surface
    this.surfaceId = surfaceId
    this.transform = { ...layer.transform }
    this.clip = buildPaintClip(layer, surface) ?? null
    this.last = local
    this.strokeStartDoc = { x: docX, y: docY }
    this.residual = 0
    if ((this.kind === 'clone' || this.kind === 'heal') && this.source) {
      this.cloneOffset = { x: this.source.x - local.x, y: this.source.y - local.y }
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
    const walked = walkStroke(this.last, point, Math.max(1, size * 0.2), this.residual, (next) => this.dab(next.x, next.y, this.last))
    this.last = walked.end
    this.residual = walked.residual
    if (this.surfaceId) scheduleEditableSurfaceFlush(this.surfaceId, this.onInvalidated)
  }

  async pointerUp(): Promise<void> {
    if (!this.surface || !this.surfaceId) return
    const surface = this.surface, surfaceId = this.surfaceId
    cancelEditableSurfaceFlush(surfaceId)
    const patch = surface.endStrokeCapture()
    await syncEditableSurfaceToBitmap(surfaceId)
    this.onInvalidated(surfaceId)
    if (patch.tiles.length) {
      documentHistory.push(createRasterEntry({ label: this.label(), patch, onInvalidated: this.onInvalidated }))
      useEditorSessionStore.setState({ dirty: true, historyVersion: documentHistory.version })
    }
    this.surface = null; this.surfaceId = null; this.transform = null; this.clip = null
  }

  hasCloneSource(): boolean { return this.source !== null }

  private dab(x: number, y: number, previous: { x: number; y: number }): void {
    if (!this.surface) return
    const { size, strength, aligned, range, protectTones, spongeMode, sampleAllLayers, patternKind, patternScale, patternAngle, patternInvert } = useRetouchSettingsStore.getState()
    const crossLayerSource = this.source
    const mergedSourceSample = sampleAllLayers && crossLayerSource && this.transform
      ? this.buildMergedSourceSample(x, y, aligned)
      : undefined
    const source = !sampleAllLayers && crossLayerSource?.surfaceId === this.surfaceId
      ? aligned ? { x: x + this.cloneOffset.x, y: y + this.cloneOffset.y } : crossLayerSource
      : undefined
    const crossLayerSample = !sampleAllLayers && crossLayerSource && crossLayerSource.surfaceId !== this.surfaceId && this.transform
      ? (destinationX: number, destinationY: number) => {
          const destinationDoc = layerLocalToDocument({ x: destinationX, y: destinationY }, this.transform!)
          const dabDoc = layerLocalToDocument({ x, y }, this.transform!)
          const anchor = aligned
            ? {
                x: crossLayerSource.docX + (dabDoc.x - this.strokeStartDoc.x),
                y: crossLayerSource.docY + (dabDoc.y - this.strokeStartDoc.y),
              }
            : { x: crossLayerSource.docX, y: crossLayerSource.docY }
          const sourceLocal = documentToLayerLocal(
            { x: anchor.x + destinationDoc.x - dabDoc.x, y: anchor.y + destinationDoc.y - dabDoc.y },
            crossLayerSource.transform,
          )
          return crossLayerSource.surface.sampleRgba(sourceLocal.x, sourceLocal.y)
        }
      : undefined
    const sourceSample = mergedSourceSample ?? crossLayerSample
    const patternSample = this.kind === 'pattern'
      ? (lx: number, ly: number): [number, number, number, number] => {
          const value = samplePattern(lx, ly, {
            kind: patternKind,
            scale: patternScale,
            angle: patternAngle,
            invert: patternInvert,
          })
          const gray = Math.round((0.15 + value * 0.7) * 255)
          return [gray, gray, gray, 255]
        }
      : undefined
    this.surface.retouchDab({
      kind: this.kind === 'spotHeal' ? 'heal' : this.kind,
      x,
      y,
      radius: size / 2,
      strength,
      source,
      sourceSample,
      historySnapshot: this.kind === 'history' ? this.historySnapshot ?? undefined : undefined,
      patternSample,
      previous,
      range,
      protectTones: this.kind === 'dodge' || this.kind === 'burn' ? protectTones : undefined,
      spongeMode: this.kind === 'sponge' ? spongeMode : undefined,
      clip: this.clip ?? undefined,
    })
  }

  /** Tile-local merged composite sampler for Sample All Layers clone/heal sources. */
  private buildMergedSourceSample(
    dabX: number,
    dabY: number,
    aligned: boolean,
  ): ((destinationX: number, destinationY: number) => [number, number, number, number]) | undefined {
    if (!this.source || !this.transform) return undefined
    const session = useEditorSessionStore.getState()
    const layers = visibleRasterLayers(session.document)
    if (layers.length === 0) return undefined

    const { size } = useRetouchSettingsStore.getState()
    const region = mergedSourceDocRegion(
      this.transform,
      dabX,
      dabY,
      size / 2,
      { docX: this.source.docX, docY: this.source.docY },
      this.strokeStartDoc,
      aligned,
    )
    const composited = compositeRasterLayersSync(layers, region)
    if (!composited) return undefined

    const transform = this.transform
    const anchor = this.source
    const strokeStartDoc = this.strokeStartDoc
    return (destinationX: number, destinationY: number) => {
      const destinationDoc = layerLocalToDocument({ x: destinationX, y: destinationY }, transform)
      const dabDoc = layerLocalToDocument({ x: dabX, y: dabY }, transform)
      const anchorDoc = aligned
        ? {
            docX: anchor.docX + (dabDoc.x - strokeStartDoc.x),
            docY: anchor.docY + (dabDoc.y - strokeStartDoc.y),
          }
        : { docX: anchor.docX, docY: anchor.docY }
      return sampleRgbaFromComposited(
        composited,
        anchorDoc.docX + destinationDoc.x - dabDoc.x,
        anchorDoc.docY + destinationDoc.y - dabDoc.y,
      )
    }
  }

  private label(): string {
    return ({
      clone: 'Clone Stamp',
      history: 'History Brush',
      pattern: 'Pattern Stamp',
      smudge: 'Smudge',
      blur: 'Blur',
      sharpen: 'Sharpen',
      spotHeal: 'Spot Healing',
      heal: 'Healing Brush',
      dodge: 'Dodge',
      burn: 'Burn',
      sponge: 'Sponge',
    } as const)[this.kind]
  }
}

function mergedSourceDocRegion(
  transform: Transform,
  dabX: number,
  dabY: number,
  radius: number,
  anchor: { docX: number; docY: number },
  strokeStartDoc: { x: number; y: number },
  aligned: boolean,
): DocRegion {
  const pad = Math.ceil(radius) + 2
  const dabDoc = layerLocalToDocument({ x: dabX, y: dabY }, transform)
  const corners = [
    { x: dabX - pad, y: dabY - pad },
    { x: dabX + pad, y: dabY - pad },
    { x: dabX - pad, y: dabY + pad },
    { x: dabX + pad, y: dabY + pad },
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const corner of corners) {
    const destinationDoc = layerLocalToDocument(corner, transform)
    const anchorDoc = aligned
      ? {
          docX: anchor.docX + (dabDoc.x - strokeStartDoc.x),
          docY: anchor.docY + (dabDoc.y - strokeStartDoc.y),
        }
      : anchor
    const sourceDocX = anchorDoc.docX + destinationDoc.x - dabDoc.x
    const sourceDocY = anchorDoc.docY + destinationDoc.y - dabDoc.y
    minX = Math.min(minX, sourceDocX)
    minY = Math.min(minY, sourceDocY)
    maxX = Math.max(maxX, sourceDocX)
    maxY = Math.max(maxY, sourceDocY)
  }
  const x = Math.floor(minX)
  const y = Math.floor(minY)
  return {
    x,
    y,
    width: Math.max(1, Math.ceil(maxX) - x + 1),
    height: Math.max(1, Math.ceil(maxY) - y + 1),
  }
}
