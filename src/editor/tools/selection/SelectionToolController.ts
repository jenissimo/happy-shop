import { SelectionMask, type SelectionPoint } from '../../session/SelectionMask'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { useSelectionStore } from '../../session/selectionStore'
import { useSelectionToolStore } from '../../session/selectionToolStore'
import {
  marqueeStyleIgnoresMinDrag,
  marqueeStyleUsesRectMask,
  resolveMarqueeRect,
} from './marqueeRect'
import {
  snapPointToEdge,
  traceMagneticSegment,
  type EdgeField,
} from './magneticLasso'
import {
  NO_MODIFIERS,
  normalizeModifiers,
  type ToolModifiers,
} from '../toolModifiers'

const CLOSE_DIST_PX = 8
const MIN_SHAPE = 1

/**
 * Marquee (rect/ellipse) + freehand / polygonal / magnetic lasso input.
 * Live preview lives in `selectionToolStore`; commit uses `applyMask`.
 *
 * Marquee modifiers: Shift → 1:1; Alt → from center.
 */
export class SelectionToolController {
  private drag:
    | 'none'
    | 'marquee'
    | 'lasso-freehand'
    | 'lasso-poly'
    | 'lasso-magnetic' = 'none'
  private start = { x: 0, y: 0 }
  private pointerId: number | null = null
  private polyPoints: SelectionPoint[] = []
  private freehand: SelectionPoint[] = []
  private magnetic: SelectionPoint[] = []
  private magneticField: EdgeField | null = null
  private modifiersAtDown = NO_MODIFIERS
  private combineOverride: 'add' | 'subtract' | 'intersect' | null = null
  private repositioning = false
  private repositionPoint: SelectionPoint | null = null

  /** Space during an active marquee moves its origin without resizing it. */
  setRepositioning(active: boolean): void {
    this.repositioning = active
    if (!active) this.repositionPoint = null
  }

  /** Preload merged-canvas edge field before magnetic lasso gestures. */
  setMagneticField(field: EdgeField | null): void {
    this.magneticField = field
  }

  pointerDown(
    docX: number,
    docY: number,
    pointerId: number,
    mods: ToolModifiers = NO_MODIFIERS,
  ): boolean {
    mods = normalizeModifiers(mods)
    const tool = useEditorSessionStore.getState().activeToolId
    const tools = useSelectionToolStore.getState()

    if (tool === 'marquee') {
      this.drag = 'marquee'
      this.pointerId = pointerId
      this.start = { x: docX, y: docY }
      this.modifiersAtDown = mods
      this.combineOverride =
        mods.shift && mods.alt
          ? 'intersect'
          : mods.shift
            ? 'add'
            : mods.alt
              ? 'subtract'
              : null
      const rect = this.marqueeRect(docX, docY, mods)
      const useEllipse =
        tools.marqueeShape === 'ellipse' &&
        !marqueeStyleUsesRectMask(tools.marqueeStyle)
      tools.setPreview(
        useEllipse ? { kind: 'ellipse', rect } : { kind: 'rect', rect },
      )
      return true
    }

    if (tool === 'lasso') {
      if (tools.lassoMode === 'polygonal') {
        return this.polyClick(docX, docY, pointerId)
      }
      if (tools.lassoMode === 'magnetic') {
        this.drag = 'lasso-magnetic'
        this.pointerId = pointerId
        const seed = this.magneticField
          ? snapPointToEdge(docX, docY, this.magneticField)
          : { x: docX, y: docY }
        this.magnetic = [seed]
        tools.setPreview({
          kind: 'path',
          points: [...this.magnetic],
          closed: false,
        })
        return true
      }
      this.drag = 'lasso-freehand'
      this.pointerId = pointerId
      this.freehand = [{ x: docX, y: docY }]
      tools.setPreview({
        kind: 'path',
        points: [...this.freehand],
        closed: false,
      })
      return true
    }

    return false
  }

