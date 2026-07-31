import { useMemo } from 'react'
import type { GoogleFontAxis } from './catalogTypes'
import { AXIS_LABELS } from './variableAxis'
import styles from './VariableAxisControls.module.css'

type Props = {
  axes: readonly GoogleFontAxis[]
  values: Record<string, number>
  disabled?: boolean
  onChange: (tag: string, value: number) => void
}

export function VariableAxisControls({ axes, values, disabled, onChange }: Props) {
  const rows = useMemo(() => axes.filter((axis) => axis.max > axis.min), [axes])
  if (!rows.length) return null

  return (
    <div className={styles.root} aria-label="Variable font axes">
      {rows.map((axis) => {
        const value = values[axis.tag] ?? axis.default
        return (
          <label key={axis.tag} className={styles.row}>
            <span>{AXIS_LABELS[axis.tag] ?? axis.tag}</span>
            <input
              type="range"
              min={axis.min}
              max={axis.max}
              step={axis.tag === 'opsz' ? 0.1 : 1}
              value={value}
              disabled={disabled}
              aria-valuemin={axis.min}
              aria-valuemax={axis.max}
              aria-valuenow={value}
              onChange={(event) => onChange(axis.tag, Number(event.target.value))}
            />
            <output>{Math.round(value * 10) / 10}</output>
          </label>
        )
      })}
    </div>
  )
}
