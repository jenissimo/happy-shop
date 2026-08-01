export const THEME_IDS = [
  'graphite',
  'midnight',
  'paper',
  'ember',
  'abyss',
  'moss',
  'ink',
  'frost',
  'dusk',
  'mist',
  'vapor',
  'crystal',
] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const THEME_STORAGE_KEY = 'happy-shop.theme'

/** Neutral pro-editor chrome for a predictable first-run workspace. */
export const DEFAULT_THEME: ThemeId = 'graphite'

export type ThemePreview = {
  bg: string
  panel: string
  raised: string
  accent: string
  checkerA: string
  checkerB: string
  /** Liquid-glass material — Appearance mockup shows frosted chrome. */
  glass?: boolean
}

export const THEMES: ReadonlyArray<{
  id: ThemeId
  label: string
  description: string
  /** Static swatch colors for the settings picker (independent of active theme). */
  preview: ThemePreview
}> = [
  {
    id: 'graphite',
    label: 'Graphite',
    description: 'Neutral graphite pro-editor workspace',
    preview: {
      bg: '#202020',
      panel: '#323232',
      raised: '#3b3b3b',
      accent: '#3b8edb',
      checkerA: '#b8b8b8',
      checkerB: '#8e8e8e',
    },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Cool charcoal with steel-blue accent',
    preview: {
      bg: '#0a0c10',
      panel: '#12161d',
      raised: '#181d27',
      accent: '#5aa8e0',
      checkerA: '#30343d',
      checkerB: '#22252b',
    },
  },
  {
    id: 'paper',
    label: 'Paper',
    description: 'Crisp cool light slate workspace',
    preview: {
      bg: '#dce3eb',
      panel: '#f4f7fa',
      raised: '#eef2f6',
      accent: '#2f74b0',
      checkerA: '#e8ecf1',
      checkerB: '#cfd6de',
    },
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Warm brown-ink with copper accent',
    preview: {
      bg: '#120e0a',
      panel: '#1c1611',
      raised: '#261e17',
      accent: '#e0a45c',
      checkerA: '#3a322c',
      checkerB: '#28221c',
    },
  },
  {
    id: 'abyss',
    label: 'Abyss',
    description: 'Deep teal-ink navy studio',
    preview: {
      bg: '#040a10',
      panel: '#0a121c',
      raised: '#0f1a28',
      accent: '#2ec4b6',
      checkerA: '#243440',
      checkerB: '#182430',
    },
  },
  {
    id: 'moss',
    label: 'Moss',
    description: 'Forest olive workspace',
    preview: {
      bg: '#080e0a',
      panel: '#101814',
      raised: '#16201a',
      accent: '#7cba6e',
      checkerA: '#2c3830',
      checkerB: '#1e2822',
    },
  },
  {
    id: 'ink',
    label: 'Ink',
    description: 'Near-black with sharp rose accent',
    preview: {
      bg: '#050505',
      panel: '#0c0c0c',
      raised: '#141414',
      accent: '#ff2d55',
      checkerA: '#2e2e2e',
      checkerB: '#1a1a1a',
    },
  },
  {
    id: 'frost',
    label: 'Frost',
    description: 'Soft nord polar night',
    preview: {
      bg: '#1a1f28',
      panel: '#252b36',
      raised: '#2e3544',
      accent: '#8fd0e0',
      checkerA: '#3a4250',
      checkerB: '#2a323e',
    },
  },
  {
    id: 'dusk',
    label: 'Dusk',
    description: 'Violet-blue hour with apricot',
    preview: {
      bg: '#0c0c18',
      panel: '#151522',
      raised: '#1c1c2e',
      accent: '#e8a070',
      checkerA: '#32324a',
      checkerB: '#222234',
    },
  },
  {
    id: 'mist',
    label: 'Mist',
    description: 'Soft aqua-gray light workspace',
    preview: {
      bg: '#d4e2e4',
      panel: '#f0f7f8',
      raised: '#e6f0f2',
      accent: '#248f88',
      checkerA: '#e4eef0',
      checkerB: '#c8d6da',
    },
  },
  {
    id: 'vapor',
    label: 'Vapor',
    description: 'Dark liquid glass with frosted chrome',
    preview: {
      bg: '#080c14',
      panel: 'rgba(28, 38, 58, 0.55)',
      raised: 'rgba(36, 48, 72, 0.65)',
      accent: '#6ec8e8',
      checkerA: '#2e3a4c',
      checkerB: '#1e2838',
      glass: true,
    },
  },
  {
    id: 'crystal',
    label: 'Crystal',
    description: 'Light liquid glass with milky frost',
    preview: {
      bg: '#d4e4ec',
      panel: 'rgba(255, 255, 255, 0.55)',
      raised: 'rgba(255, 255, 255, 0.7)',
      accent: '#2a9aaa',
      checkerA: '#e8f0f4',
      checkerB: '#c8d8e0',
      glass: true,
    },
  },
]

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

/** One-release bridge for the pre-release trademarked theme id. */
export function normalizeStoredTheme(value: unknown): ThemeId {
  if (value === 'photoshop') return 'graphite'
  return isThemeId(value) ? value : DEFAULT_THEME
}

export function readStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return normalizeStoredTheme(raw)
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
