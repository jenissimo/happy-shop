import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from 'react'
import { Popover, type PopoverPlacement } from './Popover'
import { useScrub } from './useScrub'
import styles from './FlyoutSliderField.module.css'

type Props = {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  defaultValue?: number
  disabled?: boolean
  className?: string
  placement?: PopoverPlacement
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Dense numeric control for tool options: an editable value with a slider
 * flyout. Its label remains a scrub handle to match other numeric fields.
 */
export function FlyoutSliderField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit,
  defaultValue,
  disabled = false,
  className,
  placement = 'below-start',
}: Props) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const commit = (next: number) => {
    const snapped = step > 0 ? Math.round(next / step) * step : next
    onChange(clamp(Math.round(snapped * 1000) / 1000, min, max))
  }
  const scrub = useScrub({ value, step, min, max, onChange: commit })

  const onLabelPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (disabled) return
    if (event.altKey && defaultValue != null) {
      event.preventDefault()
      commit(defaultValue)
      return
    }
    scrub.onPointerDown(event)
  }

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return
    const next = Number(raw)
    if (Number.isFinite(next)) commit(next)
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
        type="number"
        className={styles.value}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={`${label} value`}
        onFocus={(event) => event.currentTarget.select()}
        onChange={onInputChange}
      />
      {unit && <span className={styles.unit}>{unit}</span>}
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        disabled={disabled}
        aria-label={`Adjust ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">▾</span>
      </button>
      <Popover
        open={open}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        placement={placement}
        width={208}
        ariaLabel={`Adjust ${label}`}
      >
        <div className={styles.flyout}>
          <div className={styles.flyoutHeader}>
            <span>{label}</span>
            <label>
              <input
                type="number"
                value={value}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                aria-label={`${label} precise value`}
                onChange={onInputChange}
              />
              {unit && <span>{unit}</span>}
            </label>
          </div>
          <input
            type="range"
            className={styles.slider}
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            aria-label={label}
            onChange={(event) => commit(Number(event.target.value))}
          />
        </div>
      </Popover>
    </div>
  )
}
