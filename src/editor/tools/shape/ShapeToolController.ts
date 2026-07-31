import { useSelectionStore } from '../../session/selectionStore'
import {
  POINTER_DRAG_THRESHOLD_PX,
  isDrag,
  rectFromDrag,
} from '../constrain'
import {
  NO_MODIFIERS,
  normalizeModifiers,
  type ToolModifiers,
} from '../toolModifiers'
import { createAndSelectShapeLayer } from './shapeCommands'
import { useShapeToolStore } from './shapeToolStore'

const DEFAULT_CLICK_W = 200
const DEFAULT_CLICK_H = 120

/**
 * Shape tool U: drag → shape at marquee bounds; click → default-sized shape
 * centered on the click (SPECS/UX-PHOTOSHOP.md M4.5).
 *
 * Drag modifiers: Shift → 1:1; Alt → from center.
 */
export class ShapeToolController {
  private dragging = false
  private start = { x: 0, y: 0 }
  private pointerId: number | null = null

  pointerDown(docX: number, docY: number, pointerId: number): boolean {
    this.dragging = true
    this.start = { x: docX, y: docY }
    this.pointerId = pointerId
    useSelectionStore.getState().setMarquee({
      x: docX,
      y: docY,
      width: 0,
      height: 0,
    })
    return true
  }

  pointerMove(
    docX: number,
    docY: number,
    pointerId: number,
    mods: ToolModifiers = NO_MODIFIERS,
  ): void {
    mods = normalizeModifiers(mods)
    if (!this.dragging || this.pointerId !== pointerId) return
    const rect = rectFromDrag(this.start, { x: docX, y: docY }, {
      square: mods.shift,
      fromCenter: mods.alt,
    })
    useSelectionStore.getState().setMarquee(rect)
  }

  pointerUp(
    docX: number,
    docY: number,
    pointerId: number,
    mods: ToolModifiers = NO_MODIFIERS,
  ): void {
    mods = normalizeModifiers(mods)
    if (!this.dragging || this.pointerId !== pointerId) return
    this.dragging = false
    this.pointerId = null
    useSelectionStore.getState().deselect()

    const opts = useShapeToolStore.getState().options
    const rect = rectFromDrag(this.start, { x: docX, y: docY }, {
      square: mods.shift,
      fromCenter: mods.alt,
    })
    const w = rect.width
    const h = rect.height

    if (isDrag(this.start, { x: docX, y: docY }, 1, POINTER_DRAG_THRESHOLD_PX)) {
      createAndSelectShapeLayer({
        primitive: opts.primitive,
        x: rect.x,
        y: rect.y,
        w: Math.max(w, 1),
        h: Math.max(h, 1),
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
        cornerRadius: opts.cornerRadius,
        sides: opts.sides,
        starPoints: opts.starPoints,
        starInset: opts.starInset,
      })
      return
    }

    createAndSelectShapeLayer({
      primitive: opts.primitive,
      x: this.start.x - DEFAULT_CLICK_W / 2,
      y: this.start.y - DEFAULT_CLICK_H / 2,
      w: DEFAULT_CLICK_W,
      h: DEFAULT_CLICK_H,
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
      cornerRadius: opts.cornerRadius,
      sides: opts.sides,
      starPoints: opts.starPoints,
      starInset: opts.starInset,
    })
  }

  get isDragging(): boolean {
    return this.dragging
  }
}
