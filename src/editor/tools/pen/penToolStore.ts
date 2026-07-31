import { create } from 'zustand'
import type { CssColor } from '../../../core/document'

export type PenCommitMode = 'shape' | 'selection'

export type PenToolOptions = {
  fillEnabled: boolean
  fillColor: CssColor
  fillOpacity: number
  strokeEnabled: boolean
  strokeColor: CssColor
  strokeOpacity: number
  strokeWidth: number
  /** Default commit when closing a path via Pen tool. */
  commitMode: PenCommitMode
}

type PenToolState = {
  options: PenToolOptions
  setOptions: (patch: Partial<PenToolOptions>) => void
}

export const usePenToolStore = create<PenToolState>((set) => ({
  options: {
    fillEnabled: false,
    fillColor: '#4a90d9',
    fillOpacity: 1,
    strokeEnabled: true,
    strokeColor: '#1a1a1a',
    strokeOpacity: 1,
    strokeWidth: 2,
    commitMode: 'shape',
  },
  setOptions: (patch) =>
    set((s) => ({ options: { ...s.options, ...patch } })),
}))
