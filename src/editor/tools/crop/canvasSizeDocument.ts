import { produce } from 'immer'
import { MAX_CANVAS_SIDE, type HappyDocument } from '../../../core/document'

/** Anchor cell on the 3×3 Canvas Size grid (Photoshop-style). */
export type CanvasAnchor = {
  /** 0 = left, 0.5 = center, 1 = right */
  x: 0 | 0.5 | 1
  /** 0 = top, 0.5 = center, 1 = bottom */
  y: 0 | 0.5 | 1
}

export const CANVAS_ANCHOR_CENTER: CanvasAnchor = { x: 0.5, y: 0.5 }

export type CanvasSizeOptions = {
  width: number
  height: number
  anchor?: CanvasAnchor
}

/**
 * How much the old canvas origin moves in the new canvas when resizing
 * with a given anchor (Photoshop Canvas Size semantics).
 */
export function canvasSizeOriginOffset(
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
  anchor: CanvasAnchor = CANVAS_ANCHOR_CENTER,
): { x: number; y: number } {
  return {
    x: Math.round(anchor.x * (newWidth - oldWidth)),
    y: Math.round(anchor.y * (newHeight - oldHeight)),
  }
}

function clampSide(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(MAX_CANVAS_SIDE, Math.max(1, Math.round(n)))
}

/**
 * Resize the document canvas. Shifts every layer transform so painted content
 * stays pinned to the chosen anchor; does not bake or pad pixel buffers
 * (same transform-only approach as crop).
 */
export function canvasSizeDocument(
  doc: HappyDocument,
  options: CanvasSizeOptions,
): HappyDocument {
  const width = clampSide(options.width)
  const height = clampSide(options.height)
  const anchor = options.anchor ?? CANVAS_ANCHOR_CENTER

  if (width === doc.canvas.width && height === doc.canvas.height) return doc

  const offset = canvasSizeOriginOffset(
    doc.canvas.width,
    doc.canvas.height,
    width,
    height,
    anchor,
  )

  return produce(doc, (draft) => {
    draft.canvas.width = width
    draft.canvas.height = height
    for (const layer of Object.values(draft.layers)) {
      layer.transform.x += offset.x
      layer.transform.y += offset.y
    }
  })
}
