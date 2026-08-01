import { BrushToolController } from './brush/BrushToolController'
import { readPencilEngineSettings } from './brush/brushSettingsStore'
import { useBrushSettingsStore } from './brush/brushSettingsStore'
import { RetouchToolController } from './retouch/RetouchToolController'
import { LiquifyToolController } from './liquify/LiquifyToolController'
import { isLiquifyTool, liquifyKindForTool } from './liquify/liquifyTools'
import { ShapeToolController } from './shape/ShapeToolController'
import { PenToolController } from './pen/PenToolController'
import { FreeformPenToolController } from './pen/FreeformPenToolController'
import { DirectSelectionController } from './pen/DirectSelectionController'
import { PathSelectionController } from './pen/PathSelectionController'
import {
  AddAnchorController,
  ConvertPointController,
  DeleteAnchorController,
} from './pen/AddDeleteConvertControllers'
import { isPenToolId } from '../toolbar/tools'
import { TextToolController } from './text/TextToolController'
import { GradientToolController } from './gradient/GradientToolController'
import { SelectionToolController } from './selection/SelectionToolController'
import {
  SelectionTransformController,
  cancelSelectionTransform,
  commitSelectionTransform,
  useSelectionTransformStore,
} from './selection/selectionTransform'
import {
  CageTransformController,
  cancelCageTransform,
  commitCageTransform,
  useCageTransformStore,
} from './transform/cageTransform'
import { MoveToolController } from './move/MoveToolController'
import {
  cancelFreeTransformSession,
  commitFreeTransformSession,
} from './move/transformCommit'
import { useTransformStore } from './move/transformStore'
import { applyMagicWandAt } from './selection/magicWand'
import { buildDocumentEdgeField } from './selection/magneticLasso'
import { applyPaintBucketAt } from './fill/paintBucket'
import type { LayerId } from '../../core/document'
import { documentToLayerLocal } from './brush/layerCoords'
import { brushPressureFromPointerEvent } from './brush/pointerPressure'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { useSelectionStore } from '../session/selectionStore'
import { useSelectionToolStore } from '../session/selectionToolStore'
import { mapClientToViewport } from '../viewport/mapClientToViewport'
import type { ViewportCamera } from '../viewport/ViewportCamera'
import {
  endChromaSample,
  getChromaSampleState,
} from '../../ui/features/layer-style/chromaSampleStore'
import {
  endColorEyedropper,
  getColorEyedropperState,
} from '../../ui/base/ColorPicker/colorEyedropperStore'
import {
  rgbToCssHex,
  sampleLayerAssetColor,
} from '../../imaging/sampleLayerColor'
import { useColorStore } from '../color/colorStore'
import { sampleMergedColorAt } from '../session/compositeRasters'
import {
  NO_MODIFIERS,
  readModifiers,
  type ToolModifiers,
  useToolModifierStatusStore,
} from './toolModifiers'
import { rectFromDrag } from './constrain'
import { snapPointToGuides } from '../viewport/guides'
import { useSnapPreferencesStore } from '../viewport/snapPreferences'

export type ToolPointerContext = {
  host: HTMLElement
  camera: ViewportCamera
  viewportWidth: number
  viewportHeight: number
}

type DragKind =
  | 'none'
  | 'brush'
  | 'eyedropper'
  | 'marquee'
  | 'crop'
  | 'text'
  | 'shape'
  | 'pen'
  | 'freeformPen'
  | 'addAnchor'
  | 'deleteAnchor'
  | 'convertPoint'
  | 'pathSelection'
  | 'directSelection'
  | 'selection'
  | 'selectionTransform'
  | 'cageTransform'
  | 'wand'
  | 'fill'
  | 'move'
  | 'retouch'
  | 'liquify'
  | 'gradient'
  | 'brushAdjust'

/**
 * Routes viewport pointer events to the active tool controller.
 *
 * Brush offset root cause (2026-07-31): stamps used raw document coords while
 * Pixi places layers via `layer.transform`, and pointer math used host
 * border-box deltas without normalizing to the logical viewport size Pixi
 * renders into (CSS stretch / DPR / chrome layout). Pipeline:
 * client → mapClientToViewport → camera.screenToDocument →
 * BrushToolController documentToLayerLocal.
 */
