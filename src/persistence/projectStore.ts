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

/**
 * Which locator shape the active backend expects (`browser:Name` vs a
 * `projects/Name.happyshop` directory). Kept here so path builders stay pure
 * and unit-testable instead of reading `import.meta.env` themselves.
 */
export function isBrowserProjectBackend(): boolean {
  return import.meta.env.DEV !== true
}
