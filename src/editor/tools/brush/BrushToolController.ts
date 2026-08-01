import { createRasterEntry } from '../../../core/history/rasterEntry'
import {
  cancelEditableSurfaceFlush,
  ensureEditableSurface,
  scheduleEditableSurfaceFlush,
  syncEditableSurfaceToBitmap,
} from '../../../imaging/surfaces/EditableSurfaceStore'
import { TiledRasterSurface } from '../../../imaging/surfaces/TiledRasterSurface'
import { walkStroke } from '../../../imaging/brushes/strokeWalk'
import {
  isPixelCornerDouble,
  pixelCellFromCenter,
  walkPixelPerfectLine,
} from '../../../imaging/brushes/pixelPerfectStroke'
import {
  snapPixelBrushSize,
  snapPixelPoint,
} from '../../../imaging/brushes/pixelSnap'
import { getTip, loadTipAlpha, type TipAlpha } from '../../../imaging/brushes/tipRegistry'
import { documentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { getLayer, isLayerImageLocked, type Transform } from '../../../core/document'
import { documentToLayerLocal } from './layerCoords'
import { readBrushEngineSettings } from './brushSettingsStore'
import {
  dabOpacityFromPressure,
  pressureChannelScale,
  type PressureCurveKind,
} from './pointerPressure'
import { buildPaintClip } from '../../session/paintClip'
import {
  constrainToAxis,
} from '../constrain'
import {
  NO_MODIFIERS,
  normalizeModifiers,
  type ToolModifiers,
} from '../toolModifiers'

export type BrushSettings = {
  size: number
  opacity: number
  /** Per-dab buildup beneath the gesture opacity ceiling. */
  flow: number
  hardness: number
  color: string
  mode: 'paint' | 'erase'
  /** Spacing as a fraction of brush diameter (SPEC §11.3). */
  spacing: number
  tipId: string
  angle: number
  roundness: number
  /** Apply native pen pressure to dab diameter. */
  pressureControlsSize: boolean
  pressureControlsOpacity: boolean
  pressureControlsFlow: boolean
  pressureSizeCurve: PressureCurveKind
  pressureOpacityCurve: PressureCurveKind
  pressureFlowCurve: PressureCurveKind
  /** Round analytic tip (default) vs hard square pixel stamp. */
  paintEngine: 'brush' | 'pencil'
  /** Bresenham pixel-perfect stroke (pencil only). */
  pixelPerfect: boolean
}

export const DEFAULT_BRUSH: BrushSettings = {
  size: 20,
  opacity: 1,
  flow: 1,
  hardness: 0.35,
  color: '#000000',
  mode: 'paint',
  spacing: 0.25,
  tipId: 'proc.round-soft',
  angle: 0,
  roundness: 1,
  pressureControlsSize: true,
  pressureControlsOpacity: false,
  pressureControlsFlow: true,
  pressureSizeCurve: 'soft',
  pressureOpacityCurve: 'linear',
  pressureFlowCurve: 'linear',
  paintEngine: 'brush',
  pixelPerfect: true,
}

function parseHex(color: string): { r: number; g: number; b: number } {
  const hex = color.replace('#', '')
  if (hex.length < 6) return { r: 0, g: 0, b: 0 }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

export type BrushStrokeCallbacks = {
  onInvalidated?: (surfaceId: string) => void
}

/**
 * Distance-sampled round brush / eraser. One history entry per gesture.
 *
 * Modifier grammar (Photoshop-like):
 * - Shift+click: stamp a straight line from the previous stroke end to the click
 * - Shift while dragging: constrain the stroke to 45° axes from stroke origin
 *
 * Perf (interactive stroke): CPU stamps stay in tiled memory; dirty-tile
 * ImageBitmap publish + React rasterEpoch are coalesced to one rAF. History
 * before/after tile copies run once on pointer-up via stroke capture — not
 * per dab / pointermove.
 */
export class BrushToolController {
  settings: BrushSettings
  private drawing = false
  private lastX = 0
  private lastY = 0
  private residual = 0
  private surfaceId: string | null = null
  private surface: TiledRasterSurface | null = null
  private layerTransform: Transform | null = null
  /** Cached for the whole gesture — avoid store reads + alloc per dab. */
  private clip: ((localX: number, localY: number) => number) | null = null
  private readonly callbacks: BrushStrokeCallbacks
  /** Last committed endpoint, valid only for its surface, mode, and history state. */
  private anchor: {
    x: number
    y: number
    surfaceId: string
    mode: BrushSettings['mode']
    historyVersion: number
    transformKey: string
  } | null = null
  private lineGesture = false
  private modifiersAtDown = NO_MODIFIERS
  /** Document-space origin of the current stroke (45° constrain). */
  private strokeOriginDoc = { x: 0, y: 0 }
  private lastDocX = 0
  private lastDocY = 0
  private tipAlpha: TipAlpha | null = null
  /** Last stamped pixel center while drawing with pixel-perfect pencil. */
  private lastPixelCenter = { x: 0, y: 0 }
  /** Last cell that is known not to be an inner corner. */
  private pixelPerfectPrevious = { x: 0, y: 0 }
  /**
   * The final cell remains unpainted until the next cell is known: it may be
   * the inner cell of a pixel-perfect corner and must then be omitted.
   */
  private pendingPixel: { x: number; y: number; pressure: number } | null = null

  constructor(
    settings: Partial<BrushSettings> = {},
    callbacks: BrushStrokeCallbacks = {},
  ) {
    this.settings = { ...DEFAULT_BRUSH, ...settings }
    this.callbacks = callbacks
  }

  /** Sync engine params from the shared prefs store (options bar / context menu). */
  pullSettings(mode: BrushSettings['mode']): void {
    this.settings = readBrushEngineSettings(mode)
  }

  async pointerDown(
    docX: number,
    docY: number,
    pressure = 1,
    mods: ToolModifiers = NO_MODIFIERS,
  ): Promise<boolean> {
    mods = normalizeModifiers(mods)
    const session = useEditorSessionStore.getState()
    const layerId = session.selectedLayerIds[0]
    if (!layerId) return false
    const layer = getLayer(session.document, layerId)
    if (
      !layer ||
      layer.type !== 'raster' ||
      isLayerImageLocked(layer)
    ) return false

    const assetId = String(layer.pixels)
    const surface = await ensureEditableSurface(assetId, session.document.canvas)
    if (!surface) return false

    this.drawing = true
    this.surfaceId = assetId
    this.surface = surface
    this.layerTransform = { ...layer.transform }
    this.clip = buildPaintClip(layer, surface) ?? null
    // Opacity is a gesture ceiling. Flow remains the per-dab contribution, so
    // revisiting a pixel cannot darken it beyond the user-selected opacity.
    surface.beginStrokeCapture({ opacityCeiling: this.settings.opacity })
    this.tipAlpha = null
    const tip = getTip(this.settings.tipId)
    if (tip?.kind === 'stamp') {
      try {
        this.tipAlpha = await loadTipAlpha(tip.id)
      } catch {
        // Optional or missing packs gracefully paint as the analytic fallback.
      }
    }
    this.modifiersAtDown = mods
    this.lineGesture = Boolean(
      mods.shift &&
        this.anchor &&
        this.anchor.surfaceId === assetId &&
        this.anchor.mode === this.settings.mode &&
        this.anchor.historyVersion === session.historyVersion &&
        // A transformed layer changes document-to-local mapping; never reuse it.
        this.anchor.transformKey === JSON.stringify(layer.transform),
    )

    this.strokeOriginDoc = { x: docX, y: docY }
    this.lastDocX = docX
    this.lastDocY = docY

    const local = documentToLayerLocal(
      { x: docX, y: docY },
      this.layerTransform,
    )
    const start = this.preparePoint(local.x, local.y)

    if (this.lineGesture && this.anchor) {
      // Straight line from previous stroke end → click (do not re-stamp start).
      const fromLocal = documentToLayerLocal(this.anchor, this.layerTransform)
      const from = this.preparePoint(fromLocal.x, fromLocal.y)
      this.lastX = from.x
      this.lastY = from.y
      this.lastPixelCenter = { x: from.x, y: from.y }
      this.pixelPerfectPrevious = { x: from.x, y: from.y }
      this.pendingPixel = null
      this.residual = 0
      this.strokeToward(start.x, start.y, 1)
      // Ensure the click lands even when spacing residual never hit the end.
      if (
        Math.hypot(this.lastX - start.x, this.lastY - start.y) > 1e-6
      ) {
        this.stamp(surface, start.x, start.y, 1)
        this.lastX = start.x
        this.lastY = start.y
        this.lastPixelCenter = { x: start.x, y: start.y }
        this.residual = 0
      }
    } else {
      this.lastX = start.x
      this.lastY = start.y
      this.lastPixelCenter = { x: start.x, y: start.y }
      this.pixelPerfectPrevious = { x: start.x, y: start.y }
      this.pendingPixel = null
      this.residual = 0
      this.stamp(surface, start.x, start.y, pressure)
    }

    this.schedulePreview()
    useEditorSessionStore.setState({ dirty: true })
    return true
  }

  /**
   * Synchronous move path — no await. Coalesced pointer events can stamp many
   * samples; preview flush is rAF-batched separately.
   */
  pointerMove(
    docX: number,
    docY: number,
    pressure = 1,
    mods: ToolModifiers = NO_MODIFIERS,
  ): void {
    mods = normalizeModifiers(mods)
    if (!this.drawing || !this.surface || !this.layerTransform) return

    let px = docX
    let py = docY
    if (mods.shift && !this.modifiersAtDown.shift) {
      const c = constrainToAxis(this.strokeOriginDoc, { x: docX, y: docY })
      px = c.x
      py = c.y
    }
    this.lastDocX = px
    this.lastDocY = py

    const local = documentToLayerLocal(
      { x: px, y: py },
      this.layerTransform,
    )
    const target = this.preparePoint(local.x, local.y)
    this.strokeToward(target.x, target.y, pressure)
    this.schedulePreview()
  }

  async pointerUp(): Promise<void> {
    if (!this.drawing || !this.surfaceId || !this.surface) return
    this.drawing = false
    const assetId = this.surfaceId
    const surface = this.surface
    cancelEditableSurfaceFlush(assetId)
    if (this.settings.paintEngine === 'pencil') this.flushPendingPixel()
    const patch = surface.endStrokeCapture()
    await syncEditableSurfaceToBitmap(assetId)
    this.callbacks.onInvalidated?.(assetId)

    if (patch.tiles.length > 0) {
      documentHistory.push(
        createRasterEntry({
          label: this.lineGesture
            ? this.settings.mode === 'erase'
              ? 'Eraser (line)'
              : this.settings.paintEngine === 'pencil'
                ? 'Pencil (line)'
                : 'Brush (line)'
            : this.settings.mode === 'erase'
              ? 'Eraser'
              : this.settings.paintEngine === 'pencil'
                ? 'Pencil'
                : 'Brush',
          patch,
          onInvalidated: this.callbacks.onInvalidated,
        }),
      )
      useEditorSessionStore.setState({
        dirty: true,
        historyVersion: documentHistory.version,
      })
    }
    // An empty clipped stroke still becomes the next visual anchor.
    this.anchor = {
      x: this.lastDocX,
      y: this.lastDocY,
      surfaceId: assetId,
      mode: this.settings.mode,
      historyVersion: useEditorSessionStore.getState().historyVersion,
      transformKey: JSON.stringify(this.layerTransform),
    }

    this.surfaceId = null
    this.surface = null
    this.layerTransform = null
    this.clip = null
    this.tipAlpha = null
  }

  clearAnchor(): void {
    this.anchor = null
  }

  /** Document-space endpoint used by the Shift straight-line affordance. */
  getAnchor(): { x: number; y: number } | null {
    if (!this.anchor) return null
    const session = useEditorSessionStore.getState()
    const layerId = session.selectedLayerIds[0]
    const layer = layerId ? getLayer(session.document, layerId) : null
    if (
      !layer ||
      layer.type !== 'raster' ||
      String(layer.pixels) !== this.anchor.surfaceId ||
      JSON.stringify(layer.transform) !== this.anchor.transformKey
    ) {
      return null
    }
    return { x: this.anchor.x, y: this.anchor.y }
  }

  private preparePoint(x: number, y: number): { x: number; y: number } {
    if (this.settings.paintEngine !== 'pencil') return { x, y }
    return snapPixelPoint({ x, y })
  }

  private strokeToward(localX: number, localY: number, pressure: number): void {
    if (!this.surface) return
    const surface = this.surface

    if (this.settings.paintEngine === 'pencil') {
      walkPixelPerfectLine(
        this.lastPixelCenter,
        { x: localX, y: localY },
        false,
        (x, y) => this.queuePixelPerfectStamp(surface, x, y, pressure),
      )
      this.lastPixelCenter = { x: localX, y: localY }
      this.lastX = localX
      this.lastY = localY
      this.residual = 0
      return
    }

    const spacingPx = Math.max(
      0.5,
      this.effectiveBrushSize(pressure) * this.settings.spacing,
    )
    const { residual, end } = walkStroke(
      { x: this.lastX, y: this.lastY },
      { x: localX, y: localY },
      spacingPx,
      this.residual,
      (point) => this.stamp(surface, point.x, point.y, pressure),
    )
    this.residual = residual
    this.lastX = end.x
    this.lastY = end.y
  }

  private queuePixelPerfectStamp(
    surface: TiledRasterSurface,
    x: number,
    y: number,
    pressure: number,
  ): void {
    if (!this.settings.pixelPerfect) {
      this.stamp(surface, x, y, pressure)
      return
    }

    const next = { x, y, pressure }
    if (!this.pendingPixel) {
      this.pendingPixel = next
      return
    }

    const previousCell = pixelCellFromCenter(
      this.pixelPerfectPrevious.x,
      this.pixelPerfectPrevious.y,
    )
    const pendingCell = pixelCellFromCenter(
      this.pendingPixel.x,
      this.pendingPixel.y,
    )
    const followingCell = pixelCellFromCenter(next.x, next.y)
    const previous = { x: previousCell.ix, y: previousCell.iy }
    const pending = { x: pendingCell.ix, y: pendingCell.iy }
    const following = { x: followingCell.ix, y: followingCell.iy }
    if (!isPixelCornerDouble(previous, pending, following)) {
      this.stamp(
        surface,
        this.pendingPixel.x,
        this.pendingPixel.y,
        this.pendingPixel.pressure,
      )
      this.pixelPerfectPrevious = {
        x: this.pendingPixel.x,
        y: this.pendingPixel.y,
      }
    }
    this.pendingPixel = next
  }

  private flushPendingPixel(): void {
    if (!this.pendingPixel || !this.surface) return
    this.stamp(
      this.surface,
      this.pendingPixel.x,
      this.pendingPixel.y,
      this.pendingPixel.pressure,
    )
    this.pixelPerfectPrevious = {
      x: this.pendingPixel.x,
      y: this.pendingPixel.y,
    }
    this.pendingPixel = null
  }

  private effectiveBrushSize(pressure: number): number {
    const scaled =
      this.settings.size *
      pressureChannelScale(
        pressure,
        'size',
        this.settings.pressureControlsSize,
        this.settings.pressureSizeCurve,
      )
    if (this.settings.paintEngine === 'pencil') {
      return snapPixelBrushSize(scaled)
    }
    return scaled
  }

  private schedulePreview(): void {
    if (!this.surfaceId) return
    scheduleEditableSurfaceFlush(this.surfaceId, this.callbacks.onInvalidated)
  }

  private stamp(
    surface: TiledRasterSurface,
    x: number,
    y: number,
    pressure: number,
  ): void {
    const p = Number.isFinite(pressure) && pressure > 0 ? pressure : 1
    const opacity = dabOpacityFromPressure(this.settings, p)
    const color = parseHex(this.settings.color)

    if (this.settings.paintEngine === 'pencil') {
      const center = snapPixelPoint({ x, y })
      surface.stampSquare({
        x: center.x,
        y: center.y,
        size: this.effectiveBrushSize(p),
        opacity,
        color,
        mode: this.settings.mode,
        clip: this.clip ?? undefined,
      })
      return
    }

    const radius =
      (this.settings.size / 2) *
      pressureChannelScale(
        p,
        'size',
        this.settings.pressureControlsSize,
        this.settings.pressureSizeCurve,
      )
    surface.stampTip({
      x,
      y,
      radius,
      angle: (getTip(this.settings.tipId)?.angle ?? 0) + this.settings.angle,
      roundness: this.settings.roundness,
      hardness: this.settings.hardness,
      opacity,
      color,
      mode: this.settings.mode,
      alpha: this.tipAlpha,
      tipId: this.settings.tipId,
      clip: this.clip ?? undefined,
    })
  }
}
