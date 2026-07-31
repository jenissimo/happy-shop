import { useSyncExternalStore } from 'react'
import type { NewDocumentResult } from './fileOpen'

/**
 * Tiny module-level pub/sub that decouples the New Document dialog/commands
 * from wherever the "real" document ends up living. `src/editor/session`
 * may not have existed yet when this feature was scoped (see AGENTS.md
 * ownership notes), so instead of importing a specific store this module
 * exposes:
 *
 *   - `openNewDocumentDialog()` / `closeNewDocumentDialog()` — dialog
 *     visibility, consumed by `<NewDocumentDialog />` via
 *     `useNewDocumentDialogOpen()`.
 *   - `onDocumentCreated(listener)` — the integrator-facing hook. Call this
 *     once (e.g. in `EditorShell` or a session store module) to receive
 *     every `HappyDocument` this feature creates, whether from the dialog,
 *     "New from Clipboard", or "Open…".
 *
 * If/when a session store owns "the current document", its setup code is
 * the intended caller of `onDocumentCreated`.
 */

type VoidListener = () => void
type CreatedListener = (result: NewDocumentResult) => void

let dialogOpen = false
const openListeners = new Set<VoidListener>()
const createdListeners = new Set<CreatedListener>()

function notifyOpenListeners(): void {
  for (const listener of openListeners) listener()
}

export function isNewDocumentDialogOpen(): boolean {
  return dialogOpen
}

export function openNewDocumentDialog(): void {
  if (dialogOpen) return
  dialogOpen = true
  notifyOpenListeners()
}

export function closeNewDocumentDialog(): void {
  if (!dialogOpen) return
  dialogOpen = false
  notifyOpenListeners()
}

export function subscribeNewDocumentDialogOpen(listener: VoidListener): () => void {
  openListeners.add(listener)
  return () => openListeners.delete(listener)
}

/** React hook wrapper around the dialog-open pub/sub, for the dialog component itself. */
export function useNewDocumentDialogOpen(): boolean {
  return useSyncExternalStore(subscribeNewDocumentDialogOpen, isNewDocumentDialogOpen)
}

/**
 * Integrator hook: register to receive every document this feature creates.
 * Returns an unsubscribe function. Safe to call before or after the dialog
 * has been rendered.
 */
export function onDocumentCreated(listener: CreatedListener): () => void {
  createdListeners.add(listener)
  return () => createdListeners.delete(listener)
}

/** Internal — called by `commands.ts`/`NewDocumentDialog` once a document is built. */
export function emitDocumentCreated(result: NewDocumentResult): void {
  for (const listener of createdListeners) listener(result)
}
