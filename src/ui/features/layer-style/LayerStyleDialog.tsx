import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  setFillOpacity,
  setLayerEffects,
  type LayerEffect,
} from '../../../core/document'
import { createMetadataEntry } from '../../../core/history'
import { documentHistory } from '../../../editor/session/documentHistory'
import { useEditorSessionStore } from '../../../editor/session/EditorSessionStore'
import { Button } from '../../base/Button'
import { ColorField } from '../../base/ColorField'
import { FloatingWindow } from '../../base/FloatingWindow'
import { SliderField } from '../../base/SliderField'
import {
  closeLayerStyleDialog,
  useLayerStyleDialogState,
} from './controller'
import {
  canAddEffectType,
  wouldCrossEffectPhase,
} from '../../../core/document'
import {
  addEffectInstance,
  commitDraftEffects,
  createDefaultEffect,
  effectInstanceLabel,
  ensureStyleSlots,
  STYLE_EFFECT_LABELS,
  STYLE_EFFECT_ORDER,
  type StyleEffectKey,
} from './defaults'
import { EffectParamPanels } from './EffectParamPanels'
import {
  ContentEffectParamPanels,
  isContentEffectParamsType,
} from '../content-filters/ContentEffectParamPanels'
import {
  createDefaultContentEffect,
  isContentEffectType,
  type ContentEffectKey,
} from '../content-filters/defaults'
import {
  beginChromaFloodSample,
  beginChromaKeySample,
  endChromaSample,
  getChromaSampleState,
  subscribeChromaSample,
} from './chromaSampleStore'
import styles from './LayerStyleDialog.module.css'

type SelectedKey = string // effect id, or 'blending-options'

function applyDoc(
  doc: ReturnType<typeof useEditorSessionStore.getState>['document'],
) {
  useEditorSessionStore.setState({ document: doc, dirty: true })
}

function cloneEffects(effects: LayerEffect[]): LayerEffect[] {
  return structuredClone(effects)
}