export class ToolInputRouter {
  private brush = new BrushToolController(
    {},
    {
      onInvalidated: () => {
        useEditorSessionStore.getState().bumpRasterEpoch()
      },
    },
  )
  private clone = new RetouchToolController('clone', (surfaceId) => {
    this.invalidateRetouch(surfaceId)
  })
  private historyBrush = new RetouchToolController('history', (surfaceId) => {
    this.invalidateRetouch(surfaceId)
  })
  private patternStamp = new RetouchToolController('pattern', (surfaceId) => {
    this.invalidateRetouch(surfaceId)
  })
  private smudge = new RetouchToolController('smudge', (surfaceId) => {
    this.invalidateRetouch(surfaceId)
  })
  private blur = new RetouchToolController('blur', (surfaceId) => {
    this.invalidateRetouch(surfaceId)
  })
  private sharpen = new RetouchToolController('sharpen', (surfaceId) => {
    this.invalidateRetouch(surfaceId)
  })
  private dodge = new RetouchToolController('dodge', (surfaceId) => {
    this.invalidateRetouch(surfaceId)
  })
  private burn = new RetouchToolController('burn', (surfaceId) => {
    this.invalidateRetouch(surfaceId)
  })
  private sponge = new RetouchToolController('sponge', (surfaceId) => {
    this.invalidateRetouch(surfaceId)
  })
  private spotHeal = new RetouchToolController('spotHeal', (surfaceId) => {
    this.invalidateRetouch(surfaceId)
  })
  private heal = new RetouchToolController('heal', (surfaceId) => {
    this.invalidateRetouch(surfaceId)
  })
  private liquifyControllers = new Map(
    (['warp', 'reconstruct', 'bloat', 'pucker', 'twirl', 'freeze', 'thaw'] as const).map((kind) => [
      kind,
      new LiquifyToolController(kind, (surfaceId) => {
        this.invalidateRetouch(surfaceId)
      }),
    ]),
  )
  private text = new TextToolController()
  private shape = new ShapeToolController()
  private pen = new PenToolController()
  private freeformPen = new FreeformPenToolController()
  private addAnchor = new AddAnchorController()
  private deleteAnchor = new DeleteAnchorController()
  private convertPoint = new ConvertPointController()
  private pathSelection = new PathSelectionController()
  private directSelection = new DirectSelectionController()
  private gradient = new GradientToolController()
  private selection = new SelectionToolController()
  private selectionTransform = new SelectionTransformController()
  private cageTransform = new CageTransformController()
  private move = new MoveToolController()
  private drag: DragKind = 'none'
  private startDoc = { x: 0, y: 0 }
  private pointerId: number | null = null
  private lastClickAt = 0
  private lastClickDoc = { x: 0, y: 0 }
  private lastSample: {
    doc: { x: number; y: number }
    pressure: number
    pointerId: number
  } | null = null
  private modifiersAtDown = NO_MODIFIERS
  private brushAdjustStart: { x: number; y: number; size: number; hardness: number } | null = null

  get brushSettings() {
    return this.brush.settings
  }

  /** Last brush/eraser endpoint in document space, if Shift can continue it. */
  get brushAnchor() {
    return this.brush.getAnchor()
  }

  setBrushSettings(patch: Partial<BrushToolController['settings']>): void {
    this.brush.settings = { ...this.brush.settings, ...patch }
  }

  setSpaceHeld(active: boolean): void {
    this.selection.setRepositioning(active)
  }

  private invalidateRetouch(_surfaceId: string): void {
    useEditorSessionStore.getState().bumpRasterEpoch()
  }

  /** Escape / tool switch — cancel open polygonal lasso / pen draft / transform gesture. */
  cancelSelectionGesture(): void {
    if (this.drag === 'gradient') this.gradient.cancel()
    this.selection.cancelPolygon()
    this.pen.cancelDraft()
    this.freeformPen.cancelDraft()
    useSelectionToolStore.getState().clearPreview()
    if (this.drag === 'pen' || this.drag === 'freeformPen' || this.drag === 'pathSelection' || this.drag === 'directSelection' || this.drag === 'addAnchor' || this.drag === 'deleteAnchor' || this.drag === 'convertPoint') {
      this.drag = 'none'
      this.pointerId = null
    }
    if (this.drag === 'selection' || this.drag === 'wand' || this.drag === 'fill') {
      this.drag = 'none'
      this.pointerId = null
    }
    if (this.drag === 'move') {
      this.move.cancelGesture()
      this.drag = 'none'
      this.pointerId = null
    }
    if (this.drag === 'selectionTransform') {
      this.selectionTransform.cancelGesture()
      this.drag = 'none'
      this.pointerId = null
    }
    if (this.drag === 'cageTransform') {
      this.cageTransform.cancelGesture()
      this.drag = 'none'
      this.pointerId = null
    }
  }

  /** Esc: cancel transform sessions if active. */
  cancelTransformSession(): boolean {
    this.selectionTransform.cancelGesture()
    this.cageTransform.cancelGesture()
    if (this.drag === 'selectionTransform' || this.drag === 'cageTransform') {
      this.drag = 'none'
      this.pointerId = null
    }
    if (cancelCageTransform()) return true
    if (cancelSelectionTransform()) return true
    this.move.cancelGesture()
    if (this.drag === 'move') {
      this.drag = 'none'
      this.pointerId = null
    }
    return cancelFreeTransformSession()
  }

