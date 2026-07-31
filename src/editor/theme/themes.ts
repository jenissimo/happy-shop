export const THEME_IDS = [
  'midnight',
  'paper',
  'ember',
  'abyss',
  'moss',
  'ink',
  'frost',
  'dusk',
  'mist',
] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const THEME_STORAGE_KEY = 'happy-shop.theme'

export const DEFAULT_THEME: ThemeId = 'midnight'

export type ThemePreview = {
  bg: string
  panel: string
  accent: string
}

export const THEMES: ReadonlyArray<{
  id: ThemeId
  label: string
  description: string
  /** Static swatch colors for the settings picker (independent of active theme). */
  preview: ThemePreview
}> = [
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Cool charcoal with steel-blue accent',
    preview: { bg: '#0c0d0f', panel: '#14161a', accent: '#5b9fd4' },
  },
  {
    id: 'paper',
    label: 'Paper',
    description: 'Light slate workspace',
    preview: { bg: '#e6eaef', panel: '#f3f5f7', accent: '#3d7eb5' },
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Warm dark with copper accent',
    preview: { bg: '#100e0c', panel: '#181512', accent: '#d4a05a' },
  },
  {
    id: 'abyss',
    label: 'Abyss',
    description: 'Deep ocean teal-ink',
    preview: { bg: '#060b10', panel: '#0c141c', accent: '#2eb8a8' },
  },
  {
    id: 'moss',
    label: 'Moss',
    description: 'Quiet forest studio',
    preview: { bg: '#0a0f0c', panel: '#121916', accent: '#7aad6e' },
  },
  {
    id: 'ink',
    label: 'Ink',
    description: 'Near-black with sharp rose accent',
    preview: { bg: '#050505', panel: '#0e0e0e', accent: '#ff2d55' },
  },
  {
    id: 'frost',
    label: 'Frost',
    description: 'Soft nord polar night',
    preview: { bg: '#1b1f26', panel: '#242933', accent: '#88c0d0' },
  },
  {
    id: 'dusk',
    label: 'Dusk',
    description: 'Blue-hour slate with apricot',
    preview: { bg: '#0c0e16', panel: '#141822', accent: '#e09a6c' },
  },
  {
    id: 'mist',
    label: 'Mist',
    description: 'Cool aqua light workspace',
    preview: { bg: '#dfe8ea', panel: '#eef4f5', accent: '#2a8f8a' },
  },
]

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

export function readStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeId(raw)) return raw
  } catch {
    /* private mode / SSR */
  }
  return DEFAULT_THEME
}

/** Apply theme to <html data-theme> before / outside React. */
export function applyThemeToDocument(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
}

export function persistTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* ignore quota / private mode */
  }
}
