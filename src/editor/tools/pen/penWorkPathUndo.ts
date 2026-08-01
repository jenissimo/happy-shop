import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { penPathAnchorCount, popLastPenAnchor } from './penPath'
import { useWorkPathStore } from './workPathStore'

const PEN_TOOLS = new Set(['pen', 'freeformPen', 'addAnchor', 'deleteAnchor', 'convertPoint'])

/** True when Mod+Z should pop the last draft anchor instead of document undo. */
export function canUndoPenDraftAnchor(): boolean {
  const tool = useEditorSessionStore.getState().activeToolId
  if (!PEN_TOOLS.has(tool)) return false
  const draft = useWorkPathStore.getState().draft
  return Boolean(draft && penPathAnchorCount(draft) > 0)
}

/** Pop the last anchor from the open pen draft (Pen or Freeform Pen). */
export function undoPenDraftAnchor(): boolean {
  if (!canUndoPenDraftAnchor()) return false
  const store = useWorkPathStore.getState()
  const draft = store.draft!
  const next = popLastPenAnchor(draft)
  store.setDraft(next)
  store.setRubberBand(null)
  return true
}