  pointerMove(
    docX: number,
    docY: number,
    pointerId: number,
    mods: ToolModifiers = NO_MODIFIERS,
  ): void {
    mods = normalizeModifiers(mods)
    const tools = useSelectionToolStore.getState()

    if (this.drag === 'marquee' && this.pointerId === pointerId) {
      if (this.repositioning) {
        if (this.repositionPoint) {
          this.start.x += docX - this.repositionPoint.x
          this.start.y += docY - this.repositionPoint.y
        }
        this.repositionPoint = { x: docX, y: docY }
      } else {
        this.repositionPoint = null
      }
      const rect = this.marqueeRect(docX, docY, mods)
      const useEllipse =
        tools.marqueeShape === 'ellipse' &&
        !marqueeStyleUsesRectMask(tools.marqueeStyle)
      tools.setPreview(
        useEllipse ? { kind: 'ellipse', rect } : { kind: 'rect', rect },
      )
      return
    }

    if (this.drag === 'lasso-freehand' && this.pointerId === pointerId) {
      const last = this.freehand[this.freehand.length - 1]
      if (
        !last ||
        Math.hypot(docX - last.x, docY - last.y) >= 1
      ) {
        this.freehand.push({ x: docX, y: docY })
        tools.setPreview({
          kind: 'path',
          points: [...this.freehand],
          closed: false,
        })
      }
      return
    }

    if (this.drag === 'lasso-magnetic' && this.pointerId === pointerId) {
      this.appendMagnetic(docX, docY)
      return
    }

    if (this.polyPoints.length > 0 && tools.lassoMode === 'polygonal') {
      const rubber = [...this.polyPoints, { x: docX, y: docY }]
      tools.setPreview({ kind: 'path', points: rubber, closed: false })
    }
  }

  pointerUp(
    docX: number,
    docY: number,
    pointerId: number,
    mods: ToolModifiers = NO_MODIFIERS,
  ): void {
    mods = normalizeModifiers(mods)
    const tools = useSelectionToolStore.getState()

    if (this.drag === 'marquee' && this.pointerId === pointerId) {
      this.drag = 'none'
      this.pointerId = null
      const rect = this.marqueeRect(docX, docY, mods)
      useSelectionToolStore.getState().clearPreview()
      const ignoreMinDrag = marqueeStyleIgnoresMinDrag(tools.marqueeStyle)
      if (
        !ignoreMinDrag &&
        (rect.width < MIN_SHAPE || rect.height < MIN_SHAPE)
      ) {
        this.clearSelectionIfNewMode(this.combineOverride ?? undefined)
        return
      }
      const { width, height } = useEditorSessionStore.getState().document.canvas
      const { marqueeShape: shape, antiAlias, featherRadius, marqueeStyle } =
        tools
      const useEllipse =
        shape === 'ellipse' && !marqueeStyleUsesRectMask(marqueeStyle)
      const incoming = useEllipse
        ? SelectionMask.fromEllipse(width, height, rect, { antiAlias })
        : SelectionMask.fromRect(width, height, rect, { antiAlias })
      const committed = featherRadius > 0 ? incoming.feather(featherRadius) : incoming
      if (!committed.isEmpty()) {
        useSelectionStore.getState().applyMask(
          committed,
          this.combineOverride ?? undefined,
        )
      }
      return
    }

    if (this.drag === 'lasso-freehand' && this.pointerId === pointerId) {
      this.drag = 'none'
      this.pointerId = null
      const last = this.freehand[this.freehand.length - 1]
      if (
        !last ||
        Math.hypot(docX - last.x, docY - last.y) >= 1
      ) {
        this.freehand.push({ x: docX, y: docY })
      }
      useSelectionToolStore.getState().clearPreview()
      this.commitPolygon(this.freehand)
      this.freehand = []
      return
    }

    if (this.drag === 'lasso-magnetic' && this.pointerId === pointerId) {
      this.drag = 'none'
      this.pointerId = null
      this.appendMagnetic(docX, docY)
      useSelectionToolStore.getState().clearPreview()
      this.commitPolygon(this.magnetic)
      this.magnetic = []
    }
  }

