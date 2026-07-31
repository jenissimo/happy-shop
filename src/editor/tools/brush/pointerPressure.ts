/**
 * Tablet pressure sampling and curve mapping for brush/eraser dabs.
 *
 * Mouse PointerEvents conventionally report 0 (idle) or 0.5 (button down);
 * neither represents physical pressure, so mouse and touch paint at nominal
 * full strength (1). Pen events retain their native normalized 0–1 pressure.
 */

export type PressureCurveKind = 'linear' | 'soft' | 'hard'

export type PressureChannel = 'size' | 'opacity' | 'flow'

const PRESSURE_CURVES: PressureCurveKind[] = ['linear', 'soft', 'hard']

const CHANNEL_FLOOR: Record<PressureChannel, number> = {
  size: 0.25,
  opacity: 0,
  flow: 0.5,
}

export function isPressureCurveKind(value: unknown): value is PressureCurveKind {
  return typeof value === 'string' && (PRESSURE_CURVES as string[]).includes(value)
}

export function normalizePressure(pressure: number): number {
  return Number.isFinite(pressure) ? Math.max(0, Math.min(1, pressure)) : 1
}

export function brushPressureFromPointerEvent(
  event: Pick<PointerEvent, 'pointerType' | 'pressure'>,
): number {
  if (event.pointerType !== 'pen') return 1
  return normalizePressure(event.pressure)
}

/** Transform normalized pressure through a curve shape in 0..1. */
export function curveTransform(pressure: number, curve: PressureCurveKind): number {
  const p = normalizePressure(pressure)
  switch (curve) {
    case 'soft':
      return Math.sqrt(p)
    case 'hard':
      return p * p
    default:
      return p
  }
}

/**
 * Map tablet pressure to a 0..1 scale for a brush channel.
 * When disabled, returns 1 so mouse strokes use the selected slider values.
 */
export function pressureChannelScale(
  pressure: number,
  channel: PressureChannel,
  enabled: boolean,
  curve: PressureCurveKind,
): number {
  if (!enabled) return 1
  const floor = CHANNEL_FLOOR[channel]
  const t = curveTransform(pressure, curve)
  return floor + (1 - floor) * t
}

/** @deprecated Prefer pressureChannelScale('size', …). Kept for existing tests. */
export function pressureSizeScale(
  pressure: number,
  enabled: boolean,
  curve: PressureCurveKind = 'soft',
): number {
  return pressureChannelScale(pressure, 'size', enabled, curve)
}

/** Per-dab opacity passed to the stamp kernel (flow × optional pressure scales). */
export function dabOpacityFromPressure(
  settings: {
    flow: number
    pressureControlsOpacity: boolean
    pressureControlsFlow: boolean
    pressureOpacityCurve: PressureCurveKind
    pressureFlowCurve: PressureCurveKind
  },
  pressure: number,
): number {
  const flowScale = pressureChannelScale(
    pressure,
    'flow',
    settings.pressureControlsFlow,
    settings.pressureFlowCurve,
  )
  const opacityScale = pressureChannelScale(
    pressure,
    'opacity',
    settings.pressureControlsOpacity,
    settings.pressureOpacityCurve,
  )
  return settings.flow * flowScale * opacityScale
}
