import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

type Variant = 'default' | 'primary' | 'danger' | 'ghost'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  children: ReactNode
}

export function Button({
  variant = 'default',
  className,
  children,
  type = 'button',
  ...rest
}: Props) {
  const classes = [
    styles.button,
    variant === 'primary' ? styles.primary : '',
    variant === 'danger' ? styles.danger : '',
    variant === 'ghost' ? styles.ghost : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  )
}
