import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import styles from './SliderField.module.css'
import { useScrub } from './useScrub'

type Props = {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
  unit?: string
  /** Alt-click the label to restore this value. */
  defaultValue?: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function SliderField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  className,
  unit,
  defaultValue,
}: Props) {
  const commit = (next: number) => {
    const snapped = step > 0 ? Math.round(next / step) * step : next
    const rounded = Math.round(snapped * 1000) / 1000
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
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
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
      <input
        type="range"
        className={styles.slider}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => commit(Number(e.target.value))}
      />
      <input
        type="number"
        className={styles.input}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={`${label} value`}
        onChange={onInputChange}
      />
      {unit && <span className={styles.unit}>{unit}</span>}
    </div>
  )
}
