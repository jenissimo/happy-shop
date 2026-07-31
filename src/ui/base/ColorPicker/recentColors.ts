const STORAGE_KEY = 'happy-shop.recent-colors'
const MAX_RECENT = 12

function normalize(hex: string): string {
  const v = hex.trim().toLowerCase()
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(v)) return v.length === 9 && v.endsWith('ff') ? v.slice(0, 7) : v
  return '#000000'
}

export function loadRecentColors(): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((c): c is string => typeof c === 'string')
      .map(normalize)
      .slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

export function pushRecentColor(hex: string): string[] {
  const next = normalize(hex)
  const prev = loadRecentColors().filter((c) => c !== next)
  const list = [next, ...prev].slice(0, MAX_RECENT)
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    } catch {
      /* quota / private mode */
    }
  }
  return list
}
