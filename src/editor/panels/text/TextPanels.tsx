import { useEffect, useMemo, useState } from 'react'
import {
  TextAlignCenter,
  TextAlignJustify,
  TextAlignLeft,
  TextAlignRight,
  TextB,
  TextItalic,
  TextUnderline,
} from '@phosphor-icons/react'
import type { CssColor, TextAlign, TextLayer } from '../../../core/document'
import { ColorSwatchButton } from '../../../ui/base/ColorPicker'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import {
  applyTextOptionsToSelected,
  convertTextMode,
  syncTextOptionsFromLayer,
} from '../../tools/text/textCommands'
import { GoogleFontAxisEditor } from '../../tools/text/googleFonts/GoogleFontAxisEditor'
import { detectDocumentScripts } from '../../tools/text/googleFonts/scriptDetect'
import { FontFamilyControl } from '../../tools/text/FontFamilyControl'
import { readGoogleFontsModePref, GOOGLE_FONTS_MODE_CHANGED_EVENT } from '../../../ui/features/settings/prefs'
import { normalizedTextRuns, resolveRunTracking, resolveRunUnderline } from '../../tools/text/textRuns'
import { useTextToolStore } from '../../tools/text/textToolStore'
import styles from './TextPanels.module.css'

function sharedValue<T>(fallback: T, values: T[]): T | null {
  if (!values.length) return fallback
  const first = values[0]!
  return values.every((value) => value === first) ? first : null
}

function sharedFontSource(
  fallback: TextLayer['fontSource'],
  values: Array<TextLayer['fontSource'] | undefined>,
): TextLayer['fontSource'] | null {
  const candidates = values.length ? values : [fallback]
  const first = candidates[0]
  if (!first) return fallback ?? null
  const key = (source?: TextLayer['fontSource']) =>
    source
      ? `${source.catalogId}:${source.weight}:${source.style}:${source.version}:${source.variationPin ?? ''}`
      : ''
  return candidates.every((source) => key(source) === key(first)) ? first : null
}

function useTextTarget() {
  const selectedIds = useEditorSessionStore((state) => state.selectedLayerIds)
  const document = useEditorSessionStore((state) => state.document)
  const selection = useTextToolStore((state) => state.selection)
  const selected =
    selectedIds.length === 1 && document.layers[selectedIds[0]!]?.type === 'text'
      ? document.layers[selectedIds[0]!] as TextLayer
      : null
  const layer = selected

  useEffect(() => {
    if (layer) syncTextOptionsFromLayer(layer)
  }, [layer])

  const selectedRuns =
    layer && selection?.layerId === layer.id && selection.start !== selection.end
      ? normalizedTextRuns(layer).filter(
          (run) => run.end > selection.start && run.start < selection.end,
        )
      : []
  return { layer, selection, selectedRuns }
}

function EmptyTextPanel({ name }: { name: string }) {
  return <div className={styles.empty}>Select or edit a text layer to adjust {name.toLowerCase()}.</div>
}

