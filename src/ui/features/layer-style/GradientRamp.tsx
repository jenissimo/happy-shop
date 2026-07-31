import { useMemo, useRef, useState } from 'react'
import type { Gradient, GradientStop } from '../../../core/document/layerEffectsSchema'
import { interpolateGradientStop } from '../../../core/gradient/gradientSampling'
import { ColorSwatchButton } from '../../base/ColorPicker'
import { PickerSurface } from '../../base/PickerSurface'
import styles from './PremiumPickers.module.css'

type Props = {
  gradient: Gradient
  disabled?: boolean
  onChange: (gradient: Gradient) => void
}

const PRESETS: ReadonlyArray<{ name: string; stops: GradientStop[] }> = [
  { name: 'Black → White', stops: [{ offset: 0, color: '#000000', opacity: 1 }, { offset: 1, color: '#ffffff', opacity: 1 }] },
  { name: 'FG → Transparent', stops: [{ offset: 0, color: '#000000', opacity: 1 }, { offset: 1, color: '#000000', opacity: 0 }] },
  { name: 'Ocean', stops: [{ offset: 0, color: '#073b7a', opacity: 1 }, { offset: 0.5, color: '#16c4d4', opacity: 1 }, { offset: 1, color: '#edf8ff', opacity: 1 }] },
  { name: 'Sunset', stops: [{ offset: 0, color: '#32105f', opacity: 1 }, { offset: 0.5, color: '#e84577', opacity: 1 }, { offset: 1, color: '#ffca58', opacity: 1 }] },
  { name: 'Forest', stops: [{ offset: 0, color: '#061f16', opacity: 1 }, { offset: 0.55, color: '#298a5f', opacity: 1 }, { offset: 1, color: '#d7dc80', opacity: 1 }] },
  { name: 'Chrome', stops: [{ offset: 0, color: '#101010', opacity: 1 }, { offset: 0.25, color: '#d8d8d8', opacity: 1 }, { offset: 0.5, color: '#555555', opacity: 1 }, { offset: 1, color: '#eeeeee', opacity: 1 }] },
  { name: 'Violet', stops: [{ offset: 0, color: '#310b5d', opacity: 1 }, { offset: 0.5, color: '#9d4edd', opacity: 1 }, { offset: 1, color: '#f0c7ff', opacity: 1 }] },
  { name: 'Fire', stops: [{ offset: 0, color: '#210000', opacity: 1 }, { offset: 0.45, color: '#cf2600', opacity: 1 }, { offset: 1, color: '#ffe27a', opacity: 1 }] },
]

function ordered(stops: readonly GradientStop[]): GradientStop[] {
  return [...stops].sort((a, b) => a.offset - b.offset)
}

function cssGradient(stops: readonly GradientStop[]): string {
  return `linear-gradient(90deg, ${ordered(stops).map((s) => `${s.color}${Math.round(s.opacity * 255).toString(16).padStart(2, '0')} ${s.offset * 100}%`).join(', ')})`
}

export function GradientRamp({ gradient, disabled = false, onChange }: Props) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const colorTriggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(0)
  const selectedStop = gradient.stops[selected] ?? gradient.stops[0]!
  const background = useMemo(() => cssGradient(gradient.stops), [gradient.stops])

  const update = (stops: GradientStop[]) => {
    onChange({ stops: ordered(stops) })
    setSelected(Math.min(selected, stops.length - 1))
  }
  const offsetAt = (event: React.PointerEvent<Element>) => {
    const rect = trackRef.current!.getBoundingClientRect()
    const raw = (event.clientX - rect.left) / rect.width
    return Math.max(0, Math.min(1, event.shiftKey ? Math.round(raw * 20) / 20 : raw))
  }
  const addStop = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || event.target !== trackRef.current) return
    const stop = interpolateGradientStop(gradient.stops, offsetAt(event))
    const stops = ordered([...gradient.stops, stop])
    onChange({ stops })
    setSelected(stops.indexOf(stop))
  }

  return (
    <div className={styles.pickerField}>
      <span className={styles.label}>Gradient</span>
      <button ref={anchorRef} type="button" className={styles.rampButton} disabled={disabled} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <span className={styles.rampPreview} style={{ backgroundImage: background }} />
      </button>
      <PickerSurface open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} title="Gradient" width={288} ariaLabel="Gradient editor">
        <div className={styles.popoverBody}>
          <div className={styles.rampTrack} ref={trackRef} style={{ backgroundImage: background }} onPointerDown={addStop}>
            {gradient.stops.map((stop, index) => (
              <button
                key={`${stop.offset}-${index}`}
                type="button"
                className={[styles.stopHandle, index === selected ? styles.stopHandleSelected : ''].filter(Boolean).join(' ')}
                style={{ left: `${stop.offset * 100}%` }}
                aria-label={`Gradient stop ${index + 1}`}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  setSelected(index)
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
                  const stops = [...gradient.stops]
                  stops[index] = { ...stop, offset: offsetAt(event) }
                  update(stops)
                }}
                onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                onDoubleClick={(event) => {
                  event.preventDefault()
                  colorTriggerRef.current?.click()
                }}
                onKeyDown={(event) => {
                  if ((event.key === 'Delete' || event.key === 'Backspace') && gradient.stops.length > 2) {
                    event.preventDefault()
                    update(gradient.stops.filter((_, i) => i !== index))
                  }
                }}
              />
            ))}
          </div>
          <div className={styles.stopEditor}>
            <ColorSwatchButton triggerRef={colorTriggerRef} value={selectedStop.color} alpha onOpen={() => setOpen(false)} onChange={(color) => {
              const stops = [...gradient.stops]
              stops[selected] = { ...selectedStop, color }
              update(stops)
            }} ariaLabel="Selected stop color" pickerTitle="Gradient stop color" />
            <label className={styles.stopNumber}>Position <input type="number" min="0" max="100" value={Math.round(selectedStop.offset * 100)} disabled={disabled} onChange={(event) => {
              const stops = [...gradient.stops]
              stops[selected] = { ...selectedStop, offset: Number(event.target.value) / 100 }
              update(stops)
            }} /></label>
            <button type="button" disabled={disabled || gradient.stops.length <= 2} onClick={() => update(gradient.stops.filter((_, i) => i !== selected))}>Remove</button>
          </div>
          <div className={styles.presetLabel}>Presets</div>
          <div className={styles.presetGrid} role="radiogroup" aria-label="Gradient presets">
            {PRESETS.map((preset) => <button key={preset.name} type="button" className={styles.gradientPreset} title={preset.name} aria-label={preset.name} style={{ backgroundImage: cssGradient(preset.stops) }} disabled={disabled} onClick={() => { onChange({ stops: structuredClone(preset.stops) }); setSelected(0) }} />)}
          </div>
        </div>
      </PickerSurface>
    </div>
  )
}
