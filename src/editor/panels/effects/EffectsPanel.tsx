import { useRef, useState } from 'react'
import {
  Copy,
  Eye,
  EyeSlash,
  Plus,
  Trash,
} from '@phosphor-icons/react'
import {
  duplicateEffect,
  removeEffect,
  reorderEffect,
  setLayerEffects,
  toggleEffect,
  type LayerEffect,
} from '../../../core/document'
import { effectInstanceLabel, isStyleEffectType } from '../../../ui/features/layer-style/defaults'
import { isContentEffectType } from '../../../ui/features/content-filters/defaults'
import { openLayerStyleDialog } from '../../../ui/features/layer-style/controller'
import { effectBlendSummary } from '../../../rendering/effects/effectBlendModes'
import { ContextMenu, ctxItem, type ContextMenuItem } from '../../../ui/shell/ContextMenu'
import { useEditorContext } from '../../state/EditorContext'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { commitLayerFxMutation } from '../../session/layerFxClipboard'
import {
  deleteLayerFxPreset,
  instantiateLayerFxPreset,
  readLayerFxPresets,
  saveLayerFxPreset,
  type LayerFxPreset,
} from '../../session/layerFxPresets'
import styles from './EffectsPanel.module.css'

export type EffectPanelRow = {
  id: string
  label: string
  enabled: boolean
  blendSummary: string | null
}

/** Presentation model shared by the dock panel and its synchronization test. */
export function effectPanelRows(effects: readonly LayerEffect[]): EffectPanelRow[] {
  return effects.map((effect) => ({
    id: effect.id,
    label: effectInstanceLabel(effect, effects as LayerEffect[]),
    enabled: effect.enabled,
    blendSummary: effectBlendSummary(effect),
  }))
}

type MenuState = { effect: LayerEffect; x: number; y: number } | null

