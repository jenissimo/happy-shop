import { getLayer, isLayerImageLocked, type Transform } from '../../../core/document'
import { sampleGradientStops } from '../../../core/gradient/gradientSampling'
import { createRasterEntry } from '../../../core/history/rasterEntry'
import {
  ensureEditableSurface,
  syncEditableSurfaceToBitmap,
} from '../../../imaging/surfaces/EditableSurfaceStore'
import { documentHistory } from '../../session/documentHistory'
import { buildPaintClip } from '../../session/paintClip'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { layerLocalToDocument } from '../brush/layerCoords'
import { useGradientToolStore } from './gradientToolStore'

type Point = { x: number; y: number }

export function gradientOffset(
  style: 'linear' | 'radial',
  start: Point,
  end: Point,
  point: Point,
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared < 1e-6) return 0
  if (style === 'radial') {
    return Math.hypot(point.x - start.x, point.y - start.y) / Math.sqrt(lengthSquared)
  }
  return ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared
}

/** Destructive gradient gesture, recorded as exactly one raster history entry. */
export class GradientToolController {
  private start: Point | null = null

  pointerDown(docX: number, docY: number): boolean {
    const session = useEditorSessionStore.getState()
    const layerId = session.selectedLayerIds[0]
    const layer = layerId ? getLayer(session.document, layerId) : null
    if (!layer || layer.type !== 'raster' || isLayerImageLocked(layer)) return false
    this.start = { x: docX, y: docY }
    return true
  }

  cancel(): void {
    this.start = null
  }

  async pointerUp(docX: number, docY: number): Promise<void> {
    const start = this.start
    this.start = null
    if (!start) return

    const session = useEditorSessionStore.getState()
    const layerId = session.selectedLayerIds[0]
    const layer = layerId ? getLayer(session.document, layerId) : null
    if (!layer || layer.type !== 'raster' || isLayerImageLocked(layer)) return

    const surfaceId = String(layer.pixels)
    const surface = await ensureEditableSurface(surfaceId, session.document.canvas)
    if (!surface) return

    const { gradient, style, reverse, opacity } = useGradientToolStore.getState().options
    const transform: Transform = { ...layer.transform }
    const clip = buildPaintClip(layer, surface)
    const end = { x: docX, y: docY }
    surface.beginStrokeCapture()
    surface.applyGradient({
      opacity,
      clip: clip ?? undefined,
      sample: (localX, localY) => {
        const documentPoint = layerLocalToDocument({ x: localX, y: localY }, transform)
        let offset = gradientOffset(style, start, end, documentPoint)
        if (reverse) offset = 1 - offset
        return sampleGradientStops(gradient.stops, offset)
      },
    })
    const patch = surface.endStrokeCapture()
    if (patch.tiles.length === 0) return

    await syncEditableSurfaceToBitmap(surfaceId)
    useEditorSessionStore.getState().bumpRasterEpoch()
    documentHistory.push(
      createRasterEntry({
        label: style === 'radial' ? 'Radial Gradient' : 'Gradient',
        patch,
        onInvalidated: () => useEditorSessionStore.getState().bumpRasterEpoch(),
      }),
    )
    useEditorSessionStore.setState({
      dirty: true,
      historyVersion: documentHistory.version,
    })
  }
}
