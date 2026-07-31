import {
  MAX_CANVAS_SIDE,
  exceedsMaxSide,
  exceedsSoftMegapixelLimit,
  type CanvasBackground,
} from '../../../core/document'

export type BackgroundOption = 'transparent' | 'white' | 'black' | 'custom'

export type NewDocumentFormState = {
  name: string
  width: number
  height: number
  background: BackgroundOption
  /** Only meaningful when `background === 'custom'`. */
  customColor: string
  /** UX-PHOTOSHOP.md "64MP confirm checkbox". */
  megapixelConfirmed: boolean
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/

export function createDefaultFormState(): NewDocumentFormState {
  return {
    name: 'Untitled',
    width: 1024,
    height: 768,
    background: 'transparent',
    customColor: '#ffffff',
    megapixelConfirmed: false,
  }
}

/** Clamps to the 1..MAX_CANVAS_SIDE integer range required by SPEC §1.3/§8.2. */
export function clampDimension(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(MAX_CANVAS_SIDE, Math.max(1, Math.round(value)))
}

export function isOverSoftLimit(width: number, height: number): boolean {
  return exceedsSoftMegapixelLimit(width, height)
}

export function normalizeHexColor(value: string, fallback = '#ffffff'): string {
  return HEX_COLOR_RE.test(value) ? value : fallback
}

export function resolveBackground(state: NewDocumentFormState): CanvasBackground {
  switch (state.background) {
    case 'transparent':
      return 'transparent'
    case 'white':
      return { color: '#ffffff' }
    case 'black':
      return { color: '#000000' }
    case 'custom':
      return { color: normalizeHexColor(state.customColor) }
    default:
      return 'transparent'
  }
}

/** True once every field is valid and, if the 64MP soft limit is exceeded, confirmed. */
export function canSubmitNewDocument(state: NewDocumentFormState): boolean {
  if (!state.name.trim()) return false
  if (!Number.isInteger(state.width) || state.width < 1) return false
  if (!Number.isInteger(state.height) || state.height < 1) return false
  if (exceedsMaxSide(state.width, state.height)) return false
  if (state.background === 'custom' && !HEX_COLOR_RE.test(state.customColor)) return false
  if (isOverSoftLimit(state.width, state.height) && !state.megapixelConfirmed) return false
  return true
}
