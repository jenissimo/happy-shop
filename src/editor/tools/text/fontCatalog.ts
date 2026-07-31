import type { SystemFont } from './systemFonts'

/** Deterministic, offline-safe text-layer faces shipped with the editor. */
export const BUNDLED_FONTS: readonly SystemFont[] = [
  { family: 'Inter, sans-serif', label: 'Inter', category: 'Sans' },
  {
    family: '"Source Serif 4", Georgia, serif',
    label: 'Source Serif 4',
    category: 'Serif',
  },
]
