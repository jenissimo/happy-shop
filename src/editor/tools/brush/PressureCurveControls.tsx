import type { BrushToolPrefs } from './brushSettingsStore'
import type { PressureCurveKind } from './pointerPressure'
import styles from './PressureCurveControls.module.css'

const CURVE_LABELS: Record<PressureCurveKind, string> = {
  linear: 'Linear',
  soft: 'Soft',
  hard: 'Hard',
}

type ChannelRowProps = {
  label: string
  enabled: boolean
  curve: PressureCurveKind
  onEnabledChange: (enabled: boolean) => void
  onCurveChange: (curve: PressureCurveKind) => void
}

function ChannelRow({
  label,
  enabled,
  curve,
  onEnabledChange,
  onCurveChange,
}: ChannelRowProps) {
  return (
    <div className={styles.row}>
      <label className={styles.toggle} title={`Pen pressure controls ${label.toLowerCase()}`}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      <select
        className={styles.curve}
        value={curve}
        disabled={!enabled}
        aria-label={`${label} pressure curve`}
        onChange={(event) => onCurveChange(event.target.value as PressureCurveKind)}
      >
        {(Object.keys(CURVE_LABELS) as PressureCurveKind[]).map((kind) => (
          <option key={kind} value={kind}>
            {CURVE_LABELS[kind]}
          </option>
        ))}
      </select>
    </div>
  )
}

type PressurePrefs = Pick<
  BrushToolPrefs,
  | 'pressureControlsSize'
  | 'pressureControlsOpacity'
  | 'pressureControlsFlow'
  | 'pressureSizeCurve'
  | 'pressureOpacityCurve'
  | 'pressureFlowCurve'
>

type Props = PressurePrefs & {
  onChange: (patch: Partial<PressurePrefs>) => void
}

export function formatPressureHint(
  size: boolean,
  opacity: boolean,
  flow: boolean,
): string {
  const parts: string[] = []
  if (size) parts.push('size')
  if (opacity) parts.push('opacity')
  if (flow) parts.push('flow')
  if (parts.length === 0) return ''
  return `Pen pressure: ${parts.join(', ')} · `
}

export function PressureCurveControls({
  pressureControlsSize,
  pressureControlsOpacity,
  pressureControlsFlow,
  pressureSizeCurve,
  pressureOpacityCurve,
  pressureFlowCurve,
  onChange,
}: Props) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>Pen pressure</legend>
      <p className={styles.note}>
        Mouse and touch always use the selected slider values.
      </p>
      <ChannelRow
        label="Size"
        enabled={pressureControlsSize}
        curve={pressureSizeCurve}
        onEnabledChange={(enabled) => onChange({ pressureControlsSize: enabled })}
        onCurveChange={(curve) => onChange({ pressureSizeCurve: curve })}
      />
      <ChannelRow
        label="Opacity"
        enabled={pressureControlsOpacity}
        curve={pressureOpacityCurve}
        onEnabledChange={(enabled) => onChange({ pressureControlsOpacity: enabled })}
        onCurveChange={(curve) => onChange({ pressureOpacityCurve: curve })}
      />
      <ChannelRow
        label="Flow"
        enabled={pressureControlsFlow}
        curve={pressureFlowCurve}
        onEnabledChange={(enabled) => onChange({ pressureControlsFlow: enabled })}
        onCurveChange={(curve) => onChange({ pressureFlowCurve: curve })}
      />
    </fieldset>
  )
}
