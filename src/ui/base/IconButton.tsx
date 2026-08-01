import type { Icon } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type PointerEventHandler } from 'react'
import { Tooltip, tooltipShowDelayMs, type TooltipPlacement } from './Tooltip'
import styles from './IconButton.module.css'

type Size = 14 | 16 | 18 | 20 | 24

type Props = {
  icon: Icon
  title: string
  active?: boolean
  disabled?: boolean
  danger?: boolean
  onClick?: () => void
  onPointerDown?: PointerEventHandler<HTMLButtonElement>
  onPointerUp?: PointerEventHandler<HTMLButtonElement>
  onPointerCancel?: PointerEventHandler<HTMLButtonElement>
  onPointerLeave?: PointerEventHandler<HTMLButtonElement>
  size?: Size
  className?: string
  /** Where the fast tooltip appears. Defaults to below. */
  tooltipPlacement?: TooltipPlacement
  role?: string
}

export function IconButton({
  icon: IconComp,
  title,
  active = false,
  disabled = false,
  danger = false,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  size = 16,
  className,
  tooltipPlacement = 'bottom',
  role,
}: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const showTimer = useRef<number | null>(null)
  const [tipOpen, setTipOpen] = useState(false)

  const clearShowTimer = () => {
    if (showTimer.current === null) return
    window.clearTimeout(showTimer.current)
    showTimer.current = null
  }

  const hideTip = () => {
    clearShowTimer()
    setTipOpen(false)
  }

  const scheduleTip = () => {
    if (disabled) return
    clearShowTimer()
    const delay = tooltipShowDelayMs()
    if (delay === 0) {
      setTipOpen(true)
      return
    }
    showTimer.current = window.setTimeout(() => {
      showTimer.current = null
      setTipOpen(true)
    }, delay)
  }

  useEffect(() => () => clearShowTimer(), [])

  const classes = [
    styles.iconBtn,
    size >= 20 ? styles.large : '',
    active ? styles.active : '',
    disabled ? styles.disabled : '',
    danger ? styles.danger : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        role={role}
        className={classes}
        aria-label={title}
        aria-pressed={active || undefined}
        disabled={disabled}
        onClick={onClick}
        onPointerEnter={scheduleTip}
        onPointerDown={(event) => {
          hideTip()
          onPointerDown?.(event)
        }}
        onPointerUp={onPointerUp}
        onPointerCancel={(event) => {
          hideTip()
          onPointerCancel?.(event)
        }}
        onPointerLeave={(event) => {
          hideTip()
          onPointerLeave?.(event)
        }}
      >
        <IconComp size={size} weight="regular" aria-hidden />
      </button>
      <Tooltip
        label={title}
        open={tipOpen}
        anchorRef={buttonRef}
        placement={tooltipPlacement}
      />
    </>
  )
}
