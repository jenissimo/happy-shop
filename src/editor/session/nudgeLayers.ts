import { getLayer } from '../../core/document'
import {
  commitTransformGesture,
  transformableSelection,
} from '../tools/move/transformCommit'
import { useEditorSessionStore } from './EditorSessionStore'

/**
 * Photoshop arrow-key nudge for the current layer selection.
 *
 * Consecutive nudges of the same selection coalesce into one history entry
 * (shared `mergeKey`, wide merge window) so holding an arrow key does not
 * flood the undo stack — the same contract `MoveToolController` uses for a
 * pointer drag. Any other edit in between pushes its own entry, which breaks
 * the merge chain naturally because `merge()` only ever inspects the top of
 * the stack.
 */
export function nudgeSelectedLayers(dx: number, dy: number): boolean {
  if (!dx && !dy) return false

  const ids = transformableSelection()
  if (!ids.length) return false

  const doc = useEditorSessionStore.getState().document
  const updates = ids.flatMap((id) => {
    const layer = getLayer(doc, id)
    if (!layer) return []
    return [
      {
        id,
        transform: {
          ...layer.transform,
          x: layer.transform.x + dx,
          y: layer.transform.y + dy,
        },
      },
    ]
  })
  if (!updates.length) return false

  const before = useEditorSessionStore.getState().document
  commitTransformGesture('Nudge', updates, `nudge:${ids.join(',')}`)
  // Position-locked layers are skipped inside `applyLayerTransforms`, so an
  // all-locked selection must not report a handled nudge.
  return useEditorSessionStore.getState().document !== before
}
