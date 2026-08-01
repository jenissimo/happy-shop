import { getBridgeProjectStore } from './BridgeProjectStore'
import { getBrowserProjectStore } from './BrowserProjectStore'
import type { ProjectStore } from './types'

/**
 * Active project persistence backend.
 * - Local `bun run dev`: Vite disk bridge.
 * - Production / GitHub Pages / preview: IndexedDB browser store.
 */
export function getProjectStore(): ProjectStore {
  if (import.meta.env.DEV === true) return getBridgeProjectStore()
  return getBrowserProjectStore()
}
