import { createRasterEntry } from '../../../core/history/rasterEntry'
import {
  ensureEditableSurface,
  syncEditableSurfaceToBitmap,
} from '../../../imaging/surfaces/EditableSurfaceStore'
import { walkStroke } from '../../../imaging/brushes/strokeWalk'
import { getTip, loadTipAlpha } from '../../../imaging/brushes/tipRegistry'
import { SelectionMask } from '../../session/SelectionMask'
import { documentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { useSelectionStore } from '../../session/selectionStore'
import { getLayer, isLayerImageLocked } from '../../../core/document'
import { documentToLayerLocal } from '../brush/layerCoords'
import { readBrushEngineSettings } from '../brush/brushSettingsStore'
import {
  dabOpacityFromPressure,
  pressureChannelScale,
} from '../brush/pointerPressure'
import { buildPaintClip } from '../../session/paintClip'
import { createAndSelectShapeLayer } from '../shape/shapeCommands'
import { usePenToolStore } from './penToolStore'
import {
  penPathBounds,
  penPathIsFillable,
  penPathIsStrokable,
  penPathToSvgData,
  samplePenPath,
  tessellatePenPath,
  type PenPath,
} from './penPath'
import { useWorkPathStore } from './workPathStore'

function parseHex(color: string): { r: number; g: number; b: number } {
  const hex = color.replace('#', '')
  if (hex.length < 6) return { r: 0, g: 0, b: 0 }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

export function getActiveWorkPath(): PenPath | null {
  return useWorkPathStore.getState().path
}

/** Closed path → document selection (tessellated polygon). */
export function pathToSelection(path: PenPath): boolean {
  if (!penPathIsFillable(path)) return false
  const { width, height } = useEditorSessionStore.getState().document.canvas
  const points = tessellatePenPath(path, 24)
  const mask = SelectionMask.fromPolygon(width, height, points, { antiAlias: true })
  if (mask.isEmpty()) return false
  useSelectionStore.getState().applyMask(mask)
  return true
}

/** Closed path → editable svg-path ShapeLayer. */
export function fillPath(path: PenPath): boolean {
  if (!penPathIsFillable(path)) return false
  const opts = usePenToolStore.getState().options
  const bounds = penPathBounds(path)
  createAndSelectShapeLayer({
    primitive: 'svg-path',
    x: bounds.x,
    y: bounds.y,
    w: bounds.w,
    h: bounds.h,
    pathData: penPathToSvgData(path, bounds.x, bounds.y),
    fill: {
      enabled: opts.fillEnabled,
      color: opts.fillColor,
      opacity: opts.fillOpacity,
    },
    stroke: {
      enabled: opts.strokeEnabled,
      color: opts.strokeColor,
      opacity: opts.strokeOpacity,
      width: opts.strokeWidth,
    },
  })
  return true
}

/** Walk the path with the current brush on the active raster layer. */
export async function strokePathWithBrush(path: PenPath): Promise<boolean> {
  if (!penPathIsStrokable(path)) return false
  const session = useEditorSessionStore.getState()
  const layerId = session.selectedLayerIds[0]
  if (!layerId) return false
  const layer = getLayer(session.document, layerId)
  if (!layer || layer.type !== 'raster' || isLayerImageLocked(layer)) return false

  const settings = readBrushEngineSettings('paint')
  const assetId = String(layer.pixels)
  const surface = await ensureEditableSurface(assetId, session.document.canvas)
  if (!surface) return false

  let tipAlpha = null
  const tip = getTip(settings.tipId)
  if (tip?.kind === 'stamp') {
    try {
      tipAlpha = await loadTipAlpha(tip.id)
    } catch {
      tipAlpha = null
    }
  }

  surface.beginStrokeCapture({ opacityCeiling: settings.opacity })
  const clip = buildPaintClip(layer, surface) ?? null
  const transform = { ...layer.transform }

  const spacingPx = Math.max(0.5, settings.size * settings.spacing)
  const samples = samplePenPath(path, spacingPx)
  if (samples.length === 0) {
    surface.endStrokeCapture()
    return false
  }

  let lastLocal = documentToLayerLocal(samples[0]!, transform)
  stamp(surface, settings, tipAlpha, lastLocal.x, lastLocal.y, clip)

  let residual = 0
  for (let i = 1; i < samples.length; i++) {
    const docPt = samples[i]!
    const local = documentToLayerLocal(docPt, transform)
    const result = walkStroke(
      lastLocal,
      local,
      spacingPx,
      residual,
      (point) => stamp(surface, settings, tipAlpha, point.x, point.y, clip),
    )
    residual = result.residual
    lastLocal = result.end
  }

  const patch = surface.endStrokeCapture()
  await syncEditableSurfaceToBitmap(assetId)
  if (patch.tiles.length > 0) {
    documentHistory.push(
      createRasterEntry({
        label: 'Stroke Path',
        patch,
      }),
    )
    useEditorSessionStore.setState({
      dirty: true,
      historyVersion: documentHistory.version,
      rasterEpoch: session.rasterEpoch + 1,
    })
  }
  return true
}

function stamp(
  surface: NonNullable<Awaited<ReturnType<typeof ensureEditableSurface>>>,
  settings: ReturnType<typeof readBrushEngineSettings>,
  tipAlpha: Awaited<ReturnType<typeof loadTipAlpha>> | null,
  x: number,
  y: number,
  clip: ReturnType<typeof buildPaintClip> | null,
): void {
  const radius =
    (settings.size / 2) *
    pressureChannelScale(1, 'size', settings.pressureControlsSize, settings.pressureSizeCurve)
  surface.stampTip({
    x,
    y,
    radius,
    angle: (getTip(settings.tipId)?.angle ?? 0) + settings.angle,
    roundness: settings.roundness,
    hardness: settings.hardness,
    opacity: dabOpacityFromPressure(settings, 1),
    color: parseHex(settings.color),
    mode: settings.mode,
    alpha: tipAlpha,
    tipId: settings.tipId,
    clip: clip ?? undefined,
  })
}

export function commitWorkPathFromPen(): boolean {
  const path = useWorkPathStore.getState().path
  if (!path) return false
  const mode = usePenToolStore.getState().options.commitMode
  if (mode === 'selection') return pathToSelection(path)
  return fillPath(path)
}
