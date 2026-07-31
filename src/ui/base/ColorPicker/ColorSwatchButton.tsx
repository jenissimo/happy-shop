import { useState, type RefObject } from 'react'
import { ColorPicker } from './ColorPicker'
import { formatHex, parseColor } from './colorMath'
import styles from './ColorPicker.module.css'

export type ColorSwatchButtonProps = {
  value: string
  onChange: (value: string) => void
  /** Show alpha in the picker. Default false. */
  alpha?: boolean
  disabled?: boolean
  title?: string
  ariaLabel?: string
  className?: string
  /** Visual size of the trigger chip. */
  size?: 'sm' | 'md' | 'chip'
  pickerTitle?: string
  /** Called before the non-modal picker opens (for popover handoff). */
  onOpen?: () => void
  triggerRef?: RefObject<HTMLButtonElement | null>
}

/**
 * Swatch button that opens the shared ColorPicker floating window.
 */
export function ColorSwatchButton({
  value,
  onChange,
  alpha = false,
  disabled = false,
  title,
  ariaLabel,
  className,
  size = 'md',
  pickerTitle,
  onOpen,
  triggerRef,
}: ColorSwatchButtonProps) {
  const [open, setOpen] = useState(false)
  const { rgb, a } = parseColor(value)
  const css = formatHex(rgb, a, true)

  const sizeClass =
    size === 'sm'
      ? styles.triggerSm
      : size === 'chip'
        ? styles.triggerChip
        : styles.triggerMd

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={[styles.trigger, sizeClass, className].filter(Boolean).join(' ')}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel ?? title ?? 'Color'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!disabled) {
            onOpen?.()
            setOpen(true)
          }
        }}
      >
        <span className={styles.triggerFill} style={{ background: css }} />
      </button>
      <ColorPicker
        open={open}
        value={value}
        alpha={alpha}
        title={pickerTitle}
        onChange={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
