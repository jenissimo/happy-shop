import { useEffect, useMemo, useState } from 'react'
import { probeClipboardImageSize } from '../../../imaging'
import { Button } from '../../base/Button'
import { ColorSwatchButton } from '../../base/ColorPicker'
import { FloatingWindow } from '../../base/FloatingWindow'
import { NumericField } from '../../base/NumericField'
import { applyNewDocument } from './commands'
import { closeNewDocumentDialog, useNewDocumentDialogOpen } from './controller'
import { createDocumentResultFromDialog } from './createDocumentFromDialog'
import {
  CLIPBOARD_PRESET_ID,
  CUSTOM_PRESET_ID,
  DOCUMENT_PRESETS,
  findPreset,
  makeClipboardPreset,
  type DocumentPreset,
} from './presets'
import {
  canSubmitNewDocument,
  clampDimension,
  createDefaultFormState,
  isOverSoftLimit,
  type BackgroundOption,
  type NewDocumentFormState,
} from './validation'
import styles from './NewDocumentDialog.module.css'

type ClipboardHint =
  | { kind: 'checking' }
  | { kind: 'found'; preset: DocumentPreset }
  | { kind: 'none' }
  | { kind: 'unsupported' }
  | { kind: 'permission-denied' }

const BACKGROUND_OPTIONS: { value: BackgroundOption; label: string }[] = [
  { value: 'transparent', label: 'Transparent' },
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
  { value: 'custom', label: 'Custom' },
]

/**
 * New Document floating window (UX-PHOTOSHOP.md). Non-modal — editor stays usable.
 */
export function NewDocumentDialog() {
  const open = useNewDocumentDialogOpen()
  const [form, setForm] = useState<NewDocumentFormState>(createDefaultFormState)
  const [selectedPresetId, setSelectedPresetId] = useState<string>(CUSTOM_PRESET_ID)
  const [clipboardHint, setClipboardHint] = useState<ClipboardHint>({ kind: 'checking' })

  useEffect(() => {
    if (!open) return
    setForm(createDefaultFormState())
    setSelectedPresetId(CUSTOM_PRESET_ID)
    setClipboardHint({ kind: 'checking' })

    let cancelled = false
    void probeClipboardImageSize().then((result) => {
      if (cancelled) return
      if (result.status === 'found') {
        const preset = makeClipboardPreset(result.probe.width, result.probe.height)
        setClipboardHint({ kind: 'found', preset })
        setSelectedPresetId(CLIPBOARD_PRESET_ID)
        setForm((f) => ({ ...f, width: preset.width, height: preset.height }))
      } else if (result.status === 'permission-denied') {
        setClipboardHint({ kind: 'permission-denied' })
      } else if (result.status === 'unsupported') {
        setClipboardHint({ kind: 'unsupported' })
      } else {
        setClipboardHint({ kind: 'none' })
      }
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const presetOptions = useMemo(() => {
    if (clipboardHint.kind !== 'found') return DOCUMENT_PRESETS
    return [DOCUMENT_PRESETS[0]!, clipboardHint.preset, ...DOCUMENT_PRESETS.slice(1)]
  }, [clipboardHint])

  const overSoftLimit = isOverSoftLimit(form.width, form.height)
  const canSubmit = canSubmitNewDocument(form)

  const applyPreset = (id: string) => {
    setSelectedPresetId(id)
    const preset =
      id === CLIPBOARD_PRESET_ID && clipboardHint.kind === 'found'
        ? clipboardHint.preset
        : findPreset(id)
    if (preset) setForm((f) => ({ ...f, width: preset.width, height: preset.height }))
  }

  const setDimension = (key: 'width' | 'height', value: number) => {
    setSelectedPresetId(CUSTOM_PRESET_ID)
    setForm((f) => ({ ...f, [key]: clampDimension(value) }))
  }

  const handleCreate = async () => {
    if (!canSubmit) return
    const { document, asset } = await createDocumentResultFromDialog(form)
    applyNewDocument({ document, assets: [asset] })
    closeNewDocumentDialog()
  }

  return (
    <FloatingWindow
      open={open}
      title="New Document"
      onClose={closeNewDocumentDialog}
      width={420}
      bare
    >
      <div className={styles.content}>
        {clipboardHint.kind === 'found' && (
          <p className={styles.hint}>
            Found a {clipboardHint.preset.width}×{clipboardHint.preset.height} image on the
            clipboard — dimensions prefilled.
          </p>
        )}
        {clipboardHint.kind === 'permission-denied' && (
          <p className={styles.hint}>
            Clipboard access denied — paste into the canvas after creating, or grant clipboard
            permission and reopen this dialog.
          </p>
        )}
        {clipboardHint.kind === 'unsupported' && (
          <p className={styles.hint}>
            This browser can&apos;t read the clipboard directly — paste an image after creating
            the document instead.
          </p>
        )}

        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <input
            className={styles.textInput}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            autoFocus
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Preset</span>
          <select
            className={styles.select}
            value={selectedPresetId}
            onChange={(e) => applyPreset(e.target.value)}
          >
            {presetOptions.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.dimensionsRow}>
          <NumericField
            label="Width"
            value={form.width}
            min={1}
            max={8192}
            onChange={(v) => setDimension('width', v)}
          />
          <NumericField
            label="Height"
            value={form.height}
            min={1}
            max={8192}
            onChange={(v) => setDimension('height', v)}
          />
          <span className={styles.pixelUnit}>px · 8-bit RGB</span>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Background</span>
          <div className={styles.backgroundRow}>
            {BACKGROUND_OPTIONS.map((opt) => (
              <label key={opt.value} className={styles.radioOption}>
                <input
                  type="radio"
                  name="new-document-background"
                  checked={form.background === opt.value}
                  onChange={() => setForm((f) => ({ ...f, background: opt.value }))}
                />
                <span>{opt.label}</span>
              </label>
            ))}
            {form.background === 'custom' && (
              <ColorSwatchButton
                className={styles.colorInput}
                value={/^#[0-9a-fA-F]{6}$/.test(form.customColor) ? form.customColor : '#ffffff'}
                onChange={(c) => setForm((f) => ({ ...f, customColor: c }))}
                size="sm"
                ariaLabel="Custom background color"
                pickerTitle="Background Color"
              />
            )}
          </div>
        </div>

        {overSoftLimit && (
          <label className={styles.megapixelWarning}>
            <input
              type="checkbox"
              checked={form.megapixelConfirmed}
              onChange={(e) =>
                setForm((f) => ({ ...f, megapixelConfirmed: e.target.checked }))
              }
            />
            <span>
              This document is larger than 64 megapixels and may be slow to edit. I understand.
            </span>
          </label>
        )}

        <div className={styles.actions}>
          <Button onClick={() => closeNewDocumentDialog()}>Cancel</Button>
          <Button variant="primary" disabled={!canSubmit} onClick={handleCreate}>
            Create
          </Button>
        </div>
      </div>
    </FloatingWindow>
  )
}
