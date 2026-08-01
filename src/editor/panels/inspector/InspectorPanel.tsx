import { useEffect, useMemo } from 'react'
import {
  Eye,
  EyeSlash,
  LockSimple,
  LockSimpleOpen,
  Sparkle,
} from '@phosphor-icons/react'
import {
  BLEND_MODES,
  TEXT_ALIGNS,
  setAdjustment,
  type AdjustmentLayer,
  type BlendMode,
  type CssColor,
  type LayerEffect,
  type TextAlign,
  type TextLayer,
} from '../../../core/document'
import { createMetadataEntry } from '../../../core/history'
import { ColorField } from '../../../ui/base/ColorField'
import { NumericField } from '../../../ui/base/NumericField'
import { IconButton } from '../../../ui/base/IconButton'
import { Button } from '../../../ui/base/Button'
import { openLayerStyleDialog } from '../../../ui/features/layer-style/controller'
import { effectInstanceLabel } from '../../../ui/features/layer-style/defaults'
import { InspectorFxMiniList } from './InspectorFxMiniList'
import { documentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import {
  applyTextOptionsToSelected,
  convertTextMode,
  previewTextProps,
  syncTextOptionsFromLayer,
} from '../../tools/text/textCommands'
import { detectDocumentScripts } from '../../tools/text/googleFonts/scriptDetect'
import { FontFamilyControl } from '../../tools/text/FontFamilyControl'
import { useTextToolStore } from '../../tools/text/textToolStore'
import styles from './InspectorPanel.module.css'

function applyDoc(
  doc: ReturnType<typeof useEditorSessionStore.getState>['document'],
) {
  useEditorSessionStore.setState({ document: doc, dirty: true })
}

function effectSummary(effects: LayerEffect[]): string {
  const enabled = effects.filter((e) => e.enabled)
  if (!enabled.length) return 'None'
  return enabled.map((e) => effectInstanceLabel(e, effects)).join(', ')
}

export function InspectorPanel() {
  const selectedLayerIds = useEditorSessionStore((s) => s.selectedLayerIds)
  const document = useEditorSessionStore((s) => s.document)
  const renameLayer = useEditorSessionStore((s) => s.renameLayer)
  const setOpacity = useEditorSessionStore((s) => s.setOpacity)
  const setFillOpacity = useEditorSessionStore((s) => s.setFillOpacity)
  const setBlendMode = useEditorSessionStore((s) => s.setBlendMode)
  const setTransform = useEditorSessionStore((s) => s.setTransform)
  const toggleVisibility = useEditorSessionStore((s) => s.toggleVisibility)
  const toggleLocked = useEditorSessionStore((s) => s.toggleLocked)

  const layer =
    selectedLayerIds.length === 1
      ? (document.layers[selectedLayerIds[0]!] ?? null)
      : null
  const textEdit = useTextToolStore((s) => s.edit)
  const documentScripts = useMemo(
    () => detectDocumentScripts(Object.values(document.layers).filter((entry) => entry.type === 'text')),
    [document.layers],
  )

  useEffect(() => {
    if (layer?.type === 'text') syncTextOptionsFromLayer(layer)
  }, [layer])

  if (!layer) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          {selectedLayerIds.length > 1
            ? `${selectedLayerIds.length} layers selected`
            : 'Select a layer to inspect'}
        </div>
      </div>
    )
  }

  const t = layer.transform
  const isAdjustment = layer.type === 'adjustment'
  const isText = layer.type === 'text'

  const commitText = (patch: Parameters<typeof applyTextOptionsToSelected>[0]) => {
    if (textEdit && textEdit.layerId === layer.id) {
      previewTextProps(layer.id, patch)
      useTextToolStore.getState().setOptions(patch)
      return
    }
    applyTextOptionsToSelected(patch)
  }

  const commitAdjustment = (next: AdjustmentLayer['adjustment']) => {
    const before = useEditorSessionStore.getState().document
    const after = setAdjustment(before, layer.id, next)
    if (after === before) return
    documentHistory.push(
      createMetadataEntry({
        label: 'Edit Adjustment',
        before,
        after,
        apply: applyDoc,
      }),
    )
    useEditorSessionStore.setState({
      document: after,
      dirty: true,
      historyVersion: documentHistory.version,
    })
  }

  return (
    <div className={styles.root}>
      <div className={styles.section}>
        <div className={styles.label}>Layer</div>
        <div className={styles.nameRow}>
          <IconButton
            icon={layer.visible ? Eye : EyeSlash}
            title={layer.visible ? 'Hide layer' : 'Show layer'}
            active={layer.visible}
            onClick={() => toggleVisibility(layer.id)}
          />
          <IconButton
            icon={layer.locked ? LockSimple : LockSimpleOpen}
            title={layer.locked ? 'Unlock layer' : 'Lock layer'}
            active={layer.locked}
            onClick={() => toggleLocked(layer.id)}
          />
          <input
            className={styles.input}
            value={layer.name}
            onChange={(e) => renameLayer(layer.id, e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Type</span>
          <span className={styles.readonlyValue}>{layer.type}</span>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.label}>Appearance</div>
        <p className={styles.hint}>Also editable in the Layers panel</p>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Blend</span>
          <select
            className={styles.select}
            value={layer.blendMode}
            onChange={(e) => setBlendMode(layer.id, e.target.value as BlendMode)}
          >
            {BLEND_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </div>
        <NumericField
          label="Opacity"
          value={Math.round(layer.opacity * 100)}
          min={0}
          max={100}
          onChange={(v) => setOpacity(layer.id, v / 100)}
        />
        <NumericField
          label="Fill"
          value={Math.round((layer.fillOpacity ?? 1) * 100)}
          min={0}
          max={100}
          onChange={(v) => setFillOpacity(layer.id, v / 100)}
        />
      </div>

      {!isAdjustment && (
        <div className={styles.section}>
          <div className={styles.label}>Layer Style</div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>FX</span>
            <span className={styles.readonlyValue}>{effectSummary(layer.effects)}</span>
          </div>
          <InspectorFxMiniList
            layerId={layer.id}
            effects={layer.effects}
            disabled={layer.type === 'group' && !layer.isolated}
            disabledHint="Turn on Isolate Blending to use layer effects on this group."
          />
          <Button
            onClick={() => openLayerStyleDialog(layer.id)}
          >
            <Sparkle size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Layer Style…
          </Button>
        </div>
      )}

      {isText && (() => {
        const text = layer as TextLayer
        return (
          <>
            <div className={styles.section}>
              <div className={styles.label}>Character</div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Font</span>
                <FontFamilyControl
                  value={text.fontFamily}
                  documentScripts={documentScripts}
                  buttonClassName={styles.fontButton}
                  title="Browse fonts… (Installed and Google Fonts tabs)"
                  onFontChange={(fontFamily) => commitText({ fontFamily, fontSource: undefined })}
                  onGoogleFontSelect={(fontFamily, fontSource) =>
                    commitText({ fontFamily, fontSource, fontWeight: fontSource.weight })
                  }
                />
              </div>
              <NumericField
                label="Size"
                value={text.fontSize}
                min={1}
                max={1024}
                onChange={(v) => commitText({ fontSize: v })}
              />
              <ColorField
                label="Color"
                value={text.color}
                onChange={(c) => commitText({ color: c as CssColor })}
              />
              <NumericField
                label="Weight"
                value={text.fontWeight}
                min={100}
                max={900}
                step={100}
                onChange={(v) => commitText({ fontWeight: v })}
              />
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Style</span>
                <label className={styles.readonlyValue}>
                  <input
                    type="checkbox"
                    checked={text.italic}
                    onChange={(e) => commitText({ italic: e.target.checked })}
                  />{' '}
                  Italic
                </label>
                <label className={styles.readonlyValue}>
                  <input
                    type="checkbox"
                    checked={text.underline}
                    onChange={(e) => commitText({ underline: e.target.checked })}
                  />{' '}
                  Underline
                </label>
              </div>
              <NumericField
                label="Track"
                value={text.tracking}
                min={-200}
                max={500}
                onChange={(v) => commitText({ tracking: v })}
              />
              <NumericField
                label="Baseline"
                value={text.baselineShift ?? 0}
                min={-200}
                max={200}
                onChange={(v) => commitText({ baselineShift: v })}
              />
            </div>
            <div className={styles.section}>
              <div className={styles.label}>Paragraph</div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Align</span>
                <select
                  className={styles.select}
                  value={text.align}
                  onChange={(e) =>
                    commitText({ align: e.target.value as TextAlign })
                  }
                >
                  {TEXT_ALIGNS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <NumericField
                label="Lead"
                value={text.leading}
                min={0}
                max={400}
                onChange={(v) => commitText({ leading: v })}
              />
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Mode</span>
                <select
                  className={styles.select}
                  value={text.textMode}
                  onChange={(e) => {
                    const next = e.target.value as 'point' | 'box'
                    if (next !== text.textMode) void convertTextMode(text.id, next)
                  }}
                >
                  <option value="point">point</option>
                  <option value="box">box</option>
                </select>
              </div>
              {text.textMode === 'box' && (
                <div className={styles.grid2}>
                  <NumericField
                    label="Box W"
                    value={text.bounds.w}
                    min={1}
                    onChange={(v) =>
                      previewTextProps(text.id, {
                        bounds: { ...text.bounds, w: v },
                      })
                    }
                  />
                  <NumericField
                    label="Box H"
                    value={text.bounds.h}
                    min={1}
                    onChange={(v) =>
                      previewTextProps(text.id, {
                        bounds: { ...text.bounds, h: v },
                      })
                    }
                  />
                </div>
              )}
            </div>
          </>
        )
      })()}

      {isAdjustment && (
        <div className={styles.section}>
          <div className={styles.label}>Adjustment</div>
          {layer.adjustment.type === 'brightness-contrast' && (
            <>
              <NumericField
                label="Brightness"
                value={Math.round(layer.adjustment.brightness * 100)}
                min={-100}
                max={100}
                onChange={(v) =>
                  commitAdjustment({
                    type: 'brightness-contrast',
                    brightness: v / 100,
                    contrast: layer.adjustment.type === 'brightness-contrast'
                      ? layer.adjustment.contrast
                      : 0,
                  })
                }
              />
              <NumericField
                label="Contrast"
                value={Math.round(
                  (layer.adjustment.type === 'brightness-contrast'
                    ? layer.adjustment.contrast
                    : 0) * 100,
                )}
                min={-100}
                max={100}
                onChange={(v) =>
                  commitAdjustment({
                    type: 'brightness-contrast',
                    brightness:
                      layer.adjustment.type === 'brightness-contrast'
                        ? layer.adjustment.brightness
                        : 0,
                    contrast: v / 100,
                  })
                }
              />
            </>
          )}
          {layer.adjustment.type === 'hue-saturation' && (() => {
            const adj = layer.adjustment
            return (
              <>
                <NumericField
                  label="Hue"
                  value={adj.hueDeg}
                  min={-180}
                  max={180}
                  onChange={(v) =>
                    commitAdjustment({
                      type: 'hue-saturation',
                      hueDeg: v,
                      saturation: adj.saturation,
                      lightness: adj.lightness,
                    })
                  }
                />
                <NumericField
                  label="Sat"
                  value={Math.round(adj.saturation * 100)}
                  min={-100}
                  max={100}
                  onChange={(v) =>
                    commitAdjustment({
                      type: 'hue-saturation',
                      hueDeg: adj.hueDeg,
                      saturation: v / 100,
                      lightness: adj.lightness,
                    })
                  }
                />
                <NumericField
                  label="Light"
                  value={Math.round(adj.lightness * 100)}
                  min={-100}
                  max={100}
                  onChange={(v) =>
                    commitAdjustment({
                      type: 'hue-saturation',
                      hueDeg: adj.hueDeg,
                      saturation: adj.saturation,
                      lightness: v / 100,
                    })
                  }
                />
              </>
            )
          })()}
          {layer.adjustment.type === 'levels' && (() => {
            const adj = layer.adjustment
            return (
              <>
                <NumericField
                  label="Black"
                  value={adj.black}
                  min={0}
                  max={254}
                  onChange={(v) =>
                    commitAdjustment({
                      type: 'levels',
                      black: v,
                      white: adj.white,
                      gamma: adj.gamma,
                    })
                  }
                />
                <NumericField
                  label="White"
                  value={adj.white}
                  min={1}
                  max={255}
                  onChange={(v) =>
                    commitAdjustment({
                      type: 'levels',
                      black: adj.black,
                      white: v,
                      gamma: adj.gamma,
                    })
                  }
                />
                <NumericField
                  label="Gamma"
                  value={adj.gamma}
                  min={0.1}
                  max={9.99}
                  step={0.01}
                  onChange={(v) =>
                    commitAdjustment({
                      type: 'levels',
                      black: adj.black,
                      white: adj.white,
                      gamma: v,
                    })
                  }
                />
              </>
            )
          })()}
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.label}>Transform</div>
        <div className={styles.grid2}>
          <NumericField
            label="X"
            value={t.x}
            onChange={(v) => setTransform(layer.id, { x: v })}
          />
          <NumericField
            label="Y"
            value={t.y}
            onChange={(v) => setTransform(layer.id, { y: v })}
          />
          <NumericField
            label="Scale X"
            value={t.scaleX}
            step={0.01}
            onChange={(v) => setTransform(layer.id, { scaleX: v })}
          />
          <NumericField
            label="Scale Y"
            value={t.scaleY}
            step={0.01}
            onChange={(v) => setTransform(layer.id, { scaleY: v })}
          />
          <NumericField
            label="Rotate"
            value={t.rotationDeg}
            onChange={(v) => setTransform(layer.id, { rotationDeg: v })}
          />
          <NumericField
            label="Skew X"
            value={t.skewXDeg}
            onChange={(v) => setTransform(layer.id, { skewXDeg: v })}
          />
          <NumericField
            label="Skew Y"
            value={t.skewYDeg}
            onChange={(v) => setTransform(layer.id, { skewYDeg: v })}
          />
        </div>
      </div>
    </div>
  )
}