export function CharacterPanel() {
  const { layer, selection, selectedRuns } = useTextTarget()
  const [axisError, setAxisError] = useState('')
  const [googleFontsMode, setGoogleFontsMode] = useState(readGoogleFontsModePref)
  const document = useEditorSessionStore((state) => state.document)
  const documentScripts = useMemo(
    () => detectDocumentScripts(Object.values(document.layers).filter((entry) => entry.type === 'text')),
    [document.layers],
  )

  useEffect(() => {
    const sync = () => setGoogleFontsMode(readGoogleFontsModePref())
    window.addEventListener(GOOGLE_FONTS_MODE_CHANGED_EVENT, sync)
    return () => window.removeEventListener(GOOGLE_FONTS_MODE_CHANGED_EVENT, sync)
  }, [])

  if (!layer) return <EmptyTextPanel name="Character" />
  const hasRange = selection?.layerId === layer.id && selection.start !== selection.end
  const fontFamily = sharedValue(layer.fontFamily, selectedRuns.map((run) => run.fontFamily))
  const fontSource = sharedFontSource(layer.fontSource, selectedRuns.map((run) => run.fontSource))
  const fontSize = sharedValue(layer.fontSize, selectedRuns.map((run) => run.fontSize))
  const fontWeight = sharedValue(layer.fontWeight, selectedRuns.map((run) => run.fontWeight))
  const italic = sharedValue(layer.italic, selectedRuns.map((run) => run.italic))
  const color = sharedValue(layer.color, selectedRuns.map((run) => run.color))
  const tracking = hasRange
    ? sharedValue(layer.tracking, selectedRuns.map((run) => resolveRunTracking(run, layer)))
    : layer.tracking
  const underline = hasRange
    ? sharedValue(layer.underline, selectedRuns.map((run) => resolveRunUnderline(run, layer)))
    : layer.underline

  return (
    <div className={styles.root}>
      <div className={styles.caption}>
        Character{hasRange ? ` · ${selection.end - selection.start} selected` : ''}
      </div>
      <label className={styles.row}>
        <span>Font</span>
        <FontFamilyControl
          value={fontFamily ?? ''}
          placeholder="Mixed"
          documentScripts={documentScripts}
          buttonClassName={styles.fontButton}
          title="Browse fonts… (Installed and Google Fonts tabs)"
          onFontChange={(nextFontFamily) =>
            applyTextOptionsToSelected({ fontFamily: nextFontFamily, fontSource: undefined })
          }
          onGoogleFontSelect={(nextFontFamily, fontSource) =>
            applyTextOptionsToSelected({
              fontFamily: nextFontFamily,
              fontSource,
              fontWeight: fontSource.weight,
            })
          }
        />
      </label>
      {googleFontsMode === 'off' ? (
        <p className={styles.note}>
          Google Fonts tab is visible in the font picker. Enable browsing in Settings → Text → Google Fonts.
        </p>
      ) : null}
      <div className={styles.grid}>
        <label className={styles.row}>
          <span>Size</span>
          <input type="number" min={1} max={1024} value={fontSize ?? ''} placeholder="—" onChange={(event) => applyTextOptionsToSelected({ fontSize: Math.max(1, Number(event.target.value) || 1) })} />
        </label>
        <label className={styles.row}>
          <span>Track</span>
          <input type="number" min={-200} max={500} value={tracking ?? ''} placeholder="—" title="Tracking (1/1000 em)" onChange={(event) => applyTextOptionsToSelected({ tracking: Math.max(-200, Math.min(500, Number(event.target.value) || 0)) })} />
        </label>
      </div>
      <label className={styles.row}>
        <span>Baseline</span>
        <input type="number" min={-200} max={200} value={hasRange ? sharedValue(layer.baselineShift ?? 0, selectedRuns.map((run) => run.baselineShift ?? layer.baselineShift ?? 0)) ?? '' : (layer.baselineShift ?? 0)} placeholder="—" title="Baseline shift (px)" onChange={(event) => applyTextOptionsToSelected({ baselineShift: Math.max(-200, Math.min(200, Number(event.target.value) || 0)) })} />
      </label>
      <div className={styles.controls}>
        <ColorSwatchButton
          className={styles.color}
          value={(color ?? layer.color) as CssColor}
          title="Text color"
          size="sm"
          pickerTitle="Text Color"
          onChange={(value) => applyTextOptionsToSelected({ color: value as CssColor })}
        />
        <button type="button" className={fontWeight != null && fontWeight >= 700 ? styles.active : styles.button} title="Bold" onClick={() => applyTextOptionsToSelected({ fontWeight: fontWeight != null && fontWeight >= 700 ? 400 : 700 })}><TextB size={14} weight="bold" /></button>
        <button type="button" className={italic ? styles.active : styles.button} title="Italic" onClick={() => applyTextOptionsToSelected({ italic: !italic })}><TextItalic size={14} /></button>
        <button type="button" className={underline ? styles.active : styles.button} title="Underline" onClick={() => applyTextOptionsToSelected({ underline: !underline })}><TextUnderline size={14} /></button>
      </div>
      {fontSource?.kind === 'google-fonts' && !hasRange ? (
        <>
          <GoogleFontAxisEditor
            fontSource={fontSource}
            layerStyle={{ italic: layer.italic }}
            onPinned={(source, fontWeight) => {
              setAxisError('')
              applyTextOptionsToSelected({ fontSource: source, fontWeight })
            }}
            onError={setAxisError}
          />
          {axisError ? <p className={styles.note} role="alert">{axisError}</p> : null}
        </>
      ) : null}
    </div>
  )
}

export function ParagraphPanel() {
  const { layer } = useTextTarget()
  if (!layer) return <EmptyTextPanel name="Paragraph" />
  return (
    <div className={styles.root}>
      <div className={styles.caption}>Paragraph</div>
      <div className={styles.controls}>
        {([
          ['left', TextAlignLeft],
          ['center', TextAlignCenter],
          ['right', TextAlignRight],
          ['justify', TextAlignJustify],
        ] as const).map(([align, Icon]) => (
          <button key={align} type="button" className={layer.align === align ? styles.active : styles.button} title={`Align ${align}`} onClick={() => applyTextOptionsToSelected({ align: align as TextAlign })}><Icon size={15} /></button>
        ))}
      </div>
      <label className={styles.row}>
        <span>Leading</span>
        <input type="number" min={0} max={400} value={layer.leading} title="0 = Auto" onChange={(event) => applyTextOptionsToSelected({ leading: Math.max(0, Math.min(400, Number(event.target.value) || 0)) })} />
      </label>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.button}
          title={layer.textMode === 'point' ? 'Convert to Paragraph Text' : 'Convert to Point Text'}
          onClick={() => void convertTextMode(layer.id, layer.textMode === 'point' ? 'box' : 'point')}
        >
          {layer.textMode === 'point' ? 'Convert to Box' : 'Convert to Point'}
        </button>
      </div>
      <div className={styles.note}>{layer.leading === 0 ? 'Auto leading (120%)' : `${layer.leading}px leading`} · {layer.textMode === 'box' ? 'Box text' : 'Point text'}</div>
    </div>
  )
}
