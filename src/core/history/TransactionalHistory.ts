import {
  DEFAULT_HISTORY_BUDGET,
  type CommandContext,
  type HistoryBudget,
  type HistoryEntry,
} from './types'

/**
 * Transactional undo/redo stack (SPEC §12). New pushes clear the redo branch
 * and dispose discarded entries. Eviction is oldest-first by count and bytes.
 */
export class TransactionalHistory {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private byteTotal = 0
  private readonly budget: HistoryBudget
  private readonly ctx: CommandContext = { busy: false }
  private generation = 0

  constructor(budget: Partial<HistoryBudget> = {}) {
    this.budget = { ...DEFAULT_HISTORY_BUDGET, ...budget }
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 && !this.ctx.busy
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0 && !this.ctx.busy
  }

  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null
  }

  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null
  }

  get undoCount(): number {
    return this.undoStack.length
  }

  get redoCount(): number {
    return this.redoStack.length
  }

  get accountedBytes(): number {
    return this.byteTotal
  }

  /** Bumps whenever stacks change — useful for React subscriptions. */
  get version(): number {
    return this.generation
  }

  get context(): CommandContext {
    return this.ctx
  }

  push(entry: HistoryEntry): void {
    const top = this.undoStack.at(-1)
    if (top?.merge) {
      const merged = top.merge(entry)
      if (merged) {
        this.byteTotal -= top.byteCost
        this.undoStack[this.undoStack.length - 1] = merged
        this.byteTotal += merged.byteCost
        top.dispose?.()
        if (merged !== entry) entry.dispose?.()
        this.disposeRedoBranch()
        this.evictIfNeeded()
        this.generation++
        return
      }
    }

    this.undoStack.push(entry)
    this.byteTotal += entry.byteCost
    this.disposeRedoBranch()
    this.evictIfNeeded()
    this.generation++
  }

  async undo(): Promise<boolean> {
    if (!this.canUndo) return false
    const entry = this.undoStack.pop()!
    this.byteTotal -= entry.byteCost
    this.ctx.busy = true
    try {
      await entry.undo(this.ctx)
      this.redoStack.push(entry)
      this.generation++
      return true
    } catch (err) {
      this.undoStack.push(entry)
      this.byteTotal += entry.byteCost
      throw err
    } finally {
      this.ctx.busy = false
    }
  }

  async redo(): Promise<boolean> {
    if (!this.canRedo) return false
    const entry = this.redoStack.pop()!
    this.ctx.busy = true
    try {
      await entry.redo(this.ctx)
      this.undoStack.push(entry)
      this.byteTotal += entry.byteCost
      this.generation++
      return true
    } catch (err) {
      this.redoStack.push(entry)
      throw err
    } finally {
      this.ctx.busy = false
    }
  }

  clear(): void {
    for (const e of this.undoStack) e.dispose?.()
    for (const e of this.redoStack) e.dispose?.()
    this.undoStack = []
    this.redoStack = []
    this.byteTotal = 0
    this.generation++
  }

  /** Labels for the History panel (oldest → newest applied). */
  listUndoLabels(): string[] {
    return this.undoStack.map((e) => e.label)
  }

  /** Undo entry at 1-based depth (1 = oldest applied, undoCount = newest). */
  getUndoEntryAtDepth(depth: number): HistoryEntry | null {
    if (depth < 1 || depth > this.undoStack.length) return null
    return this.undoStack[depth - 1] ?? null
  }

  /**
   * Future states after the current pointer (next redo first).
   * Empty when there is no redo branch.
   */
  listRedoLabels(): string[] {
    return [...this.redoStack].reverse().map((e) => e.label)
  }

  /**
   * Jump so `undoStack.length === depth` (0 = fully undone / document open).
   * Depth may land in the current redo branch (redo forward).
   */
  async jumpToUndoDepth(depth: number): Promise<boolean> {
    const total = this.undoStack.length + this.redoStack.length
    const target = Math.max(0, Math.min(Math.floor(depth), total))
    while (this.undoStack.length > target) {
      if (!(await this.undo())) return false
    }
    while (this.undoStack.length < target) {
      if (!(await this.redo())) return false
    }
    return true
  }

  private disposeRedoBranch(): void {
    for (const e of this.redoStack) e.dispose?.()
    this.redoStack = []
  }

  private evictIfNeeded(): void {
    while (
      this.undoStack.length > this.budget.maxEntries ||
      this.byteTotal > this.budget.maxBytes
    ) {
      if (this.undoStack.length === 0) break
      const oldest = this.undoStack.shift()!
      this.byteTotal -= oldest.byteCost
      oldest.dispose?.()
    }
    if (this.byteTotal < 0) this.byteTotal = 0
  }
}
