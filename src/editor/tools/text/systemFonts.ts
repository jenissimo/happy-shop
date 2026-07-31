export type SystemFont = {
  family: string
  label: string
  category: 'Sans' | 'Serif' | 'Mono' | 'Script'
}

/** Curated system stacks that were previously owned by OptionsBar. */
export const SYSTEM_FONTS: readonly SystemFont[] = [
  { family: 'Segoe UI, system-ui, sans-serif', label: 'Segoe UI', category: 'Sans' },
  { family: 'Arial, Helvetica, sans-serif', label: 'Arial', category: 'Sans' },
  { family: 'Georgia, serif', label: 'Georgia', category: 'Serif' },
  { family: 'Times New Roman, Times, serif', label: 'Times New Roman', category: 'Serif' },
  { family: 'Consolas, monospace', label: 'Consolas', category: 'Mono' },
  { family: 'Comic Sans MS, cursive', label: 'Comic Sans MS', category: 'Script' },
]

/**
 * Returns only installed primary families where the Font Loading API can tell.
 * Stacks are retained when probing is unavailable, so the picker remains usable
 * in browsers without `document.fonts`.
 */
export function availableSystemFonts(): SystemFont[] {
  if (typeof document === 'undefined' || !document.fonts?.check) {
    return [...SYSTEM_FONTS]
  }

  return SYSTEM_FONTS.filter((font) => {
    const primaryFamily = font.family.split(',')[0]!.trim()
    return document.fonts.check(`12px "${primaryFamily}"`)
  })
}