export function EffectsPanel() {
  const { commands } = useEditorContext()
  const document = useEditorSessionStore((state) => state.document)
  const selectedLayerIds = useEditorSessionStore((state) => state.selectedLayerIds)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [menu, setMenu] = useState<MenuState>(null)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [presets, setPresets] = useState<LayerFxPreset[]>(() => readLayerFxPresets())
  const draggedId = useRef<string | null>(null)
  const layer =
    selectedLayerIds.length === 1
      ? (document.layers[selectedLayerIds[0]!] ?? null)
      : null

  const move = (fromIndex: number, toIndex: number) => {
    if (!layer) return
    commitLayerFxMutation('Reorder Effects', (before) =>
      reorderEffect(before, layer.id, fromIndex, toIndex),
    )
  }

  const refreshPresets = () => setPresets(readLayerFxPresets())

  const savePreset = () => {
    if (!layer) return
    const saved = saveLayerFxPreset(presetName, layer.effects)
    if (!saved) return
    setPresetName('')
    refreshPresets()
  }

  const menuItems = (effect: LayerEffect): ContextMenuItem[] => [
    ctxItem({
      id: `toggle-${effect.id}`,
      label: effect.enabled ? 'Disable Effect' : 'Enable Effect',
      run: () => {
        commitLayerFxMutation(
          `${effect.enabled ? 'Disable' : 'Enable'} ${effectInstanceLabel(effect, layer?.effects ?? [])}`,
          (before) => toggleEffect(before, layer!.id, effect.id),
        )
      },
    }),
    ctxItem({
      id: `duplicate-${effect.id}`,
      label: 'Duplicate Effect',
      run: () => {
        commitLayerFxMutation('Duplicate Effect', (before) =>
          duplicateEffect(before, layer!.id, effect.id),
        )
      },
    }),
    ctxItem({
      id: `delete-${effect.id}`,
      label: 'Delete Effect',
      danger: true,
      run: () => {
        commitLayerFxMutation('Delete Effect', (before) =>
          removeEffect(before, layer!.id, effect.id),
        )
      },
    }),
  ]

  if (!layer) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          {selectedLayerIds.length > 1
            ? 'Select one layer to inspect its effects'
            : 'Select a layer to inspect effects'}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.title}>Effects</span>
        <button type="button" title="Copy Layer Style" onClick={() => commands.run('layer.fx.copy')}>
          <Copy size={14} />
        </button>
        <button
          type="button"
          title="Paste Layer Style"
          disabled={!commands.get('layer.fx.paste')?.enabled()}
          onClick={() => commands.run('layer.fx.paste')}
        >
          <ClipboardIcon />
        </button>
        <button type="button" title="Open Layer Style" onClick={() => openLayerStyleDialog(layer.id)}>
          <Plus size={14} />
        </button>
        <button
          type="button"
          className={styles.presets}
          title="Layer Style presets"
          aria-expanded={presetsOpen}
          onClick={() => setPresetsOpen((open) => !open)}
        >
          Presets ▾
        </button>
      </div>
      {presetsOpen && (
        <div className={styles.presetLibrary}>
          <div className={styles.presetSave}>
            <input
              aria-label="Layer Style preset name"
              placeholder="Preset name"
              value={presetName}
              maxLength={64}
              onChange={(event) => setPresetName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') savePreset()
              }}
            />
            <button type="button" onClick={savePreset} disabled={!presetName.trim()}>
              Save
            </button>
          </div>
          {presets.length === 0 ? (
            <div className={styles.presetEmpty}>Save this layer’s FX stack to reuse it.</div>
          ) : (
            <div className={styles.presetList}>
              {presets.map((preset) => (
                <div key={preset.id} className={styles.presetRow}>
                  <button
                    type="button"
                    className={styles.presetApply}
                    title={`Apply ${preset.name}`}
                    onClick={() =>
                      commitLayerFxMutation(`Apply Layer Style: ${preset.name}`, (before) =>
                        setLayerEffects(before, layer.id, instantiateLayerFxPreset(preset)),
                      )
                    }
                  >
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    className={styles.presetDelete}
                    title={`Delete ${preset.name}`}
                    aria-label={`Delete ${preset.name}`}
                    onClick={() => {
                      deleteLayerFxPreset(preset.id)
                      refreshPresets()
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className={styles.layerName} title={layer.name}>{layer.name}</div>
      <div className={styles.list}>
        {layer.effects.length === 0 ? (
          <div className={styles.empty}>No effects. Use + to add one.</div>
        ) : (
          layer.effects.map((effect, index) => (
            <div
              key={effect.id}
              className={`${styles.row}${dragOverIndex === index ? ` ${styles.dragOver}` : ''}${
                effect.enabled ? '' : ` ${styles.disabled}`
              }`}
              draggable
              onDragStart={(event) => {
                draggedId.current = effect.id
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(event) => {
                if (!draggedId.current) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDragOverIndex(index)
              }}
              onDrop={(event) => {
                event.preventDefault()
                const fromIndex = layer.effects.findIndex((item) => item.id === draggedId.current)
                draggedId.current = null
                setDragOverIndex(null)
                if (fromIndex !== -1) move(fromIndex, index)
              }}
              onDragEnd={() => {
                draggedId.current = null
                setDragOverIndex(null)
              }}
              onDoubleClick={() => {
                if (isStyleEffectType(effect.type) || isContentEffectType(effect.type)) {
                  openLayerStyleDialog(layer.id, effect.type)
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({ effect, x: event.clientX, y: event.clientY })
              }}
            >
              <span className={styles.handle} aria-hidden="true">⠿</span>
              <button
                type="button"
                className={styles.eye}
                title={effect.enabled ? 'Disable effect' : 'Enable effect'}
                onClick={() =>
                  commitLayerFxMutation(
                    `${effect.enabled ? 'Disable' : 'Enable'} ${effectInstanceLabel(effect, layer.effects)}`,
                    (before) => toggleEffect(before, layer.id, effect.id),
                  )
                }
              >
                {effect.enabled ? <Eye size={14} /> : <EyeSlash size={14} />}
              </button>
              <button
                type="button"
                className={styles.effectName}
                onClick={() => {
                  if (isStyleEffectType(effect.type) || isContentEffectType(effect.type)) {
                    openLayerStyleDialog(layer.id, effect.type)
                  }
                }}
              >
                <span className={styles.effectTitle}>{effectInstanceLabel(effect, layer.effects)}</span>
                {effectBlendSummary(effect) && (
                  <span className={styles.effectBlend}>{effectBlendSummary(effect)}</span>
                )}
              </button>
              <button
                type="button"
                className={styles.delete}
                title="Delete effect"
                onClick={() =>
                  commitLayerFxMutation('Delete Effect', (before) =>
                    removeEffect(before, layer.id, effect.id),
                  )
                }
              >
                <Trash size={13} />
              </button>
            </div>
          ))
        )}
      </div>
      <div className={styles.footer}>
        Drag to reorder. Chroma Key remains before style effects.
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.effect)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

function ClipboardIcon() {
  return <span aria-hidden="true">⇩</span>
}