  /** Enter / double-click closes polygonal lasso. */
  closePolygon(): boolean {
    if (this.polyPoints.length < 3) {
      this.cancelPolygon()
      return false
    }
    const pts = [...this.polyPoints]
    this.polyPoints = []
    this.drag = 'none'
    this.pointerId = null
    useSelectionToolStore.getState().clearPreview()
    this.commitPolygon(pts)
    return true
  }

  cancelPolygon(): void {
    this.polyPoints = []
    this.freehand = []
    this.magnetic = []
    this.drag = 'none'
    this.pointerId = null
    useSelectionToolStore.getState().clearPreview()
  }

  get isDragging(): boolean {
    return this.drag !== 'none' || this.polyPoints.length > 0
  }

  get hasOpenPolygon(): boolean {
    return this.polyPoints.length > 0
  }

  private appendMagnetic(docX: number, docY: number): void {
    const field = this.magneticField
    const target = field
      ? snapPointToEdge(docX, docY, field)
      : { x: docX, y: docY }
    const last = this.magnetic[this.magnetic.length - 1]
    if (!last) {
      this.magnetic = [target]
    } else if (field) {
      const segment = traceMagneticSegment(last, target, field)
      for (const point of segment) {
        const prev = this.magnetic[this.magnetic.length - 1]
        if (!prev || prev.x !== point.x || prev.y !== point.y) {
          this.magnetic.push(point)
        }
      }
    } else if (Math.hypot(target.x - last.x, target.y - last.y) >= 1) {
      this.magnetic.push(target)
    }
    useSelectionToolStore.getState().setPreview({
      kind: 'path',
      points: [...this.magnetic],
      closed: false,
    })
  }

  private polyClick(docX: number, docY: number, pointerId: number): boolean {
    this.pointerId = pointerId
    this.drag = 'lasso-poly'
    if (this.polyPoints.length >= 3) {
      const first = this.polyPoints[0]!
      if (Math.hypot(docX - first.x, docY - first.y) <= CLOSE_DIST_PX) {
        this.closePolygon()
        return true
      }
    }
    this.polyPoints.push({ x: docX, y: docY })
    useSelectionToolStore.getState().setPreview({
      kind: 'path',
      points: [...this.polyPoints],
      closed: false,
    })
    return true
  }

  private commitPolygon(points: SelectionPoint[]): void {
    if (points.length < 3) {
      this.clearSelectionIfNewMode()
      return
    }
    const { width, height } = useEditorSessionStore.getState().document.canvas
    const { antiAlias, featherRadius } = useSelectionToolStore.getState()
    const incoming = SelectionMask.fromPolygon(width, height, points, { antiAlias })
    const committed = featherRadius > 0 ? incoming.feather(featherRadius) : incoming
    if (!committed.isEmpty()) {
      useSelectionStore.getState().applyMask(committed)
    } else {
      this.clearSelectionIfNewMode()
    }
  }

  /** Combine Add/Subtract/Intersect must not clear on empty click. */
  private clearSelectionIfNewMode(mode?: 'add' | 'subtract' | 'intersect'): void {
    const effective = mode ?? useSelectionToolStore.getState().combineMode
    if (effective !== 'new') return
    if (!useSelectionStore.getState().hasSelection()) return
    useSelectionStore.getState().deselect()
  }

  private marqueeRect(docX: number, docY: number, mods: ToolModifiers) {
    const { document } = useEditorSessionStore.getState()
    const { marqueeStyle, marqueeShape, fixedMarqueeWidth, fixedMarqueeHeight } =
      useSelectionToolStore.getState()
    // An ellipse must keep the raw drag rect: clamping the AABB would rescale
    // the ellipse into the on-canvas box instead of cutting it off.
    const useEllipse =
      marqueeShape === 'ellipse' && !marqueeStyleUsesRectMask(marqueeStyle)
    return resolveMarqueeRect({
      start: this.start,
      end: { x: docX, y: docY },
      mods,
      modifiersAtDown: this.modifiersAtDown,
      style: marqueeStyle,
      fixedSize: {
        width: fixedMarqueeWidth,
        height: fixedMarqueeHeight,
      },
      canvas: document.canvas,
      clampToCanvas: !useEllipse,
    })
  }
}
