import { useMemo } from 'react'
import type { HappyDocument, Layer, LayerId } from '../../../core/document'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { commitLayerFxMutation } from '../../session/layerFxClipboard'
import { reorderEffect, toggleEffect } from '../../../core/document'
import type { LayersPanelAdapter, LayersPanelLayer } from './types'
import { layersFxEffectRows } from './layersFxTree'

function asLayerId(id: string): LayerId {
  return id as LayerId
}

function toPanelLayer(
  layer: Layer,
  depth: number,
): LayersPanelLayer {
  return {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    lockFlags: {
      transparentPixels: layer.lockFlags?.transparentPixels ?? false,
      imagePixels: layer.lockFlags?.imagePixels ?? false,
      position: layer.lockFlags?.position ?? false,
    },
    opacity: layer.opacity,
    fillOpacity: layer.fillOpacity ?? 1,
    blendMode: layer.blendMode,
    hasEffects: layer.effects.length > 0,
    effects: layersFxEffectRows(layer.effects),
    depth,
    parentId: layer.parentId,
    kind: layer.type,
    hasMask: layer.mask != null,
    maskEnabled: layer.maskEnabled ?? true,
    maskHidesEffects: layer.maskHidesEffects ?? false,
    clipping: layer.clipping ?? false,
    ...(layer.type === 'group' ? { isolated: layer.isolated } : {}),
  }
}

/**
 * Depth-first, top→bottom rows for the Layers panel (groups included).
 * Document children are bottom→top; we reverse at each level.
 */
function flattenPanelRows(doc: HappyDocument): LayersPanelLayer[] {
  const rows: LayersPanelLayer[] = []

  function visit(ids: readonly LayerId[], depth: number): void {
    for (const id of [...ids].reverse()) {
      const layer = doc.layers[id]
      if (!layer) continue
      rows.push(toPanelLayer(layer, depth))
      if (layer.type === 'group') {
        visit(layer.children, depth + 1)
      }
    }
  }

  visit(doc.rootChildren, 0)
  return rows
}

/**
 * Binds LayersPanel to the live EditorSession zustand store.
 */
export function useSessionLayersAdapter(): LayersPanelAdapter {
  const document = useEditorSessionStore((s) => s.document)
  const selectedLayerIds = useEditorSessionStore((s) => s.selectedLayerIds)
  const selectLayer = useEditorSessionStore((s) => s.selectLayer)
  const toggleVisibility = useEditorSessionStore((s) => s.toggleVisibility)
  const toggleLocked = useEditorSessionStore((s) => s.toggleLocked)
  const setLayerLockFlag = useEditorSessionStore((s) => s.setLayerLockFlag)
  const renameLayer = useEditorSessionStore((s) => s.renameLayer)
  const setOpacity = useEditorSessionStore((s) => s.setOpacity)
  const setFillOpacity = useEditorSessionStore((s) => s.setFillOpacity)
  const setBlendMode = useEditorSessionStore((s) => s.setBlendMode)
  const setGroupIsolated = useEditorSessionStore((s) => s.setGroupIsolated)
  const setMaskHidesEffects = useEditorSessionStore((s) => s.setMaskHidesEffects)
  const toggleClippingMask = useEditorSessionStore((s) => s.toggleClippingMask)
  const reorderLayer = useEditorSessionStore((s) => s.reorderLayer)

  const layers = useMemo(
    () => flattenPanelRows(document),
    [document],
  )

  return {
    layers,
    selectedLayerIds,
    selectLayer: (id, additive) => selectLayer(asLayerId(id), additive),
    toggleVisibility: (id) => toggleVisibility(asLayerId(id)),
    toggleLocked: (id) => toggleLocked(asLayerId(id)),
    setLayerLockFlag: (id, flag, locked) =>
      setLayerLockFlag(asLayerId(id), flag, locked),
    renameLayer: (id, name) => renameLayer(asLayerId(id), name),
    setOpacity: (id, opacity) => setOpacity(asLayerId(id), opacity),
    setFillOpacity: (id, fillOpacity) =>
      setFillOpacity(asLayerId(id), fillOpacity),
    setBlendMode: (id, mode) => setBlendMode(asLayerId(id), mode),
    setGroupIsolated: (id, isolated) => setGroupIsolated(asLayerId(id), isolated),
    setMaskHidesEffects: (id, maskHidesEffects) =>
      setMaskHidesEffects(asLayerId(id), maskHidesEffects),
    toggleClippingMask: (id) => toggleClippingMask(asLayerId(id)),
    toggleLayerEffect: (layerId, effectId) => {
      const id = asLayerId(layerId)
      const layer = document.layers[id]
      const effect = layer?.effects.find((entry) => entry.id === effectId)
      if (!layer || !effect) return
      commitLayerFxMutation(
        `${effect.enabled ? 'Disable' : 'Enable'} ${effect.type}`,
        (before) => toggleEffect(before, id, effectId),
      )
    },
    reorderLayerEffect: (layerId, fromIndex, toIndex) => {
      commitLayerFxMutation('Reorder Effects', (before) =>
        reorderEffect(before, asLayerId(layerId), fromIndex, toIndex),
      )
    },
    reorderLayer: (id, visualIndex) => reorderLayer(asLayerId(id), visualIndex),
  }
}
