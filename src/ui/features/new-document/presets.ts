/**
 * New Document presets (UX-PHOTOSHOP.md "New Document dialog"). Static list
 * plus a synthetic "Clipboard" entry appended at runtime once a clipboard
 * probe finds an image (SPEC §13.4 / §20).
 */
export type DocumentPreset = {
  id: string
  label: string
  width: number
  height: number
}

export const CUSTOM_PRESET_ID = 'custom'
export const CLIPBOARD_PRESET_ID = 'clipboard'

export const DOCUMENT_PRESETS: DocumentPreset[] = [
  { id: CUSTOM_PRESET_ID, label: 'Custom', width: 1024, height: 768 },
  { id: 'square-2048', label: 'Square · 2048×2048', width: 2048, height: 2048 },
  { id: 'photo-4x6-300dpi', label: 'Photo 4×6in · 300dpi', width: 1800, height: 1200 },
  { id: 'hd-1080p', label: 'HD · 1920×1080', width: 1920, height: 1080 },
  { id: 'uhd-4k', label: 'UHD 4K · 3840×2160', width: 3840, height: 2160 },
  { id: 'a4-300dpi', label: 'A4 · 300dpi', width: 2480, height: 3508 },
]

export function findPreset(id: string): DocumentPreset | undefined {
  return DOCUMENT_PRESETS.find((p) => p.id === id)
}

export function makeClipboardPreset(width: number, height: number): DocumentPreset {
  return {
    id: CLIPBOARD_PRESET_ID,
    label: `Clipboard · ${width}×${height}`,
    width,
    height,
  }
}
