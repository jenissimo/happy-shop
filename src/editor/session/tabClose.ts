import {
  useDocumentTabManager,
  type DocumentTabId,
} from './DocumentTabManager'

/** Confirm dirty close, then close. Returns false if cancelled / missing. */
export function requestCloseTab(id: DocumentTabId): boolean {
  const mgr = useDocumentTabManager.getState()
  mgr.syncActiveFromSession()
  const tab = mgr.tabs.find((t) => t.id === id)
  if (!tab) return false
  if (tab.dirty) {
    const ok = window.confirm(
      `"${tab.document.name}" has unsaved changes. Close anyway?`,
    )
    if (!ok) return false
  }
  mgr.closeTab(id)
  return true
}

/** Close every tab except `keepId` (dirty prompts per tab). */
export function requestCloseOtherTabs(keepId: DocumentTabId): void {
  const mgr = useDocumentTabManager.getState()
  mgr.syncActiveFromSession()
  const others = mgr.tabs.filter((t) => t.id !== keepId).map((t) => t.id)
  for (const id of others) {
    requestCloseTab(id)
  }
}

/** Close all non-dirty tabs (Close Saved). Dirty tabs stay open. */
export function requestCloseSavedTabs(): void {
  const mgr = useDocumentTabManager.getState()
  mgr.syncActiveFromSession()
  const savedIds = mgr.tabs.filter((t) => !t.dirty).map((t) => t.id)
  for (const id of savedIds) {
    // Re-read each time — closing the last clean tab may spawn Untitled.
    const still = useDocumentTabManager.getState().tabs.find((t) => t.id === id)
    if (!still || still.dirty) continue
    mgr.closeTab(id)
  }
}

/** Close every tab (dirty prompts). Last close may spawn a fresh Untitled. */
export function requestCloseAllTabs(): void {
  const mgr = useDocumentTabManager.getState()
  mgr.syncActiveFromSession()
  const ids = mgr.tabs.map((t) => t.id)
  for (const id of ids) {
    const still = useDocumentTabManager.getState().tabs.find((t) => t.id === id)
    if (!still) continue
    if (!requestCloseTab(id)) {
      // User cancelled a dirty prompt — stop so remaining tabs stay.
      return
    }
  }
}
