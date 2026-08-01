import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  addRecentProject,
  getRecentProjects,
  resetRecentProjectsCacheForTests,
} from './recentProjects'

const KEY = 'happy-shop.recent-projects'

function installMemoryLocalStorage() {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
    removeItem: (key: string) => {
      entries.delete(key)
    },
    clear: () => {
      entries.clear()
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
  return storage
}

describe('recentProjects', () => {
  let originalStorage: Storage

  beforeEach(() => {
    originalStorage = globalThis.localStorage
    installMemoryLocalStorage()
    resetRecentProjectsCacheForTests()
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalStorage,
    })
    resetRecentProjectsCacheForTests()
  })

  test('prepends new entries and dedupes by path', () => {
    addRecentProject('/a/project', 'Alpha')
    addRecentProject('/b/project', 'Beta')
    addRecentProject('/a/project', 'Alpha Renamed')

    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]') as { path: string; name: string }[]
    expect(stored).toEqual([
      { path: '/a/project', name: 'Alpha Renamed' },
      { path: '/b/project', name: 'Beta' },
    ])
  })

  test('ignores empty paths and trims names', () => {
    addRecentProject('', 'Ignored')
    addRecentProject('/c/project', '  Trimmed  ')

    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]') as { path: string; name: string }[]
    expect(stored).toEqual([{ path: '/c/project', name: 'Trimmed' }])
  })

  test('caps the list at ten entries', () => {
    for (let index = 0; index < 12; index += 1) {
      addRecentProject(`/p/${index}`, `Doc ${index}`)
    }
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]') as { path: string }[]
    expect(stored).toHaveLength(10)
    expect(stored[0]?.path).toBe('/p/11')
    expect(stored[9]?.path).toBe('/p/2')
  })

  test('getRecentProjects returns a stable reference until data changes', () => {
    addRecentProject('/stable', 'Stable')
    const first = getRecentProjects()
    const second = getRecentProjects()
    expect(second).toBe(first)

    addRecentProject('/other', 'Other')
    const third = getRecentProjects()
    expect(third).not.toBe(first)
    expect(third[0]?.path).toBe('/other')
  })
})
