import type { HistoryEntry } from './types'

/**
 * Single undo/redo step wrapping multiple entries (e.g. raster patch + metadata).
 * Runs child redo forward and undo in reverse.
 */
export function createCombinedEntry(
  label: string,
  entries: HistoryEntry[],
): HistoryEntry {
  const byteCost = entries.reduce((sum, entry) => sum + entry.byteCost, 0)
  return {
    id: crypto.randomUUID(),
    label,
    byteCost,
    async undo(ctx) {
      for (let i = entries.length - 1; i >= 0; i--) {
        await entries[i]!.undo(ctx)
      }
    },
    async redo(ctx) {
      for (const entry of entries) {
        await entry.redo(ctx)
      }
    },
    dispose() {
      for (const entry of entries) {
        entry.dispose?.()
      }
    },
  }
}
