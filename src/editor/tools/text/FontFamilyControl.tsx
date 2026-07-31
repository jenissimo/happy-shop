import { useRef, useState } from 'react'
import type { GoogleFontSource } from '../../../core/document'
import { FontPicker } from './FontPicker'
import styles from './FontFamilyControl.module.css'

type Props = {
  value: string
  placeholder?: string
  documentScripts?: readonly string[]
  onFontChange: (fontFamily: string) => void
  onGoogleFontSelect: (fontFamily: string, fontSource: GoogleFontSource) => void
  buttonClassName?: string
  title?: string
}

function displayLabel(value: string, placeholder?: string): string {
  if (!value.trim()) return placeholder ?? 'Browse fonts…'
  return value.split(',')[0]!.trim()
}

/** Opens the shared FontPicker (Installed + Google Fonts tabs) from a compact trigger. */
export function FontFamilyControl({
  value,
  placeholder,
  documentScripts = [],
  onFontChange,
  onGoogleFontSelect,
  buttonClassName,
  title = 'Browse fonts…',
}: Props) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const label = displayLabel(value, placeholder)

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={buttonClassName ?? styles.button}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </button>
      <FontPicker
        open={open}
        anchorRef={anchorRef}
        value={value}
        documentScripts={documentScripts}
        onClose={() => setOpen(false)}
        onChange={onFontChange}
        onGoogleFontSelect={onGoogleFontSelect}
      />
    </>
  )
}
