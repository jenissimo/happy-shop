import type { CommandRegistry } from '../../core/commands/registry'
import { openLayerStyleDialog } from '../../ui/features/layer-style/controller'
import type { StyleEffectKey } from '../../ui/features/layer-style/defaults'
import { useEditorSessionStore } from './EditorSessionStore'
import {
  copySelectedLayerEffects,
  hasCopiedLayerEffects,
  pasteCopiedLayerEffectsToSelection,
} from './layerFxClipboard'

function openStyle(focus?: StyleEffectKey): void {
  const layerId = useEditorSessionStore.getState().selectedLayerIds[0]
  if (!layerId) return
  openLayerStyleDialog(layerId, focus)
}

export function registerLayerFxCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'layer.fx.copy',
    title: 'Copy Layer Style',
    enabled: () => useEditorSessionStore.getState().selectedLayerIds.length === 1,
    run: copySelectedLayerEffects,
  })
  registry.register({
    id: 'layer.fx.paste',
    title: 'Paste Layer Style',
    enabled: () =>
      hasCopiedLayerEffects() &&
      useEditorSessionStore.getState().selectedLayerIds.length > 0,
    run: () => {
      pasteCopiedLayerEffectsToSelection()
    },
  })
  registry.register({
    id: 'layer.fx.open',
    title: 'Layer Style…',
    enabled: () => useEditorSessionStore.getState().selectedLayerIds.length > 0,
    run: () => openStyle(),
  })

  registry.register({
    id: 'layer.fx.dropShadow',
    title: 'Drop Shadow…',
    enabled: () => useEditorSessionStore.getState().selectedLayerIds.length > 0,
    run: () => openStyle('drop-shadow'),
  })

  registry.register({
    id: 'layer.fx.stroke',
    title: 'Stroke…',
    enabled: () => useEditorSessionStore.getState().selectedLayerIds.length > 0,
    run: () => openStyle('stroke'),
  })

  registry.register({
    id: 'layer.fx.colorOverlay',
    title: 'Color Overlay…',
    enabled: () => useEditorSessionStore.getState().selectedLayerIds.length > 0,
    run: () => openStyle('color-overlay'),
  })

  registry.register({
    id: 'layer.fx.chromaKey',
    title: 'Chroma Key…',
    enabled: () => useEditorSessionStore.getState().selectedLayerIds.length > 0,
    run: () => openStyle('chroma-key'),
  })
}