export function LayerStyleDialog() {
  const dialog = useLayerStyleDialogState()
  const document = useEditorSessionStore((s) => s.document)

  const layer = dialog.layerId ? (document.layers[dialog.layerId] ?? null) : null

  const [baselineEffects, setBaselineEffects] = useState<LayerEffect[] | null>(
    null,
  )
  const [baselineFill, setBaselineFill] = useState(1)
  const [draft, setDraft] = useState<LayerEffect[]>([])
  const [draftFill, setDraftFill] = useState(1)
  const [selected, setSelected] = useState<SelectedKey>('blending-options')
  const [addOpen, setAddOpen] = useState(false)
  const sampling = useSyncExternalStore(
    subscribeChromaSample,
    () => getChromaSampleState().kind,
    () => null,
  )

  useEffect(() => {
    if (!dialog.open) endChromaSample()
  }, [dialog.open])

  useEffect(() => {
    if (!dialog.open || !dialog.layerId) {
      setBaselineEffects(null)
      return
    }
    const current =
      useEditorSessionStore.getState().document.layers[dialog.layerId]
    if (!current) {
      closeLayerStyleDialog()
      return
    }
    const slots = ensureStyleSlots(current.effects)
    setBaselineEffects(cloneEffects(current.effects))
    setBaselineFill(current.fillOpacity ?? 1)
    setDraft(slots)
    setDraftFill(current.fillOpacity ?? 1)
    const focusType = dialog.focusEffect
    const focus =
      (focusType && slots.find((e) => e.type === focusType)) ||
      slots.find((e) => e.enabled) ||
      slots.find((e) => e.type === 'drop-shadow') ||
      slots[0]
    setSelected(focus?.id ?? 'blending-options')
    setAddOpen(false)
  }, [dialog.open, dialog.layerId, dialog.focusEffect])

  // Live preview — mutate session without history until OK/Cancel.
  useEffect(() => {
    if (!dialog.open || !dialog.layerId || baselineEffects == null) return
    const session = useEditorSessionStore.getState()
    let next = setLayerEffects(session.document, dialog.layerId, draft)
    next = setFillOpacity(next, dialog.layerId, draftFill)
    useEditorSessionStore.setState({ document: next, dirty: true })
  }, [draft, draftFill, dialog.open, dialog.layerId, baselineEffects])

  const handleCancel = useCallback(() => {
    const layerId = dialog.layerId
    if (!layerId || baselineEffects == null) {
      closeLayerStyleDialog()
      return
    }
    const session = useEditorSessionStore.getState()
    let restored = setLayerEffects(session.document, layerId, baselineEffects)
    restored = setFillOpacity(restored, layerId, baselineFill)
    useEditorSessionStore.setState({ document: restored })
    closeLayerStyleDialog()
  }, [dialog.layerId, baselineEffects, baselineFill])

  const active = useMemo(
    () =>
      selected === 'blending-options'
        ? null
        : (draft.find((e) => e.id === selected) ?? null),
    [draft, selected],
  )

  if (!dialog.open || !dialog.layerId || !layer || baselineEffects == null) {
    return null
  }

  const updateActive = (patch: Partial<LayerEffect>) => {
    if (!active) return
    const id = active.id
    setDraft((prev) =>
      prev.map((e) => (e.id === id ? ({ ...e, ...patch } as LayerEffect) : e)),
    )
  }

  const handleOk = () => {
    if (!dialog.layerId || baselineEffects == null) {
      closeLayerStyleDialog()
      return
    }
    let beforeDoc = setLayerEffects(
      useEditorSessionStore.getState().document,
      dialog.layerId,
      baselineEffects,
    )
    beforeDoc = setFillOpacity(beforeDoc, dialog.layerId, baselineFill)
    const committed = commitDraftEffects(draft)
    let afterDoc = setLayerEffects(beforeDoc, dialog.layerId, committed)
    afterDoc = setFillOpacity(afterDoc, dialog.layerId, draftFill)
    documentHistory.push(
      createMetadataEntry({
        label: 'Layer Style',
        before: beforeDoc,
        after: afterDoc,
        apply: applyDoc,
      }),
    )
    useEditorSessionStore.setState({
      document: afterDoc,
      dirty: true,
      historyVersion: documentHistory.version,
    })
    closeLayerStyleDialog()
  }

  const handleReset = () => {
    if (selected === 'blending-options') {
      setDraftFill(1)
      return
    }
    if (!active) return
    const id = active.id
    setDraft((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        if (isContentEffectType(active.type)) {
          return {
            ...createDefaultContentEffect(active.type as ContentEffectKey),
            id: e.id,
          }
        }
        return {
          ...createDefaultEffect(active.type as StyleEffectKey),
          id: e.id,
        }
      }),
    )
  }

  const moveSelected = (dir: -1 | 1) => {
    if (!active) return
    const id = active.id
    setDraft((prev) => {
      const i = prev.findIndex((e) => e.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      // Key-phase nodes stay pinned ahead of style/content (VISION §3.2).
      if (wouldCrossEffectPhase(prev, i, j)) return prev
      const next = [...prev]
      const tmp = next[i]!
      next[i] = next[j]!
      next[j] = tmp
      return next
    })
  }

  const removeSelected = () => {
    if (!active) return
    const id = active.id
    setDraft((prev) => {
      const next = prev.filter((e) => e.id !== id)
      return next.length ? next : ensureStyleSlots([])
    })
    setSelected('blending-options')
  }

  const handleAdd = (type: StyleEffectKey) => {
    setDraft((prev) => {
      const result = addEffectInstance(prev, type)
      if (!result) return prev
      setSelected(result.created.id)
      return result.next
    })
    setAddOpen(false)
  }

  const selectedIndex =
    active != null ? draft.findIndex((e) => e.id === active.id) : -1

  const canMoveUp =
    !!active &&
    selectedIndex > 0 &&
    !wouldCrossEffectPhase(draft, selectedIndex, selectedIndex - 1)
  const canMoveDown =
    !!active &&
    selectedIndex >= 0 &&
    selectedIndex < draft.length - 1 &&
    !wouldCrossEffectPhase(draft, selectedIndex, selectedIndex + 1)

  return (
    <FloatingWindow
      open
      title={`Layer Style — ${layer.name}`}
      onClose={handleCancel}
      width={720}
      bare
    >
      <div className={styles.root}>
        <div className={styles.body}>
          <div className={styles.effectList}>
            <button
              type="button"
              className={`${styles.effectRow}${
                selected === 'blending-options' ? ` ${styles.effectRowActive}` : ''
              }`}
              onClick={() => setSelected('blending-options')}
            >
              Blending Options
            </button>
            <div className={styles.listDivider} />
            {draft.map((effect) => {
              const label = effectInstanceLabel(effect, draft)
              return (
                <button
                  key={effect.id}
                  type="button"
                  className={`${styles.effectRow}${
                    selected === effect.id ? ` ${styles.effectRowActive}` : ''
                  }`}
                  onClick={() => setSelected(effect.id)}
                >
                  <input
                    type="checkbox"
                    checked={effect.enabled}
                    onChange={(e) => {
                      e.stopPropagation()
                      const id = effect.id
                      setDraft((prev) =>
                        prev.map((fx) =>
                          fx.id === id
                            ? { ...fx, enabled: e.target.checked }
                            : fx,
                        ),
                      )
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className={styles.effectLabel}>{label}</span>
                </button>
              )
            })}
            <div className={styles.listActions}>
              <div className={styles.addWrap}>
                <Button onClick={() => setAddOpen((v) => !v)}>+ Add</Button>
                {addOpen && (
                  <div className={styles.addMenu} role="menu">
                    {STYLE_EFFECT_ORDER.map((type) => {
                      const atCap = !canAddEffectType(draft, type)
                      return (
                        <button
                          key={type}
                          type="button"
                          className={styles.addMenuItem}
                          role="menuitem"
                          disabled={atCap}
                          onClick={() => handleAdd(type)}
                        >
                          {STYLE_EFFECT_LABELS[type]}
                          {atCap ? ' (max)' : ''}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className={styles.stackBtns}>
                <Button disabled={!canMoveUp} onClick={() => moveSelected(-1)}>
                  ↑
                </Button>
                <Button disabled={!canMoveDown} onClick={() => moveSelected(1)}>
                  ↓
                </Button>
                <Button disabled={!active} onClick={removeSelected}>
                  −
                </Button>
              </div>
            </div>
          </div>
          <div className={styles.params}>
            <h3 className={styles.paramsTitle}>
              {selected === 'blending-options'
                ? 'Blending Options'
                : active
                  ? effectInstanceLabel(active, draft)
                  : 'Effect'}
            </h3>
            {selected === 'blending-options' && (
              <section className={styles.paramSection}>
                <h4 className={styles.paramSectionTitle}>Advanced Blending</h4>
                <div className={styles.paramSectionBody}>
                  <p className={styles.hint}>
                    Layer Opacity is edited in Layers / Inspector. Fill Opacity
                    fades layer pixels; enabled styles keep full style opacity.
                  </p>
                  <SliderField
                    label="Fill Opacity"
                    value={Math.round(draftFill * 100)}
                    min={0}
                    max={100}
                    onChange={(v) => setDraftFill(v / 100)}
                  />
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Blend</span>
                    <span className={styles.hint}>{layer.blendMode}</span>
                  </div>
                </div>
              </section>
            )}
            {active && !active.enabled && (
              <p className={styles.hint}>Enable this effect to edit parameters.</p>
            )}
            {active && active.type !== 'chroma-key' && !isContentEffectParamsType(active.type) && (
              <EffectParamPanels
                active={active}
                disabled={!active.enabled}
                onChange={updateActive}
              />
            )}
            {active && isContentEffectParamsType(active.type) && (
              <ContentEffectParamPanels
                active={active}
                disabled={!active.enabled}
                onChange={updateActive}
              />
            )}
            {active && active.type === 'chroma-key' && (
              <section className={styles.paramSection}>
                <h4 className={styles.paramSectionTitle}>Key</h4>
                <div className={styles.paramSectionBody}>
                  <ColorField
                    label="Key"
                    value={active.keyColor}
                    disabled={!active.enabled}
                    onChange={(v) => updateActive({ keyColor: v })}
                    trailing={
                      <Button
                        disabled={!active.enabled || !dialog.layerId}
                        onClick={() => {
                          if (!dialog.layerId) return
                          if (sampling === 'key-color') {
                            endChromaSample()
                            return
                          }
                          beginChromaKeySample({
                            layerId: dialog.layerId,
                            onKeyColor: (hex) => updateActive({ keyColor: hex }),
                          })
                        }}
                      >
                        {sampling === 'key-color' ? 'Click canvas…' : 'Eyedropper'}
                      </Button>
                    }
                  />
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Mode</span>
                    <select
                      className={styles.select}
                      value={active.mode}
                      disabled={!active.enabled}
                      onChange={(e) => {
                        const mode = e.target.value as 'global' | 'flood'
                        updateActive({
                          mode,
                          floodOrigins:
                            mode === 'global' ? [] : active.floodOrigins,
                        })
                      }}
                    >
                      <option value="global">Global</option>
                      <option value="flood">Flood (magic wand)</option>
                    </select>
                  </div>
                  {active.mode === 'flood' && (
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>Seeds</span>
                      <div className={styles.inlineRow}>
                        <Button
                          disabled={!active.enabled || !dialog.layerId}
                          onClick={() => {
                            if (!dialog.layerId) return
                            if (sampling === 'flood-origin') {
                              endChromaSample()
                              return
                            }
                            beginChromaFloodSample({
                              layerId: dialog.layerId,
                              onFloodOrigin: (pt, additive) => {
                                setDraft((prev) =>
                                  prev.map((e) => {
                                    if (e.id !== active.id) return e
                                    if (e.type !== 'chroma-key') return e
                                    return {
                                      ...e,
                                      floodOrigins: additive
                                        ? [...e.floodOrigins, pt]
                                        : [pt],
                                    }
                                  }),
                                )
                              },
                            })
                          }}
                        >
                          {sampling === 'flood-origin'
                            ? 'Click canvas…'
                            : 'Pick seed'}
                        </Button>
                        <Button
                          disabled={
                            !active.enabled || active.floodOrigins.length === 0
                          }
                          onClick={() => updateActive({ floodOrigins: [] })}
                        >
                          Clear ({active.floodOrigins.length})
                        </Button>
                      </div>
                    </div>
                  )}
                  <SliderField
                    label="Tolerance"
                    value={active.tolerance}
                    min={0}
                    max={100}
                    disabled={!active.enabled}
                    onChange={(v) => updateActive({ tolerance: v })}
                  />
                  <SliderField
                    label="Softness"
                    value={active.softness}
                    min={0}
                    max={100}
                    disabled={!active.enabled}
                    onChange={(v) => updateActive({ softness: v })}
                  />
                  <SliderField
                    label="Despill"
                    value={Math.round(active.despill * 100)}
                    min={0}
                    max={100}
                    disabled={!active.enabled}
                    onChange={(v) => updateActive({ despill: v / 100 })}
                  />
                  <SliderField
                    label="Edge blur"
                    value={active.edgeBlur}
                    min={0}
                    max={10}
                    disabled={!active.enabled}
                    onChange={(v) => updateActive({ edgeBlur: v })}
                  />
                  <p className={styles.hint}>
                    CIE Lab key. GPU preview is global-only; export/CPU goldens
                    honor flood.
                  </p>
                </div>
              </section>
            )}
          </div>
        </div>
        <div className={styles.footer}>
          <Button onClick={handleReset}>Reset</Button>
          <div className={styles.footerRight}>
            <Button onClick={handleCancel}>Cancel</Button>
            <Button variant="primary" onClick={handleOk}>
              OK
            </Button>
          </div>
        </div>
      </div>
    </FloatingWindow>
  )
}
