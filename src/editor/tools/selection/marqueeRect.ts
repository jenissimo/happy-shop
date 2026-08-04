import type { SelectionRect } from '../../session/SelectionMask'
import { rectFromDrag } from '../constrain'
import type { ToolModifiers } from '../toolModifiers'
import type { MarqueeStyle } from '../../session/selectionToolStore'

export type MarqueeRectInput = {
  start: { x: number; y: number }
  end: { x: number; y: number }
  mods: ToolModifiers
  modifiersAtDown: ToolModifiers
  style: MarqueeStyle
  fixedSize: { width: number; height: number }
  canvas: { width: number; height: number }
  /**
   * Clip the drag rect to the canvas (default). Ellipse marquees pass `false`:
   * clipping the AABB would squash the ellipse instead of cutting it off, so
   * the mask must receive the raw drag rect and clip while sampling.
   */
  clampToCanvas?: boolean
}

export function clampRectToCanvas(
  rect: SelectionRect,
  canvasWidth: number,
  canvasHeight: number,
): SelectionRect {
  if (canvasWidth < 1 || canvasHeight < 1) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const x = Math.max(0, Math.min(Math.floor(rect.x), canvasWidth - 1))
  const y = Math.max(0, Math.min(Math.floor(rect.y), canvasHeight - 1))
  if (rect.width <= 0 || rect.height <= 0) {
    return { x, y, width: 0, height: 0 }
  }
  const width = Math.max(1, Math.min(Math.ceil(rect.width), canvasWidth - x))
  const height = Math.max(1, Math.min(Math.ceil(rect.height), canvasHeight - y))
  return { x, y, width, height }
}

/** Resolve a document-space marquee rect from drag endpoints and style. */
export function resolveMarqueeRect(input: MarqueeRectInput): SelectionRect {
  const {
    start,
    end,
    mods,
    modifiersAtDown,
    style,
    fixedSize,
    canvas,
    clampToCanvas = true,
  } = input

  const clamp = (rect: SelectionRect): SelectionRect =>
    clampToCanvas ? clampRectToCanvas(rect, canvas.width, canvas.height) : rect

  switch (style) {
    case 'singlePixel':
      return clampRectToCanvas(
        {
          x: Math.floor(start.x),
          y: Math.floor(start.y),
          width: 1,
          height: 1,
        },
        canvas.width,
        canvas.height,
      )
    case 'singleRow': {
      const drag = rectFromDrag(start, end, {
        square: mods.shift && !modifiersAtDown.shift,
        fromCenter: mods.alt && !modifiersAtDown.alt,
      })
      const y = Math.round(Math.min(start.y, end.y))
      return clampRectToCanvas(
        { x: drag.x, y, width: Math.max(1, drag.width), height: 1 },
        canvas.width,
        canvas.height,
      )
    }
    case 'singleColumn': {
      const drag = rectFromDrag(start, end, {
        square: mods.shift && !modifiersAtDown.shift,
        fromCenter: mods.alt && !modifiersAtDown.alt,
      })
      const x = Math.round(Math.min(start.x, end.x))
      return clampRectToCanvas(
        { x, y: drag.y, width: 1, height: Math.max(1, drag.height) },
        canvas.width,
        canvas.height,
      )
    }
    case 'fixedSize': {
      const w = Math.max(1, Math.round(fixedSize.width))
      const h = Math.max(1, Math.round(fixedSize.height))
      const fromCenter = mods.alt && !modifiersAtDown.alt
      const cx = fromCenter ? start.x : start.x + (end.x - start.x) / 2
      const cy = fromCenter ? start.y : start.y + (end.y - start.y) / 2
      return clampRectToCanvas(
        {
          x: Math.round(cx - w / 2),
          y: Math.round(cy - h / 2),
          width: w,
          height: h,
        },
        canvas.width,
        canvas.height,
      )
    }
    case 'normal':
    default:
      return clamp(
        rectFromDrag(start, end, {
          square: mods.shift && !modifiersAtDown.shift,
          fromCenter: mods.alt && !modifiersAtDown.alt,
        }),
      )
  }
}

/** Styles that commit even when the drag distance is zero. */
export function marqueeStyleIgnoresMinDrag(style: MarqueeStyle): boolean {
  return style === 'singlePixel' || style === 'fixedSize'
}

/** Row/column/single-pixel styles always rasterize as axis-aligned rects. */
export function marqueeStyleUsesRectMask(style: MarqueeStyle): boolean {
  return style !== 'normal'
}
