import { create } from 'zustand'

export type CursorDocPosition = {
  x: number
  y: number
}

type CursorStatusState = {
  /** Document-space cursor; null when pointer is outside the viewport. */
  docCursor: CursorDocPosition | null
  setDocCursor: (docCursor: CursorDocPosition | null) => void
}

export const useCursorStatusStore = create<CursorStatusState>((set) => ({
  docCursor: null,
  setDocCursor: (docCursor) => set({ docCursor }),
}))
