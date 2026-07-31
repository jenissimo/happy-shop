import { create } from 'zustand'
import type { CssColor, GoogleFontSource, LayerId, TextAlign } from '../../../core/document'
import {
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_FONT_FAMILY,
  DEFAULT_TEXT_FONT_SIZE,
} from '../../../core/document'
import type { HappyDocument } from '../../../core/document'

export type TextToolOptions = {
  fontFamily: string
  fontSource?: GoogleFontSource
  fontSize: number
  fontWeight: number
  italic: boolean
  underline: boolean
  color: CssColor
  align: TextAlign
  tracking: number
  leading: number
}

export type TextEditSession = {
  layerId: LayerId
  /** Document snapshot at edit start — used for coalesced commit / Esc. */
  baseline: HappyDocument
  /** True when the layer was created in this session (Esc may delete). */
  isNew: boolean
}

export type TextEditingSelection = {
  layerId: LayerId
  start: number
  end: number
}

type TextToolState = {
  options: TextToolOptions
  edit: TextEditSession | null
  selection: TextEditingSelection | null
  setOptions: (patch: Partial<TextToolOptions>) => void
  beginEdit: (session: TextEditSession) => void
  endEdit: () => void
  setSelection: (selection: TextEditingSelection | null) => void
}

export const useTextToolStore = create<TextToolState>((set) => ({
  options: {
    fontFamily: DEFAULT_TEXT_FONT_FAMILY,
    fontSize: DEFAULT_TEXT_FONT_SIZE,
    fontWeight: 400,
    italic: false,
    underline: false,
    color: DEFAULT_TEXT_COLOR,
    align: 'left',
    tracking: 0,
    leading: 0,
  },
  edit: null,
  selection: null,
  setOptions: (patch) =>
    set((s) => ({ options: { ...s.options, ...patch } })),
  beginEdit: (session) => set({ edit: session, selection: null }),
  endEdit: () => set({ edit: null, selection: null }),
  setSelection: (selection) => set({ selection }),
}))
