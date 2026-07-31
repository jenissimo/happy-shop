import { useSyncExternalStore } from 'react'

const KEY = 'happy-shop.recent-projects'
const MAX_RECENT = 10
const listeners = new Set<() => void>()

export type RecentProject = { path: string; name: string }

function read(): RecentProject[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is RecentProject =>
      !!value &&
      typeof value === 'object' &&
      typeof (value as RecentProject).path === 'string' &&
      typeof (value as RecentProject).name === 'string',
    ).slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

function notify(): void {
  listeners.forEach((listener) => listener())
}

export function addRecentProject(path: string, name: string): void {
  if (!path) return
  const next = [{ path, name: name.trim() || 'Untitled' }, ...read().filter((entry) => entry.path !== path)].slice(0, MAX_RECENT)
  localStorage.setItem(KEY, JSON.stringify(next))
  notify()
}

export function useRecentProjects(): RecentProject[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    read,
    () => [],
  )
}