  /** Enter closes polygonal lasso or pen draft, or commits transform sessions. */
  commitSelectionGesture(): boolean {
    if (this.pen.closeDraft()) return true
    if (useCageTransformStore.getState().session) {
      this.cageTransform.cancelGesture()
      void commitCageTransform()
      return true
    }
    if (useSelectionTransformStore.getState().session) {
      this.selectionTransform.cancelGesture()
      return commitSelectionTransform()
    }
    if (this.selection.hasOpenPolygon) {
      return this.selection.closePolygon()
    }
    if (useTransformStore.getState().session) {
      this.move.cancelGesture()
      return commitFreeTransformSession()
    }
    return false
  }

  /** Tool switch: commit Free Transform session if leaving move. */
  onToolChanged(nextToolId: string): void {
    this.cancelSelectionGesture()
    const session = useTransformStore.getState().session
    if (session && nextToolId !== 'move') {
      commitFreeTransformSession()
    }
    if (useSelectionTransformStore.getState().session) {
      commitSelectionTransform()
    }
    if (useCageTransformStore.getState().session) {
      void commitCageTransform()
    }
    if (nextToolId !== 'brush' && nextToolId !== 'eraser') this.brush.clearAnchor()
    if (nextToolId !== 'gradient') this.gradient.cancel()
    if (!isPenToolId(nextToolId)) {
      if (this.pen.hasOpenDraft) {
        this.pen.commitOpenDraft()
      } else {
        this.pen.cancelDraft()
      }
      this.freeformPen.cancelDraft()
    }
    this.lastSample = null
    useToolModifierStatusStore.getState().setActiveConstraint(null)
  }

  /** Recompute active geometry when Shift/Alt changes without pointer movement. */
  modifiersChanged(mods: ToolModifiers = NO_MODIFIERS): void {
    const sample = this.lastSample
    if (!sample || this.drag === 'none') return
    const { x, y } = sample.doc
    if (this.drag === 'brush') {
      this.brush.pointerMove(x, y, sample.pressure, mods)
    } else if (this.drag === 'shape') {
      this.shape.pointerMove(x, y, sample.pointerId, mods)
    } else if (this.drag === 'pen') {
      this.pen.pointerMove(x, y, sample.pointerId, mods)
    } else if (this.drag === 'freeformPen') {
      this.freeformPen.pointerMove(x, y, sample.pointerId)
    } else if (this.drag === 'pathSelection') {
      this.pathSelection.pointerMove(x, y, sample.pointerId)
    } else if (this.drag === 'directSelection' || this.drag === 'convertPoint') {
      if (this.drag === 'convertPoint') {
        this.convertPoint.pointerMove(x, y, sample.pointerId, mods)
      } else {
        this.directSelection.pointerMove(x, y, sample.pointerId, mods)
      }
    } else if (this.drag === 'selection') {
      this.selection.pointerMove(x, y, sample.pointerId, mods)
    } else if (this.drag === 'selectionTransform') {
      this.selectionTransform.pointerMove(x, y, sample.pointerId, mods)
    } else if (this.drag === 'cageTransform') {
      this.cageTransform.pointerMove(x, y, sample.pointerId)
    } else if (this.drag === 'move') {
      this.move.pointerMove(x, y, sample.pointerId, mods)
    } else if (this.drag === 'crop') {
      useSelectionStore.getState().setMarquee(
        rectFromDrag(this.startDoc, { x, y }, {
          square: mods.shift,
          fromCenter: mods.alt,
        }),
      )
    }
    this.updateConstraintStatus(mods)
  }

  private docPoint(event: PointerEvent, ctx: ToolPointerContext) {
    const screen = mapClientToViewport(
      event.clientX,
      event.clientY,
      ctx.host,
      ctx.viewportWidth,
      ctx.viewportHeight,
    )
    return ctx.camera.screenToDocument(screen)
  }

  private snappedDocPoint(point: { x: number; y: number }, ctx: ToolPointerContext) {
    // Painting stays continuous; geometry tools and transforms receive a
    // guide/edge-aligned pointer in document space.
    if (!['shape', 'crop', 'selection', 'selectionTransform', 'cageTransform', 'move', 'pen', 'freeformPen', 'pathSelection', 'directSelection', 'addAnchor', 'deleteAnchor', 'convertPoint'].includes(this.drag)) {
      return point
    }
    const { settings } = useSnapPreferencesStore.getState()
    const canvas = useEditorSessionStore.getState().document.canvas
    return snapPointToGuides(point, {
      enabled: settings.enabled,
      threshold: settings.threshold / Math.max(ctx.camera.getState().zoom, 0.02),
      width: canvas.width,
      height: canvas.height,
    })
  }

