/**
 * Legacy toy HistoryStack (full EditorDocument snapshots) plus re-exports of
 * the SPEC §12 transactional history used by HappyDocument.
 *
 * Prefer `core/history/` (`TransactionalHistory`, `createMetadataEntry`) for
 * all new editor work. The snapshot stack remains only for the inert toy
 * rect path in EditorContext.
 */

import type { EditorDocument } from './legacyDocument'

export type {
  CommandContext,
  HistoryBudget,
  HistoryEntry as TransactionalHistoryEntry,
} from './history/index'
export {
  DEFAULT_HISTORY_BUDGET,
  TransactionalHistory,
  createMetadataEntry,
} from './history/index'

export type HistoryEntry = {
  label: string
  undo: () => void
  redo: () => void
}

export class HistoryStack {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private readonly limit: number

  constructor(limit = 100) {
    this.limit = limit
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null
  }

  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null
  }

  push(entry: HistoryEntry): void {
    this.undoStack.push(entry)
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack.length = 0
  }

  /**
   * Apply a document mutation, storing before/after snapshots for undo/redo.
   * Returns the new document.
   */
  apply(
    getDoc: () => EditorDocument,
    setDoc: (doc: EditorDocument) => void,
    mutator: (doc: EditorDocument) => EditorDocument,
    label: string,
  ): EditorDocument {
    const before = structuredClone(getDoc())
    const after = mutator(structuredClone(before))
    setDoc(after)
    this.push({
      label,
      undo: () => setDoc(structuredClone(before)),
      redo: () => setDoc(structuredClone(after)),
    })
    return after
  }

  undo(): boolean {
    const entry = this.undoStack.pop()
    if (!entry) return false
    entry.undo()
    this.redoStack.push(entry)
    return true
  }

  redo(): boolean {
    const entry = this.redoStack.pop()
    if (!entry) return false
    entry.redo()
    this.undoStack.push(entry)
    return true
  }

  clear(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
  }
}
