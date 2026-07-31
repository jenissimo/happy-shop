import {
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import styles from './AngleField.module.css'
import { useScrub } from './useScrub'

type Props = {
  label: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  className?: string
  unit?: string
  /** Alt-click the label or double-click the dial to restore this angle. */
  defaultValue?: number
}

/** Normalize to [0, 360). */
function normDeg(deg: number): number {
  const n = deg % 360
  return n < 0 ? n + 360 : n
}

/** Screen math: 0° = east, CCW (Photoshop Global Light convention). */
function angleFromPointer(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): number {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const dx = clientX - cx
  const dy = cy - clientY
  return normDeg((Math.atan2(dy, dx) * 180) / Math.PI)
}

export function AngleField({
  label,
  value,
  onChange,
  disabled = false,
  className,
  unit = '°',
  defaultValue = 0,
}: Props) {
  const dialRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const commit = (deg: number, snapTo15 = false) => {
    const rounded = Math.round(normDeg(deg))
    onChange(snapTo15 ? normDeg(Math.round(rounded / 15) * 15) : rounded)
  }
  const scrub = useScrub({ value, step: 1, onChange: commit })

  const onLabelPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (disabled) return
    if (e.altKey) {
      e.preventDefault()
      commit(defaultValue)
      return
    }
    scrub.onPointerDown(e)
  }

  const onDialPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return
    e.preventDefault()
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    commit(angleFromPointer(e.clientX, e.clientY, rect), e.shiftKey)
  }

  const onDialPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current || disabled) return
    const rect = e.currentTarget.getBoundingClientRect()
    commit(angleFromPointer(e.clientX, e.clientY, rect), e.shiftKey)
  }

  const onDialPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    if (raw === '' || raw === '-') return
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    commit(n)
  }

  const onDialKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      commit(value - (e.shiftKey ? 15 : 1))
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      commit(value + (e.shiftKey ? 15 : 1))
    }
  }

  // CSS rotate is clockwise from up; our needle is drawn pointing up at 0 rotate,
  // while angle 0° is east → rotate by (90 - angle).
  const needleRotate = 90 - normDeg(value)

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <span
        className={styles.label}
        onPointerDown={onLabelPointerDown}
        onPointerMove={scrub.onPointerMove}
        onPointerUp={scrub.onPointerUp}
        onPointerCancel={scrub.onPointerCancel}
        style={scrub.style}
        title="Drag to adjust · Alt-click to reset"
      >
        {label}
      </span>
      <div
        ref={dialRef}
        className={`${styles.dial}${disabled ? ` ${styles.dialDisabled}` : ''}`}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(normDeg(value))}
        aria-disabled={disabled || undefined}
        onPointerDown={onDialPointerDown}
        onPointerMove={onDialPointerMove}
        onPointerUp={onDialPointerUp}
        onPointerCancel={onDialPointerUp}
        onKeyDown={onDialKeyDown}
        onDoubleClick={() => !disabled && commit(defaultValue)}
      >
        <span
          className={styles.needle}
          style={{ transform: `rotate(${needleRotate}deg)` }}
        />
        <span className={styles.hub} />
      </div>
      <div>
        <input
          type="number"
          className={styles.input}
          value={Math.round(normDeg(value))}
          disabled={disabled}
          aria-label={`${label} degrees`}
          onChange={onInputChange}
        />
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
    </div>
  )
}
