import { useRef, useState, type PointerEventHandler } from 'react'

export type ScrubOptions = {
  value: number
  step: number
  min?: number
  max?: number
  /** Pixels of pointer travel per step. Defaults to one. */
  pxPerStep?: number
  onChange: (next: number) => void
}

export type ScrubHandlers<T extends HTMLElement = HTMLElement> = {
  onPointerDown: PointerEventHandler<T>
  onPointerMove: PointerEventHandler<T>
  onPointerUp: PointerEventHandler<T>
  onPointerCancel: PointerEventHandler<T>
  style: { cursor: 'ew-resize' | undefined }
}

type ActiveScrub = {
  pointerId: number
  startX: number
  startValue: number
}

export function scrubModifierScale(shiftKey: boolean, altKey: boolean): number {
  if (shiftKey && altKey) return 0.01
  if (shiftKey) return 10
  if (altKey) return 0.1
  return 1
}

function clamp(value: number, min?: number, max?: number): number {
  let next = value
  if (min != null) next = Math.max(min, next)
  if (max != null) next = Math.min(max, next)
  return next
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** Calculates the value emitted by a scrub move without depending on the DOM. */
export function scrubValue(
  options: ScrubOptions,
  pointerTravel: number,
  modifiers: { shiftKey: boolean; altKey: boolean },
): number {
  const { value, step, pxPerStep = 1, min, max } = options
  const travel = pointerTravel / Math.max(pxPerStep, 0.0001)
  const raw = value + travel * step * scrubModifierScale(modifiers.shiftKey, modifiers.altKey)
  const snapped = step > 0 ? Math.round(raw / step) * step : raw
  return clamp(round(snapped), min, max)
}

/** Returns pointer handlers for a numeric scrub surface, usually its label. */
export function useScrub<T extends HTMLElement = HTMLElement>(
  options: ScrubOptions,
): ScrubHandlers<T> {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const activeRef = useRef<ActiveScrub | null>(null)
  const [armed, setArmed] = useState(false)

  const finish = (element: T, pointerId: number) => {
    if (activeRef.current?.pointerId !== pointerId) return
    activeRef.current = null
    setArmed(false)
    try {
      element.releasePointerCapture(pointerId)
    } catch {
      /* Capture may already have been released by the browser. */
    }
  }

  return {
    onPointerDown: (event) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      activeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startValue: optionsRef.current.value,
      }
      setArmed(true)
    },
    onPointerMove: (event) => {
      const active = activeRef.current
      if (!active || active.pointerId !== event.pointerId) return
      const current = optionsRef.current
      onChangeFromActive(current, active.startValue, event.clientX - active.startX, event)
    },
    onPointerUp: (event) => finish(event.currentTarget, event.pointerId),
    onPointerCancel: (event) => finish(event.currentTarget, event.pointerId),
    style: { cursor: armed ? 'ew-resize' : undefined },
  }
}

function onChangeFromActive(
  options: ScrubOptions,
  startValue: number,
  pointerTravel: number,
  event: { shiftKey: boolean; altKey: boolean },
) {
  const value = scrubValue(
    { ...options, value: startValue },
    pointerTravel,
    event,
  )
  options.onChange(value)
}
