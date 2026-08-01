import { useSyncExternalStore } from 'react'

const KEY = 'happy-shop.recent-projects'
const MAX_RECENT = 10
const EMPTY: RecentProject[] = []
const listeners = new Set<() => void>()

export type RecentProject = { path: string; name: string }

/** Cache so `useSyncExternalStore` getSnapshot returns a stable reference. */
let snapshotRaw: string | null | undefined
let snapshotValue: RecentProject[] = EMPTY

function parse(raw: string | null): RecentProject[] {
  if (raw == null || raw === '') return EMPTY
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return EMPTY
    const next = parsed.filter((value): value is RecentProject =>
      !!value &&
      typeof value === 'object' &&
      typeof (value as RecentProject).path === 'string' &&
      typeof (value as RecentProject).name === 'string',
    ).slice(0, MAX_RECENT)
    return next.length === 0 ? EMPTY : next
  } catch {
    return EMPTY
  }
}

/** Stable snapshot for `useSyncExternalStore` — same reference until data changes. */
export function getRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === snapshotRaw) return snapshotValue
    snapshotRaw = raw
    snapshotValue = parse(raw)
    return snapshotValue
  } catch {
    snapshotRaw = undefined
    snapshotValue = EMPTY
    return EMPTY
  }
}

function notify(): void {
  listeners.forEach((listener) => listener())
}

/** @internal — tests only. */
export function resetRecentProjectsCacheForTests(): void {
  snapshotRaw = undefined
  snapshotValue = EMPTY
}

export function addRecentProject(path: string, name: string): void {
  if (!path) return
  const next = [{ path, name: name.trim() || 'Untitled' }, ...getRecentProjects().filter((entry) => entry.path !== path)].slice(0, MAX_RECENT)
  const raw = JSON.stringify(next)
  localStorage.setItem(KEY, raw)
  snapshotRaw = raw
  snapshotValue = next
  notify()
}

export function useRecentProjects(): RecentProject[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getRecentProjects,
    () => EMPTY,
  )
}
