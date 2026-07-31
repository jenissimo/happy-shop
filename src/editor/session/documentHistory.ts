import { TransactionalHistory } from '../../core/history'

/**
 * Active-tab transactional history for HappyDocument metadata (and later
 * raster tile patches). Not serialized with the project (SPEC §12).
 *
 * Multi-doc: `setActiveDocumentHistory` swaps the pointer when tabs change.
 */
let activeHistory = new TransactionalHistory()

export const documentHistory: TransactionalHistory = new Proxy(
  {} as TransactionalHistory,
  {
    get(_target, prop) {
      const value = Reflect.get(activeHistory, prop, activeHistory)
      return typeof value === 'function' ? value.bind(activeHistory) : value
    },
    set(_target, prop, value) {
      return Reflect.set(activeHistory, prop, value)
    },
  },
)

export function getActiveDocumentHistory(): TransactionalHistory {
  return activeHistory
}

export function setActiveDocumentHistory(history: TransactionalHistory): void {
  activeHistory = history
}

/** Test helper — clears the active tab stacks between unit tests. */
export function resetDocumentHistory(): void {
  activeHistory.clear()
}
