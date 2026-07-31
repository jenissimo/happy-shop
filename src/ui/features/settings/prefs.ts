/** UI prefs for the Settings window itself (not theme — that stays on ThemeProvider). */

export const SETTINGS_SECTION_STORAGE_KEY = 'happy-shop.settings.section'

/** Stub: nearest/pixelated viewport preview. Default false = smooth linear sampling. */
export const VIEWPORT_PIXELATED_PREVIEW_KEY = 'happy-shop.viewport.pixelatedPreview'
export const VIEWPORT_PIXELATED_PREVIEW_CHANGED_EVENT =
  'happy-shop.viewport.pixelatedPreviewChanged'
export const BRUSH_CURSOR_MODE_KEY = 'happy-shop.tools.brushCursorMode'
export const BRUSH_CURSOR_MODE_CHANGED_EVENT = 'happy-shop.tools.brushCursorModeChanged'
export const TOOLS_STRIP_LAYOUT_KEY = 'happy-shop.tools.stripLayout'
export const TOOLS_STRIP_LAYOUT_CHANGED_EVENT = 'happy-shop.tools.stripLayoutChanged'

export type ToolsStripLayout = 'single' | 'double'
export const GOOGLE_FONTS_MODE_KEY = 'happy-shop.text.googleFontsMode'
export const GOOGLE_FONTS_MODE_CHANGED_EVENT = 'happy-shop.text.googleFontsModeChanged'

export type BrushCursorMode = 'normal' | 'precise'
export type GoogleFontsMode = 'off' | 'browse' | 'live-preview'

export function readStoredSettingsSection(
  fallback: string,
  validIds: ReadonlyArray<string>,
): string {
  try {
    const raw = localStorage.getItem(SETTINGS_SECTION_STORAGE_KEY)
    if (raw && validIds.includes(raw)) return raw
  } catch {
    /* private mode */
  }
  return fallback
}

export function persistSettingsSection(id: string): void {
  try {
    localStorage.setItem(SETTINGS_SECTION_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

export function readPixelatedPreviewPref(): boolean {
  try {
    return localStorage.getItem(VIEWPORT_PIXELATED_PREVIEW_KEY) === '1'
  } catch {
    return false
  }
}

export function persistPixelatedPreviewPref(enabled: boolean): void {
  try {
    localStorage.setItem(VIEWPORT_PIXELATED_PREVIEW_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function readBrushCursorModePref(): BrushCursorMode {
  try {
    return localStorage.getItem(BRUSH_CURSOR_MODE_KEY) === 'precise'
      ? 'precise'
      : 'normal'
  } catch {
    return 'normal'
  }
}

export function persistBrushCursorModePref(mode: BrushCursorMode): void {
  try {
    localStorage.setItem(BRUSH_CURSOR_MODE_KEY, mode)
    window.dispatchEvent(new Event(BRUSH_CURSOR_MODE_CHANGED_EVENT))
  } catch {
    /* private mode */
  }
}

/** Classic PS default: two tool columns. Single column for narrow screens or preference. */
export function readToolsStripLayoutPref(): ToolsStripLayout {
  try {
    return localStorage.getItem(TOOLS_STRIP_LAYOUT_KEY) === 'single' ? 'single' : 'double'
  } catch {
    return 'double'
  }
}

export function persistToolsStripLayoutPref(layout: ToolsStripLayout): void {
  try {
    localStorage.setItem(TOOLS_STRIP_LAYOUT_KEY, layout)
    window.dispatchEvent(new Event(TOOLS_STRIP_LAYOUT_CHANGED_EVENT))
  } catch {
    /* private mode */
  }
}

export function readGoogleFontsModePref(): GoogleFontsMode {
  try {
    const value = localStorage.getItem(GOOGLE_FONTS_MODE_KEY)
    return value === 'browse' || value === 'live-preview' ? value : 'off'
  } catch {
    return 'off'
  }
}

export function persistGoogleFontsModePref(mode: GoogleFontsMode): void {
  try {
    localStorage.setItem(GOOGLE_FONTS_MODE_KEY, mode)
    window.dispatchEvent(new Event(GOOGLE_FONTS_MODE_CHANGED_EVENT))
  } catch {
    /* private mode */
  }
}
