import type { Transform } from '../../core/document'
import {
  documentToLayerLocal,
  layerLocalToDocument,
} from '../tools/brush/layerCoords'
import { SelectionMask } from './SelectionMask'
import type { SelectionRect } from './selectionStore'
import { useSelectionStore } from './selectionStore'

/**
 * Build a layer-local clip function from the active document-space selection.
 * Returns null when there is no selection (paint unconstrained).
 */
export function selectionClipForLayer(
  transform: Transform,
): ((localX: number, localY: number) => number) | null {
  const { mask, marquee } = useSelectionStore.getState()
  if (mask && !mask.isEmpty()) {
    return (localX, localY) => {
      const doc = layerLocalToDocument({ x: localX, y: localY }, transform)
      return mask.sample(doc.x, doc.y) / 255
    }
  }
  if (marquee && marquee.width >= 1 && marquee.height >= 1) {
    const r = marquee
    return (localX, localY) => {
      const doc = layerLocalToDocument({ x: localX, y: localY }, transform)
      const x = Math.floor(doc.x)
      const y = Math.floor(doc.y)
      if (
        x >= r.x &&
        y >= r.y &&
        x < r.x + r.width &&
        y < r.y + r.height
      ) {
        return 1
      }
      return 0
    }
  }
  return null
}

/** Active mask, or a temporary rect mask when only marquee is set. */
export function activeSelectionMask(
  canvasWidth: number,
  canvasHeight: number,
): SelectionMask | null {
  const { mask, marquee } = useSelectionStore.getState()
  if (mask && !mask.isEmpty()) return mask
  if (marquee && marquee.width >= 1 && marquee.height >= 1) {
    return SelectionMask.fromRect(canvasWidth, canvasHeight, marquee)
  }
  return null
}

/** Expand selection bounds into a layer-local scan AABB. */
export function selectionBoundsInLayerLocal(
  bounds: SelectionRect,
  transform: Transform,
  surfaceWidth: number,
  surfaceHeight: number,
): SelectionRect {
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of corners) {
    const local = documentToLayerLocal(c, transform)
    minX = Math.min(minX, local.x)
    minY = Math.min(minY, local.y)
    maxX = Math.max(maxX, local.x)
    maxY = Math.max(maxY, local.y)
  }
  const pad = 2
  const x = Math.max(0, Math.floor(minX) - pad)
  const y = Math.max(0, Math.floor(minY) - pad)
  const right = Math.min(surfaceWidth, Math.ceil(maxX) + pad)
  const bottom = Math.min(surfaceHeight, Math.ceil(maxY) + pad)
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }
}
