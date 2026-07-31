/**
 * Patch-based history contracts (SPEC §12). Entries undo/redo via closures;
 * raster bytes must never be full-document snapshots — only touched tiles.
 */

export type CommandContext = {
  /** Set while an async undo/redo is in flight; UI should block destructive cmds. */
  busy: boolean
}

export interface HistoryEntry {
  id: string
  label: string
  byteCost: number
  undo(ctx: CommandContext): Promise<void> | void
  redo(ctx: CommandContext): Promise<void> | void
  /** Return a combined entry, or null if the next entry must stay separate. */
  merge?(next: HistoryEntry): HistoryEntry | null
  dispose?(): void
}

export type HistoryBudget = {
  /** Soft cap on undo stack depth. */
  maxEntries: number
  /** Soft cap on summed `byteCost` of undo stack entries. */
  maxBytes: number
}

export const DEFAULT_HISTORY_BUDGET: HistoryBudget = {
  maxEntries: 100,
  /** ~64 MiB of accounted patch payload before eviction. */
  maxBytes: 64 * 1024 * 1024,
}
