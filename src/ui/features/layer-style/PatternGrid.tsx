import { useEffect, useRef, useState } from 'react'
import type { PatternKind } from '../../../core/document'
import { PATTERN_KINDS, samplePattern } from '../../../rendering/effects/patterns'
import { AngleField } from '../../base/AngleField'
import { PickerSurface } from '../../base/PickerSurface'
import { SliderField } from '../../base/SliderField'
import styles from './PremiumPickers.module.css'

type Props = {
  pattern: PatternKind
  scale: number
  angle: number
  invert: boolean
  disabled?: boolean
  onChange: (patch: { pattern?: PatternKind; scale?: number; angle?: number; invert?: boolean }) => void
}

function PatternSwatch({
  kind,
  scale,
  angle,
  invert,
}: {
  kind: PatternKind
  scale: number
  angle: number
  invert: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const image = ctx.createImageData(canvas.width, canvas.height)
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const value = Math.round((0.15 + samplePattern(x, y, { kind, scale, angle, invert }) * 0.7) * 255)
        const i = (y * canvas.width + x) * 4
        image.data[i] = image.data[i + 1] = image.data[i + 2] = value
        image.data[i + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
  }, [kind, scale, angle, invert])
  return <canvas ref={ref} width={44} height={44} aria-hidden="true" />
}

export function PatternGrid({ pattern, scale, angle, invert, disabled = false, onChange }: Props) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.pickerField}>
      <span className={styles.label}>Pattern</span>
      <button ref={anchorRef} type="button" className={styles.patternButton} disabled={disabled} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <PatternSwatch kind={pattern} scale={scale} angle={angle} invert={invert} />
        <span>{pattern}</span>
      </button>
      <PickerSurface
        open={open}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        title="Pattern"
        width={264}
        ariaLabel="Pattern picker"
      >
        <div className={styles.popoverBody}>
          <div className={styles.patternGrid} role="radiogroup" aria-label="Procedural patterns">
            {PATTERN_KINDS.map((kind) => (
              <button key={kind} type="button" role="radio" aria-checked={pattern === kind} className={[styles.patternChip, pattern === kind ? styles.patternChipSelected : ''].filter(Boolean).join(' ')} disabled={disabled} onClick={() => onChange({ pattern: kind })}>
                <PatternSwatch kind={kind} scale={scale} angle={angle} invert={invert} />
                <span>{kind}</span>
              </button>
            ))}
          </div>
          <SliderField label="Scale" value={scale} min={1} max={1000} disabled={disabled} onChange={(value) => onChange({ scale: value })} />
          <AngleField label="Angle" value={angle} disabled={disabled} onChange={(value) => onChange({ angle: value })} />
          <label className={styles.invertRow}><input type="checkbox" checked={invert} disabled={disabled} onChange={(event) => onChange({ invert: event.target.checked })} /> Invert</label>
        </div>
      </PickerSurface>
    </div>
  )
}
