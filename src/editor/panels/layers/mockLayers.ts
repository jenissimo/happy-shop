import { useState } from 'react'
import { BLEND_MODES, type BlendMode } from '../../../core/document'
import type { LayersPanelAdapter, LayersPanelLayer } from './types'

const DEMO_LAYERS: LayersPanelLayer[] = [
  {
    id: 'mock-layer-2',
    name: 'Panel',
    visible: true,
    locked: false,
    lockFlags: { transparentPixels: false, imagePixels: false, position: false },
    opacity: 0.85,
    fillOpacity: 1,
    blendMode: 'normal',
    hasEffects: true,
    effects: [
      { id: 'fx-1', label: 'Drop Shadow', enabled: true, blendSummary: 'multiply' },
    ],
    depth: 0,
    parentId: null,
    kind: 'raster',
    hasMask: false,
    maskEnabled: true,
    maskHidesEffects: false,
  },
  {
    id: 'mock-layer-1',
    name: 'Background',
    visible: true,
    locked: false,
    lockFlags: { transparentPixels: false, imagePixels: false, position: false },
    opacity: 1,
    fillOpacity: 1,
    blendMode: 'normal',
    hasEffects: false,
    effects: [],
    depth: 0,
    parentId: null,
    kind: 'raster',
    hasMask: false,
    maskEnabled: true,
    maskHidesEffects: false,
  },
]

function clampOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) return 1
  return Math.min(1, Math.max(0, opacity))
}

/**
 * Interactive in-memory adapter for offline UI work when EditorSession is
 * unavailable. Visual order is top → bottom.
 */
export function useMockLayersAdapter(
  initial: LayersPanelLayer[] = DEMO_LAYERS,
): LayersPanelAdapter {
  const [layers, setLayers] = useState<LayersPanelLayer[]>(() =>
    initial.map((l) => ({ ...l })),
  )
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>(() =>
    initial[0] ? [initial[0].id] : [],
  )

  return {
    layers,
    selectedLayerIds,
    selectLayer: (id, additive = false) => {
      setSelectedLayerIds((prev) => {
        if (additive) {
          return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        }
        return [id]
      })
    },
    toggleVisibility: (id) => {
      setLayers((prev) =>
        prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
      )
    },
    toggleLocked: (id) => {
      setLayers((prev) =>
        prev.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)),
      )
    },
    setLayerLockFlag: (id, flag, locked) => {
      setLayers((prev) =>
        prev.map((l) =>
          l.id === id ? { ...l, lockFlags: { ...l.lockFlags, [flag]: locked } } : l,
        ),
      )
    },
    renameLayer: (id, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      setLayers((prev) =>
        prev.map((l) => (l.id === id ? { ...l, name: trimmed } : l)),
      )
    },
    setOpacity: (id, opacity) => {
      const next = clampOpacity(opacity)
      setLayers((prev) =>
        prev.map((l) => (l.id === id ? { ...l, opacity: next } : l)),
      )
    },
    setFillOpacity: (id, fillOpacity) => {
      const next = clampOpacity(fillOpacity)
      setLayers((prev) =>
        prev.map((l) => (l.id === id ? { ...l, fillOpacity: next } : l)),
      )
    },
    setBlendMode: (id, mode: BlendMode) => {
      if (!BLEND_MODES.includes(mode)) return
      setLayers((prev) =>
        prev.map((l) => (l.id === id ? { ...l, blendMode: mode } : l)),
      )
    },
    setGroupIsolated: (id, isolated) => {
      setLayers((prev) =>
        prev.map((l) =>
          l.id === id && l.kind === 'group' ? { ...l, isolated } : l,
        ),
      )
    },
    setMaskHidesEffects: (id, maskHidesEffects) => {
      setLayers((prev) =>
        prev.map((l) => (l.id === id ? { ...l, maskHidesEffects } : l)),
      )
    },
    toggleClippingMask: (id) => {
      setLayers((prev) =>
        prev.map((layer) =>
          layer.id === id ? { ...layer, clipping: !layer.clipping } : layer,
        ),
      )
    },
    toggleLayerEffect: (layerId, effectId) => {
      setLayers((prev) =>
        prev.map((layer) => {
          if (layer.id !== layerId) return layer
          return {
            ...layer,
            effects: layer.effects.map((effect) =>
              effect.id === effectId ? { ...effect, enabled: !effect.enabled } : effect,
            ),
          }
        }),
      )
    },
    reorderLayerEffect: (layerId, fromIndex, toIndex) => {
      setLayers((prev) =>
        prev.map((layer) => {
          if (layer.id !== layerId) return layer
          const nextEffects = [...layer.effects]
          const [moved] = nextEffects.splice(fromIndex, 1)
          if (!moved) return layer
          nextEffects.splice(toIndex, 0, moved)
          return { ...layer, effects: nextEffects }
        }),
      )
    },
    reorderLayer: (id, visualIndex) => {
      setLayers((prev) => {
        const from = prev.findIndex((l) => l.id === id)
        if (from === -1) return prev
        const next = [...prev]
        const [moved] = next.splice(from, 1)
        if (!moved) return prev
        const clamped = Math.max(0, Math.min(visualIndex, next.length))
        next.splice(clamped, 0, moved)
        return next
      })
    },
  }
}

export { DEMO_LAYERS }
