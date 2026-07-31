import { create } from 'zustand'
import type { Gradient } from '../../../core/document/layerEffectsSchema'

export type GradientToolOptions = {
  gradient: Gradient
  style: 'linear' | 'radial'
  reverse: boolean
  opacity: number
}

type GradientToolState = {
  options: GradientToolOptions
  setOptions: (patch: Partial<GradientToolOptions>) => void
}

export const useGradientToolStore = create<GradientToolState>((set) => ({
  options: {
    gradient: {
      stops: [
        { offset: 0, color: '#000000', opacity: 1 },
        { offset: 1, color: '#ffffff', opacity: 1 },
      ],
    },
    style: 'linear',
    reverse: false,
    opacity: 1,
  },
  setOptions: (patch) =>
    set((state) => ({ options: { ...state.options, ...patch } })),
}))
