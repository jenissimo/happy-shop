import type { Icon } from '@phosphor-icons/react'
import type { PointerEventHandler } from 'react'
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
}: Props) {
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
    <button
      type="button"
      className={classes}
      title={title}
      aria-label={title}
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
    >
      <IconComp size={size} weight="regular" aria-hidden />
    </button>
  )
}
