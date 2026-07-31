import { produce } from 'immer'
import type { HappyDocument } from '../../../core/document'
import type { SelectionRect } from '../../session/selectionStore'

/**
 * Crop the canvas to `rect` (document space). Shifts layer transforms so
 * content stays aligned; does not bake pixels (M3 crop).
 */
export function cropDocument(
  doc: HappyDocument,
  rect: SelectionRect,
): HappyDocument {
  const x = Math.max(0, Math.floor(rect.x))
  const y = Math.max(0, Math.floor(rect.y))
  const width = Math.max(
    1,
    Math.min(doc.canvas.width - x, Math.floor(rect.width)),
  )
  const height = Math.max(
    1,
    Math.min(doc.canvas.height - y, Math.floor(rect.height)),
  )
  if (width < 1 || height < 1) return doc

  return produce(doc, (draft) => {
    draft.canvas.width = width
    draft.canvas.height = height
    for (const layer of Object.values(draft.layers)) {
      layer.transform.x -= x
      layer.transform.y -= y
    }
  })
}
