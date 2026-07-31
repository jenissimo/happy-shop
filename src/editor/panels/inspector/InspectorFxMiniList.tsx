import { useRef, useState } from 'react'
import { Eye, EyeSlash } from '@phosphor-icons/react'
import {
  reorderEffect,
  toggleEffect,
  type LayerEffect,
  type LayerId,
} from '../../../core/document'
import { isContentEffectType } from '../../../ui/features/content-filters/defaults'
import { openLayerStyleDialog } from '../../../ui/features/layer-style/controller'
import {
  effectInstanceLabel,
  isStyleEffectType,
} from '../../../ui/features/layer-style/defaults'
import type { LayerStyleFocusEffect } from '../../../ui/features/layer-style/controller'
import { commitLayerFxMutation } from '../../session/layerFxClipboard'
import { effectPanelRows } from '../effects/EffectsPanel'
import styles from './InspectorFxMiniList.module.css'

/** Presentation rows shared with the Effects panel (SPECS/ND-EFFECT-STACK-VISION.md §7.2). */
export { effectPanelRows as inspectorFxRows }

function openEffect(layerId: LayerId, effect: LayerEffect): void {
  if (isStyleEffectType(effect.type) || isContentEffectType(effect.type)) {
    openLayerStyleDialog(layerId, effect.type as LayerStyleFocusEffect)
  }
}

export type InspectorFxMiniListProps = {
  layerId: LayerId
  effects: readonly LayerEffect[]
  /** When true, list is visible but non-interactive (e.g. pass-through group FX). */
  disabled?: boolean
  disabledHint?: string
}

export function InspectorFxMiniList({
  layerId,
  effects,
  disabled = false,
  disabledHint,
}: InspectorFxMiniListProps) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const draggedId = useRef<string | null>(null)

  const move = (fromIndex: number, toIndex: number) => {
    commitLayerFxMutation('Reorder Effects', (before) =>
      reorderEffect(before, layerId, fromIndex, toIndex),
    )
  }

  if (effects.length === 0) return null

  return (
    <>
      <ul className={styles.list} aria-label="Layer effects">
        {effects.map((effect, index) => (
          <li
            key={effect.id}
            className={`${styles.row}${dragOverIndex === index ? ` ${styles.dragOver}` : ''}${
              effect.enabled ? '' : ` ${styles.disabled}`
            }${disabled ? ` ${styles.interactionDisabled}` : ''}`}
            draggable={!disabled}
            onDragStart={(event) => {
              if (disabled) return
              draggedId.current = effect.id
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(event) => {
              if (disabled || !draggedId.current) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDragOverIndex(index)
            }}
            onDrop={(event) => {
              if (disabled) return
              event.preventDefault()
              const fromIndex = effects.findIndex((item) => item.id === draggedId.current)
              draggedId.current = null
              setDragOverIndex(null)
              if (fromIndex !== -1) move(fromIndex, index)
            }}
            onDragEnd={() => {
              draggedId.current = null
              setDragOverIndex(null)
            }}
          >
            <span className={styles.handle} aria-hidden="true">
              ⠿
            </span>
            <button
              type="button"
              className={styles.eye}
              title={effect.enabled ? 'Disable effect' : 'Enable effect'}
              disabled={disabled}
              onClick={() =>
                commitLayerFxMutation(
                  `${effect.enabled ? 'Disable' : 'Enable'} ${effectInstanceLabel(effect, effects as LayerEffect[])}`,
                  (before) => toggleEffect(before, layerId, effect.id),
                )
              }
            >
              {effect.enabled ? <Eye size={13} /> : <EyeSlash size={13} />}
            </button>
            <button
              type="button"
              className={styles.name}
              title={effectInstanceLabel(effect, effects as LayerEffect[])}
              disabled={disabled}
              onDoubleClick={() => openEffect(layerId, effect)}
            >
              {effectInstanceLabel(effect, effects as LayerEffect[])}
            </button>
          </li>
        ))}
      </ul>
      {disabled && disabledHint ? <p className={styles.hint}>{disabledHint}</p> : null}
    </>
  )
}
