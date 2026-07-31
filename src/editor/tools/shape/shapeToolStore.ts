import { create } from 'zustand'
import type { CssColor, ShapeLayer } from '../../../core/document'

export type ShapeToolOptions = {
  primitive: ShapeLayer['primitive']
  fillEnabled: boolean
  fillColor: CssColor
  fillOpacity: number
  strokeEnabled: boolean
  strokeColor: CssColor
  strokeOpacity: number
  strokeWidth: number
  cornerRadius: number
  sides: number
  starPoints: number
  starInset: number
}

type ShapeToolState = {
  options: ShapeToolOptions
  setOptions: (patch: Partial<ShapeToolOptions>) => void
}

export const useShapeToolStore = create<ShapeToolState>((set) => ({
  options: {
    primitive: 'rect',
    fillEnabled: true,
    fillColor: '#4a90d9',
    fillOpacity: 1,
    strokeEnabled: true,
    strokeColor: '#1a1a1a',
    strokeOpacity: 1,
    strokeWidth: 2,
    cornerRadius: 0,
    sides: 5,
    starPoints: 5,
    starInset: 0.5,
  },
  setOptions: (patch) =>
    set((s) => ({ options: { ...s.options, ...patch } })),
}))
