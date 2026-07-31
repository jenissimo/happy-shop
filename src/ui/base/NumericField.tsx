import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import styles from './NumericField.module.css'
import { useScrub } from './useScrub'

type Props = {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  disabled?: boolean
  className?: string
  unit?: string
  /** Alt-click the label to restore this value. */
  defaultValue?: number
  /** When true, only the input is rendered (caller supplies an external label). */
  hideLabel?: boolean
}

function clamp(n: number, min?: number, max?: number): number {
  let v = n
  if (min != null) v = Math.max(min, v)
  if (max != null) v = Math.min(max, v)
  return v
}

export function NumericField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  disabled = false,
  className,
  unit,
  defaultValue,
  hideLabel = false,
}: Props) {
  const commit = (next: number) => {
    const rounded = Math.round(next * 1000) / 1000
    onChange(clamp(rounded, min, max))
  }
  const scrub = useScrub({ value, step, min, max, onChange: commit })

  const onLabelPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (disabled) return
    if (e.altKey && defaultValue != null) {
      e.preventDefault()
      commit(defaultValue)
      return
    }
    scrub.onPointerDown(e)
  }

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    commit(n)
  }

  return (
    <label
      className={[
        styles.field,
        hideLabel ? styles.inputOnly : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!hideLabel && (
        <span
          className={styles.label}
          onPointerDown={onLabelPointerDown}
          onPointerMove={scrub.onPointerMove}
          onPointerUp={scrub.onPointerUp}
          onPointerCancel={scrub.onPointerCancel}
          style={scrub.style}
          title={defaultValue != null ? 'Drag to adjust · Alt-click to reset' : 'Drag to adjust'}
        >
          {label}
        </span>
      )}
      <input
        type="number"
        className={styles.input}
        value={value}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={hideLabel ? label : undefined}
        onChange={onInputChange}
      />
      {unit && <span className={styles.unit}>{unit}</span>}
    </label>
  )
}