  async pointerDown(
    event: PointerEvent,
    ctx: ToolPointerContext,
  ): Promise<boolean> {
    const tool = useEditorSessionStore.getState().activeToolId
    const brushTool = tool === 'brush' || tool === 'eraser' || tool === 'pencil'
    if (brushTool && event.button === 2 && event.altKey) {
      const prefs = useBrushSettingsStore.getState()
      this.drag = 'brushAdjust'
      this.pointerId = event.pointerId
      this.brushAdjustStart = { x: event.clientX, y: event.clientY, size: prefs.size, hardness: prefs.hardness }
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }
    if (event.button !== 0) return false
    const doc = this.snappedDocPoint(this.docPoint(event, ctx), ctx)
    const mods = readModifiers(event)

    if (useCageTransformStore.getState().session) {
      const ok = this.cageTransform.pointerDown(
        doc.x,
        doc.y,
        event.pointerId,
        ctx.camera.getState().zoom,
        mods.alt,
      )
      if (!ok) return false
      if (this.cageTransform.isDragging) {
        this.drag = 'cageTransform'
        this.pointerId = event.pointerId
        this.lastSample = { doc, pressure: event.pressure || 1, pointerId: event.pointerId }
        ctx.host.setPointerCapture(event.pointerId)
      }
      return true
    }

    if (useSelectionTransformStore.getState().session) {
      const ok = this.selectionTransform.pointerDown(
        doc.x,
        doc.y,
        event.pointerId,
        ctx.camera.getState().zoom,
        mods,
      )
      if (!ok) return false
      this.drag = 'selectionTransform'
      this.pointerId = event.pointerId
      this.modifiersAtDown = mods
      this.lastSample = { doc, pressure: event.pressure || 1, pointerId: event.pointerId }
      this.updateConstraintStatus(mods)
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    // ColorPicker canvas eyedropper — sample selected raster layer.
    const colorEye = getColorEyedropperState()
    if (colorEye.active && colorEye.onSample) {
      const session = useEditorSessionStore.getState()
      const activeId = session.selectedLayerIds[0]
      const layer = activeId ? session.document.layers[activeId] : null
      if (layer && layer.type === 'raster') {
        const local = documentToLayerLocal(doc, layer.transform)
        const rgb = await sampleLayerAssetColor(layer.pixels, local.x, local.y)
        if (rgb) {
          colorEye.onSample(rgbToCssHex(rgb))
          endColorEyedropper()
        }
      }
      return true
    }

    // Layer Style chroma eyedropper / flood seed (dialog-scoped).
    const sample = getChromaSampleState()
    if (sample.kind && sample.layerId) {
      const session = useEditorSessionStore.getState()
      const layerId = sample.layerId as LayerId
      const layer = session.document.layers[layerId]
      if (layer && layer.type === 'raster') {
        const local = documentToLayerLocal(doc, layer.transform)
        if (sample.kind === 'flood-origin' && sample.onFloodOrigin) {
          sample.onFloodOrigin(
            { x: Math.round(local.x), y: Math.round(local.y) },
            event.shiftKey,
          )
          if (!event.shiftKey) endChromaSample()
          return true
        }
        if (sample.kind === 'key-color' && sample.onKeyColor) {
          const rgb = await sampleLayerAssetColor(layer.pixels, local.x, local.y)
          if (rgb) {
            sample.onKeyColor(rgbToCssHex(rgb))
            endChromaSample()
          }
          return true
        }
      }
      return true
    }

    if (tool === 'brush' || tool === 'eraser' || tool === 'pencil') {
      // Alt = temporary eyedropper (PS habit): sample FG from canvas, no stroke.
      if (mods.alt) {
        const rgb = await sampleMergedColorAt(
          useEditorSessionStore.getState().document,
          doc.x,
          doc.y,
        )
        if (rgb) useColorStore.getState().setForeground(rgbToCssHex(rgb))
        this.drag = 'eyedropper'
        this.pointerId = event.pointerId
        ctx.host.setPointerCapture(event.pointerId)
        return true
      }
      this.brush.pullSettings(tool === 'eraser' ? 'erase' : 'paint')
      if (tool === 'pencil') this.brush.settings = readPencilEngineSettings()
      const ok = await this.brush.pointerDown(
        doc.x,
        doc.y,
        brushPressureFromPointerEvent(event),
        mods,
      )
      if (!ok) return false
      this.drag = 'brush'
      this.pointerId = event.pointerId
      this.modifiersAtDown = mods
      this.lastSample = {
        doc,
        pressure: brushPressureFromPointerEvent(event),
        pointerId: event.pointerId,
      }
      this.updateConstraintStatus(mods)
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    const retouch =
      tool === 'cloneStamp' ? this.clone
        : tool === 'historyBrush' ? this.historyBrush
          : tool === 'patternStamp' ? this.patternStamp
            : tool === 'smudge' ? this.smudge
          : tool === 'blur' ? this.blur
            : tool === 'sharpen' ? this.sharpen
              : tool === 'dodge' ? this.dodge
                : tool === 'burn' ? this.burn
                  : tool === 'sponge' ? this.sponge
                    : tool === 'spotHealing' ? this.spotHeal
                      : tool === 'healingBrush' ? this.heal
                      : null
    if (retouch) {
      const ok = await retouch.pointerDown(doc.x, doc.y, mods.alt)
      if (!ok) return false
      // Alt-click only assigns a Clone / Healing Brush source.
      if ((tool === 'cloneStamp' || tool === 'healingBrush') && mods.alt) return true
      this.drag = 'retouch'
      this.pointerId = event.pointerId
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    if (isLiquifyTool(tool)) {
      const kind = liquifyKindForTool(tool)!
      const liquify = this.liquifyControllers.get(kind)!
      const ok = await liquify.pointerDown(doc.x, doc.y)
      if (!ok) return false
      this.drag = 'liquify'
      this.pointerId = event.pointerId
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    if (tool === 'text') {
      this.text.pointerDown(doc.x, doc.y, event.pointerId, mods)
      this.drag = 'text'
      this.pointerId = event.pointerId
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    if (tool === 'shape') {
      this.shape.pointerDown(doc.x, doc.y, event.pointerId)
      this.drag = 'shape'
      this.pointerId = event.pointerId
      this.modifiersAtDown = mods
      this.lastSample = { doc, pressure: event.pressure || 1, pointerId: event.pointerId }
      this.updateConstraintStatus(mods)
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    if (tool === 'freeformPen') {
      const ok = this.freeformPen.pointerDown(doc.x, doc.y, event.pointerId)
      if (!ok) return false
      this.drag = 'freeformPen'
      this.pointerId = event.pointerId
      this.modifiersAtDown = mods
      this.lastSample = { doc, pressure: event.pressure || 1, pointerId: event.pointerId }
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    if (tool === 'addAnchor') {
      const ok = this.addAnchor.pointerDown(doc.x, doc.y, event.pointerId, ctx.camera.getState().zoom)
      if (!ok) return false
      this.drag = 'addAnchor'
      this.pointerId = event.pointerId
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    if (tool === 'deleteAnchor') {
      const ok = this.deleteAnchor.pointerDown(doc.x, doc.y, event.pointerId, ctx.camera.getState().zoom)
      if (!ok) return false
      this.drag = 'deleteAnchor'
      this.pointerId = event.pointerId
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    if (tool === 'convertPoint' && !(mods.ctrl || mods.meta)) {
      const ok = this.convertPoint.pointerDown(
        doc.x,
        doc.y,
        event.pointerId,
        ctx.camera.getState().zoom,
        mods,
      )
      if (!ok) return false
      this.drag = 'convertPoint'
      this.pointerId = event.pointerId
      this.modifiersAtDown = mods
      this.lastSample = { doc, pressure: event.pressure || 1, pointerId: event.pointerId }
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    // Pen + Cmd/Ctrl (or Convert Point + Cmd) → temporary Direct Selection
    if (
      (tool === 'pen' || tool === 'convertPoint') &&
      (mods.ctrl || mods.meta)
    ) {
      const ok = this.directSelection.pointerDown(
        doc.x,
        doc.y,
        event.pointerId,
        ctx.camera.getState().zoom,
        mods,
      )
      if (!ok) return false
      this.drag = 'directSelection'
      this.pointerId = event.pointerId
      this.modifiersAtDown = mods
      this.lastSample = { doc, pressure: event.pressure || 1, pointerId: event.pointerId }
      this.updateConstraintStatus(mods)
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    if (tool === 'pen') {
      const now = performance.now()
      const isDouble =
        now - this.lastClickAt < 350 &&
        Math.hypot(doc.x - this.lastClickDoc.x, doc.y - this.lastClickDoc.y) < 6
      this.lastClickAt = now
      this.lastClickDoc = { x: doc.x, y: doc.y }
      if (isDouble) {
        this.pen.closeDraft()
        return true
      }
      const ok = this.pen.pointerDown(doc.x, doc.y, event.pointerId, mods)
      if (!ok) return false
      this.drag = 'pen'
      this.pointerId = event.pointerId
      this.modifiersAtDown = mods
      this.lastSample = { doc, pressure: event.pressure || 1, pointerId: event.pointerId }
      this.updateConstraintStatus(mods)
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    if (tool === 'pathSelection') {
      const ok = this.pathSelection.pointerDown(
        doc.x,
        doc.y,
        event.pointerId,
        ctx.camera.getState().zoom,
      )
      if (!ok) return false
      this.drag = 'pathSelection'
      this.pointerId = event.pointerId
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    if (tool === 'directSelection') {
      const ok = this.directSelection.pointerDown(
        doc.x,
        doc.y,
        event.pointerId,
        ctx.camera.getState().zoom,
        mods,
      )
      if (!ok) return false
      this.drag = 'directSelection'
      this.pointerId = event.pointerId
      this.modifiersAtDown = mods
      this.lastSample = { doc, pressure: event.pressure || 1, pointerId: event.pointerId }
      this.updateConstraintStatus(mods)
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    if (tool === 'gradient') {
      if (!this.gradient.pointerDown(doc.x, doc.y)) return false
      this.drag = 'gradient'
      this.pointerId = event.pointerId
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    if (tool === 'magicWand') {
      this.drag = 'wand'
      this.pointerId = event.pointerId
      const ok = await applyMagicWandAt(doc.x, doc.y)
      // PS New mode: empty / failed click clears the current selection.
      if (
        !ok &&
        useSelectionToolStore.getState().combineMode === 'new' &&
        useSelectionStore.getState().hasSelection()
      ) {
        useSelectionStore.getState().deselect()
      }
      this.drag = 'none'
      this.pointerId = null
      return true
    }

    if (tool === 'paintBucket') {
      this.drag = 'fill'
      this.pointerId = event.pointerId
      await applyPaintBucketAt(doc.x, doc.y)
      this.drag = 'none'
      this.pointerId = null
      return true
    }

    if (tool === 'marquee' || tool === 'lasso') {
      const lassoMode = useSelectionToolStore.getState().lassoMode
      if (tool === 'lasso' && lassoMode === 'magnetic') {
        const field = await buildDocumentEdgeField(
          useEditorSessionStore.getState().document,
        )
        this.selection.setMagneticField(field)
      }
      const now = performance.now()
      const isDouble =
        tool === 'lasso' &&
        lassoMode === 'polygonal' &&
        now - this.lastClickAt < 350 &&
        Math.hypot(doc.x - this.lastClickDoc.x, doc.y - this.lastClickDoc.y) < 6
      this.lastClickAt = now
      this.lastClickDoc = { x: doc.x, y: doc.y }
      if (isDouble) {
        this.selection.closePolygon()
        return true
      }
      const ok = this.selection.pointerDown(doc.x, doc.y, event.pointerId, mods)
      if (!ok) return false
      this.drag = 'selection'
      this.pointerId = event.pointerId
      this.modifiersAtDown = mods
      this.lastSample = { doc, pressure: event.pressure || 1, pointerId: event.pointerId }
      this.updateConstraintStatus(mods)
      const poly =
        tool === 'lasso' &&
        lassoMode === 'polygonal'
      if (!poly) ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    if (tool === 'crop') {
      this.drag = 'crop'
      this.pointerId = event.pointerId
      this.modifiersAtDown = mods
      this.startDoc = { x: doc.x, y: doc.y }
      useSelectionStore.getState().setMarquee({
        x: doc.x,
        y: doc.y,
        width: 0,
        height: 0,
      })
      ctx.host.setPointerCapture(event.pointerId)
      this.lastSample = { doc, pressure: event.pressure || 1, pointerId: event.pointerId }
      this.updateConstraintStatus(mods)
      return true
    }

    if (tool === 'move' || useTransformStore.getState().session) {
      const zoom = ctx.camera.getState().zoom
      const ok = await this.move.pointerDown(
        doc.x,
        doc.y,
        event.pointerId,
        zoom,
        mods,
      )
      if (!ok) return false
      this.drag = 'move'
      this.pointerId = event.pointerId
      this.modifiersAtDown = mods
      this.lastSample = { doc, pressure: event.pressure || 1, pointerId: event.pointerId }
      ctx.host.setPointerCapture(event.pointerId)
      return true
    }

    return false
  }

  async pointerMove(
    event: PointerEvent,
    ctx: ToolPointerContext,
  ): Promise<void> {
    const tool = useEditorSessionStore.getState().activeToolId
    const doc = this.snappedDocPoint(this.docPoint(event, ctx), ctx)
    const mods = readModifiers(event)

    // Polygonal rubber-band tracks cursor without capture.
    if (
      tool === 'lasso' &&
      useSelectionToolStore.getState().lassoMode === 'polygonal' &&
      this.selection.hasOpenPolygon &&
      this.drag !== 'brush'
    ) {
      this.selection.pointerMove(
        doc.x,
        doc.y,
        this.pointerId ?? event.pointerId,
        mods,
      )
    }

    // Pen idle rubber-band while a draft is open (no capture required).
    if (tool === 'pen' && this.drag === 'none' && this.pen.hasOpenDraft) {
      this.pen.pointerMove(doc.x, doc.y, event.pointerId, mods)
    }

    if (this.pointerId !== event.pointerId) return
    this.lastSample = {
      doc,
      pressure: brushPressureFromPointerEvent(event),
      pointerId: event.pointerId,
    }

    if (this.drag === 'eyedropper') {
      const rgb = await sampleMergedColorAt(
        useEditorSessionStore.getState().document,
        doc.x,
        doc.y,
      )
      if (rgb) useColorStore.getState().setForeground(rgbToCssHex(rgb))
      return
    }

    if (this.drag === 'brushAdjust' && this.brushAdjustStart) {
      const start = this.brushAdjustStart
      useBrushSettingsStore.getState().setPrefs({
        size: start.size + event.clientX - start.x,
        hardness: start.hardness - (event.clientY - start.y) / 200,
      })
      return
    }

    if (this.drag === 'brush') {
      // Coalesced samples stamp synchronously; preview flush is rAF-batched
      // inside BrushToolController (avoid await/sync per sample).
      const coalesced =
        typeof event.getCoalescedEvents === 'function'
          ? event.getCoalescedEvents()
          : [event]
      for (const e of coalesced) {
        const d = this.docPoint(e, ctx)
        this.brush.pointerMove(
          d.x,
          d.y,
          brushPressureFromPointerEvent(e),
          readModifiers(e),
        )
      }
      return
    }
    if (this.drag === 'retouch') {
      const retouch =
        tool === 'cloneStamp' ? this.clone
          : tool === 'historyBrush' ? this.historyBrush
            : tool === 'patternStamp' ? this.patternStamp
              : tool === 'smudge' ? this.smudge
            : tool === 'blur' ? this.blur
              : tool === 'sharpen' ? this.sharpen
                : tool === 'dodge' ? this.dodge
                  : tool === 'burn' ? this.burn
                    : tool === 'sponge' ? this.sponge
                      : tool === 'spotHealing' ? this.spotHeal
                        : this.heal
      retouch.pointerMove(doc.x, doc.y)
      return
    }
    if (this.drag === 'liquify') {
      const tool = useEditorSessionStore.getState().activeToolId
      const kind = liquifyKindForTool(tool)
      if (kind) this.liquifyControllers.get(kind)!.pointerMove(doc.x, doc.y)
      return
    }

    if (this.drag === 'text') {
      this.text.pointerMove(doc.x, doc.y, event.pointerId, mods)
      return
    }

    if (this.drag === 'shape') {
      this.shape.pointerMove(doc.x, doc.y, event.pointerId, mods)
      return
    }

    if (this.drag === 'pen') {
      this.pen.pointerMove(doc.x, doc.y, event.pointerId, mods)
      this.updateConstraintStatus(mods)
      return
    }

    if (this.drag === 'freeformPen') {
      this.freeformPen.pointerMove(doc.x, doc.y, event.pointerId)
      return
    }

    if (this.drag === 'pathSelection') {
      this.pathSelection.pointerMove(doc.x, doc.y, event.pointerId)
      return
    }

    if (this.drag === 'directSelection') {
      this.directSelection.pointerMove(doc.x, doc.y, event.pointerId, mods)
      this.updateConstraintStatus(mods)
      return
    }

    if (this.drag === 'convertPoint') {
      this.convertPoint.pointerMove(doc.x, doc.y, event.pointerId, mods)
      this.updateConstraintStatus(mods)
      return
    }

    if (this.drag === 'gradient') return

    if (this.drag === 'selection') {
      this.selection.pointerMove(doc.x, doc.y, event.pointerId, mods)
      return
    }
    if (this.drag === 'selectionTransform') {
      this.selectionTransform.pointerMove(doc.x, doc.y, event.pointerId, mods)
      return
    }
    if (this.drag === 'cageTransform') {
      this.cageTransform.pointerMove(doc.x, doc.y, event.pointerId)
      return
    }

    if (this.drag === 'move') {
      this.move.pointerMove(doc.x, doc.y, event.pointerId, mods)
      return
    }

    if (this.drag === 'crop') {
      useSelectionStore.getState().setMarquee(
        rectFromDrag(this.startDoc, doc, {
          square: mods.shift,
          fromCenter: mods.alt,
        }),
      )
    }
    this.updateConstraintStatus(mods)
  }

  async pointerUp(
    event: PointerEvent,
    ctx: ToolPointerContext,
  ): Promise<void> {
    if (this.pointerId !== event.pointerId && this.drag !== 'none') {
      // Polygonal clicks don't hold capture — ignore mismatched ups.
      if (
        !(
          useEditorSessionStore.getState().activeToolId === 'lasso' &&
          useSelectionToolStore.getState().lassoMode === 'polygonal'
        )
      ) {
        return
      }
    }
    if (this.pointerId !== event.pointerId && this.drag === 'none') return

    const doc = this.docPoint(event, ctx)

    if (this.drag === 'brushAdjust') this.brushAdjustStart = null
    if (this.drag === 'brush') {
      await this.brush.pointerUp()
    }
    if (this.drag === 'retouch') {
      const tool = useEditorSessionStore.getState().activeToolId
      const retouch =
        tool === 'cloneStamp' ? this.clone
          : tool === 'historyBrush' ? this.historyBrush
            : tool === 'patternStamp' ? this.patternStamp
              : tool === 'smudge' ? this.smudge
            : tool === 'blur' ? this.blur
              : tool === 'sharpen' ? this.sharpen
                : tool === 'dodge' ? this.dodge
                  : tool === 'burn' ? this.burn
                    : tool === 'sponge' ? this.sponge
                      : tool === 'spotHealing' ? this.spotHeal
                        : this.heal
      await retouch.pointerUp()
    }
    if (this.drag === 'liquify') {
      const tool = useEditorSessionStore.getState().activeToolId
      const kind = liquifyKindForTool(tool)
      if (kind) await this.liquifyControllers.get(kind)!.pointerUp()
    }
    if (this.drag === 'text') {
      this.text.pointerUp(
        doc.x,
        doc.y,
        event.pointerId,
        readModifiers(event),
      )
    }
    if (this.drag === 'shape') {
      this.shape.pointerUp(doc.x, doc.y, event.pointerId, readModifiers(event))
    }
    if (this.drag === 'pen') {
      this.pen.pointerUp(doc.x, doc.y, event.pointerId, readModifiers(event))
    }
    if (this.drag === 'freeformPen') {
      this.freeformPen.pointerUp(doc.x, doc.y, event.pointerId)
    }
    if (this.drag === 'pathSelection') {
      this.pathSelection.pointerUp(doc.x, doc.y, event.pointerId)
    }
    if (this.drag === 'directSelection') {
      this.directSelection.pointerUp(doc.x, doc.y, event.pointerId)
    }
    if (this.drag === 'convertPoint') {
      this.convertPoint.pointerUp(doc.x, doc.y, event.pointerId)
    }
    if (this.drag === 'gradient') {
      await this.gradient.pointerUp(doc.x, doc.y)
    }
    if (this.drag === 'selection') {
      const poly =
        useEditorSessionStore.getState().activeToolId === 'lasso' &&
        useSelectionToolStore.getState().lassoMode === 'polygonal'
      if (!poly) {
        this.selection.pointerUp(
          doc.x,
          doc.y,
          event.pointerId,
          readModifiers(event),
        )
      }
    }
    if (this.drag === 'selectionTransform') {
      this.selectionTransform.pointerUp(event.pointerId)
    }
    if (this.drag === 'cageTransform') {
      this.cageTransform.pointerUp(event.pointerId)
    }
    if (this.drag === 'move') {
      this.move.pointerUp(event.pointerId)
    }
    if (this.drag === 'crop') {
      // Crop commits via Image → Crop or Enter (`image.crop.commit`); keep marquee.
    }
    this.drag = 'none'
    this.pointerId = null
    this.lastSample = null
    this.modifiersAtDown = NO_MODIFIERS
    useToolModifierStatusStore.getState().setActiveConstraint(null)
  }

  get isDragging(): boolean {
    return this.drag !== 'none' || this.selection.isDragging || this.move.isDragging
  }

  private updateConstraintStatus(mods: ToolModifiers): void {
    let active: string | null = null
    if (this.drag === 'brush' && mods.shift) {
      active = this.modifiersAtDown.shift ? 'Straight line' : '45°'
    }
    if (this.drag === 'pen' || this.drag === 'directSelection' || this.drag === 'convertPoint') {
      if (mods.shift) active = '45°'
      else if (mods.alt) active = 'Cusp'
      else if (mods.ctrl || mods.meta) active = 'Direct Select'
    }
    if (this.drag === 'shape' || this.drag === 'crop') {
      active = mods.shift ? 'Square' : mods.alt ? 'From center' : null
    }
    if (this.drag === 'selection') {
      active =
        this.modifiersAtDown.shift && !this.modifiersAtDown.alt
          ? 'Add to selection'
          : this.modifiersAtDown.alt && !this.modifiersAtDown.shift
            ? 'Subtract from selection'
            : mods.shift
              ? 'Square'
              : mods.alt
                ? 'From center'
                : null
    }
    if (this.drag === 'move' && this.modifiersAtDown.alt) {
      active = 'Duplicate'
    }
    if (this.drag === 'selectionTransform') {
      active =
        this.modifiersAtDown.ctrl || this.modifiersAtDown.meta
          ? this.modifiersAtDown.alt
            ? 'Perspective'
            : 'Skew'
          : this.modifiersAtDown.shift
            ? 'Constrain aspect'
            : null
    }
    useToolModifierStatusStore.getState().setActiveConstraint(active)
  }
}
