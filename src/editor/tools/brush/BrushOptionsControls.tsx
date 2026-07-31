import { useEffect, useRef, useState } from 'react'
import { ColorSwatchButton } from '../../../ui/base/ColorPicker'
import { FlyoutSliderField } from '../../../ui/base/FlyoutSliderField'
import { NumericField } from '../../../ui/base/NumericField'
import { AngleField } from '../../../ui/base/AngleField'
import { useColorStore } from '../../color/colorStore'
import {
  useBrushSettingsStore,
} from './brushSettingsStore'
import { BrushTipPicker, TipThumbnail } from './BrushTipPicker'
import {
  formatPressureHint,
  PressureCurveControls,
} from './PressureCurveControls'
import { getTip } from '../../../imaging/brushes/tipRegistry'
import { PENCIL_TIP_ID } from '../../../imaging/brushes/presets/proc'
import { MODIFIER_GRAMMAR } from '../modifierGrammar'
import styles from './BrushOptionsControls.module.css'

type Props = {
  /** Compact row for the options bar; stacked for the context menu. */
  layout?: 'bar' | 'menu'
  /** Pencil locks hard square stamps and hides soft-brush controls. */
  variant?: 'brush' | 'pencil'
}

export function BrushOptionsControls({ layout = 'bar', variant = 'brush' }: Props) {
  const tipId = useBrushSettingsStore((s) => s.tipId)
  const size = useBrushSettingsStore((s) => s.size)
  const hardness = useBrushSettingsStore((s) => s.hardness)
  const opacity = useBrushSettingsStore((s) => s.opacity)
  const flow = useBrushSettingsStore((s) => s.flow)
  const spacing = useBrushSettingsStore((s) => s.spacing)
  const angle = useBrushSettingsStore((s) => s.angle)
  const roundness = useBrushSettingsStore((s) => s.roundness)
  const pencilPixelPerfect = useBrushSettingsStore((s) => s.pencilPixelPerfect)
  const pressureControlsSize = useBrushSettingsStore((s) => s.pressureControlsSize)
  const pressureControlsOpacity = useBrushSettingsStore((s) => s.pressureControlsOpacity)
  const pressureControlsFlow = useBrushSettingsStore((s) => s.pressureControlsFlow)
  const pressureSizeCurve = useBrushSettingsStore((s) => s.pressureSizeCurve)
  const pressureOpacityCurve = useBrushSettingsStore((s) => s.pressureOpacityCurve)
  const pressureFlowCurve = useBrushSettingsStore((s) => s.pressureFlowCurve)
  const setPrefs = useBrushSettingsStore((s) => s.setPrefs)
  const foreground = useColorStore((s) => s.foreground)
  const setForeground = useColorStore((s) => s.setForeground)

  const [pickerOpen, setPickerOpen] = useState(false)
  const tipButtonRef = useRef<HTMLButtonElement>(null)
  const isPencil = variant === 'pencil'
  const pencilTip = getTip(PENCIL_TIP_ID) ?? getTip('proc.round-hard')!
  const tip = isPencil ? pencilTip : (getTip(tipId) ?? getTip('proc.round-soft')!)
  const brushModifiers = MODIFIER_GRAMMAR.find(
    (row) => row.tool === (isPencil ? 'Pencil' : 'Brush / Eraser'),
  ) ?? MODIFIER_GRAMMAR.find((row) => row.tool === 'Brush / Eraser')!
  const ValueField = layout === 'bar' ? FlyoutSliderField : NumericField

  useEffect(() => {
    if (!isPencil) return
    if (tipId !== PENCIL_TIP_ID || hardness !== 1) {
      setPrefs({ tipId: PENCIL_TIP_ID, hardness: 1 })
    }
  }, [isPencil, tipId, hardness, setPrefs])

  return (
    <div
      className={layout === 'menu' ? styles.menu : styles.bar}
      role="group"
      aria-label={isPencil ? 'Pencil options' : 'Brush options'}
    >
      {!isPencil ? (
        <div className={styles.tips}>
          <button
            ref={tipButtonRef}
            type="button"
            className={styles.tipButton}
            title={`Choose brush tip: ${tip.name}`}
            aria-label={`Choose brush tip: ${tip.name}`}
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
          >
            <TipThumbnail tip={tip} className={styles.tipThumbnail} />
          </button>
          <BrushTipPicker
            open={pickerOpen}
            anchorRef={tipButtonRef}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      ) : (
        <div className={styles.tips}>
          <button
            ref={tipButtonRef}
            type="button"
            className={styles.tipButton}
            title={`Pencil tip: ${tip.name} (locked)`}
            aria-label={`Pencil tip: ${tip.name}`}
            aria-disabled="true"
            disabled
          >
            <TipThumbnail tip={tip} className={styles.tipThumbnail} />
          </button>
        </div>
      )}
      <label className={styles.color} title="Foreground / brush color">
        <span className={styles.colorLabel}>Color</span>
        <ColorSwatchButton
          value={foreground}
          onChange={setForeground}
          size="sm"
          ariaLabel="Brush color"
          pickerTitle="Brush Color"
        />
      </label>
      <ValueField
        label="Size"
        value={size}
        min={1}
        max={500}
        step={1}
        defaultValue={isPencil ? 1 : 20}
        onChange={(v) => setPrefs({ size: isPencil ? Math.max(1, Math.round(v)) : v })}
        className={styles.field}
      />
      {!isPencil ? (
        <ValueField
          label="Hard"
          value={Math.round(hardness * 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          defaultValue={35}
          onChange={(v) => setPrefs({ hardness: v / 100 })}
          className={styles.field}
        />
      ) : (
        <ValueField
          label="Hard"
          value={100}
          min={100}
          max={100}
          step={1}
          unit="%"
          defaultValue={100}
          onChange={() => {}}
          className={styles.field}
          disabled
        />
      )}
      <ValueField
        label="Opac"
        value={Math.round(opacity * 100)}
        min={0}
        max={100}
        step={1}
        unit="%"
        defaultValue={100}
        onChange={(v) => setPrefs({ opacity: v / 100 })}
        className={styles.field}
      />
      <ValueField
        label="Flow"
        value={Math.round(flow * 100)}
        min={1}
        max={100}
        step={1}
        unit="%"
        defaultValue={100}
        onChange={(v) => setPrefs({ flow: v / 100 })}
        className={styles.field}
      />
      {!isPencil ? (
        <>
          <ValueField
            label="Spac"
            value={Math.round(spacing * 100)}
            min={5}
            max={100}
            step={1}
            unit="%"
            defaultValue={25}
            onChange={(v) => setPrefs({ spacing: v / 100 })}
            className={styles.field}
          />
          <AngleField
            label="Angle"
            value={angle}
            onChange={(v) => setPrefs({ angle: v })}
            className={styles.angle}
          />
          <ValueField
            label="Round"
            value={Math.round(roundness * 100)}
            min={5}
            max={100}
            step={1}
            unit="%"
            defaultValue={100}
            onChange={(v) => setPrefs({ roundness: v / 100 })}
            className={styles.field}
          />
        </>
      ) : (
        <label className={styles.hint} title="Avoid diagonal double-thick pixels">
          <input
            type="checkbox"
            checked={pencilPixelPerfect}
            onChange={(event) =>
              setPrefs({ pencilPixelPerfect: event.target.checked })
            }
          />
          Pixel Perfect
        </label>
      )}
      {layout === 'menu' ? (
        <PressureCurveControls
          pressureControlsSize={pressureControlsSize}
          pressureControlsOpacity={pressureControlsOpacity}
          pressureControlsFlow={pressureControlsFlow}
          pressureSizeCurve={pressureSizeCurve}
          pressureOpacityCurve={pressureOpacityCurve}
          pressureFlowCurve={pressureFlowCurve}
          onChange={setPrefs}
        />
      ) : null}
      {layout === 'bar' ? (
        <span
          className={styles.hint}
          title="Pen pressure mapping for size, opacity, and flow. Brush modifiers: Shift and Alt."
        >
          {formatPressureHint(
            pressureControlsSize,
            pressureControlsOpacity,
            pressureControlsFlow,
          )}
          Shift: {brushModifiers.shift} · Alt: {brushModifiers.alt}
        </span>
      ) : null}
    </div>
  )
}
