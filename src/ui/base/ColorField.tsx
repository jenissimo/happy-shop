import type { ChangeEvent, ReactNode } from 'react'
import { ColorSwatchButton } from './ColorPicker'
import styles from './ColorField.module.css'

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  /** Show alpha channel in the picker (#rrggbbaa). */
  alpha?: boolean
  /** Optional trailing control (eyedropper, etc.). */
  trailing?: ReactNode
}

function toHexDisplay(value: string, alpha: boolean): string {
  const v = value.trim()
  if (alpha && /^#[0-9a-fA-F]{8}$/.test(v)) return v.toLowerCase()
  if (/^#[0-9a-fA-F]{6}/.test(v)) return v.slice(0, 7).toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1]!
    const g = v[2]!
    const b = v[3]!
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return '#000000'
}

export function ColorField({
  label,
  value,
  onChange,
  disabled = false,
  className,
  alpha = false,
  trailing,
}: Props) {
  const hex = toHexDisplay(value, alpha)

  const onHexChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim()
    if (alpha && /^#[0-9a-fA-F]{8}$/.test(raw)) {
      onChange(raw.toLowerCase())
      return
    }
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
      onChange(raw.toLowerCase())
      return
    }
    if (alpha && /^[0-9a-fA-F]{8}$/.test(raw)) {
      onChange(`#${raw.toLowerCase()}`)
      return
    }
    if (/^[0-9a-fA-F]{6}$/.test(raw)) {
      onChange(`#${raw.toLowerCase()}`)
    }
  }

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <span className={styles.label}>{label}</span>
      <div className={styles.swatchRow}>
        <ColorSwatchButton
          value={value}
          onChange={onChange}
          alpha={alpha}
          disabled={disabled}
          size="md"
          ariaLabel={label}
          pickerTitle={label}
          className={styles.swatch}
        />
        <input
          className={styles.hex}
          type="text"
          value={hex}
          disabled={disabled}
          spellCheck={false}
          aria-label={`${label} hex`}
          onChange={onHexChange}
        />
        {trailing}
      </div>
    </div>
  )
}
