import { describe, expect, test } from 'bun:test'
import {
  brushPressureFromPointerEvent,
  curveTransform,
  dabOpacityFromPressure,
  isPressureCurveKind,
  pressureChannelScale,
  pressureSizeScale,
} from './pointerPressure'

function pointerSample(pointerType: string, pressure: number) {
  return { pointerType, pressure } as Pick<PointerEvent, 'pointerType' | 'pressure'>
}

describe('brush pointer pressure', () => {
  test('keeps synthetic pen pressures while giving mouse a full-size fallback', () => {
    expect(brushPressureFromPointerEvent(pointerSample('pen', 0.1))).toBe(0.1)
    expect(brushPressureFromPointerEvent(pointerSample('pen', 0.5))).toBe(0.5)
    expect(brushPressureFromPointerEvent(pointerSample('pen', 1))).toBe(1)

    // Browser mouse events conventionally use 0 / 0.5, not physical pressure.
    expect(brushPressureFromPointerEvent(pointerSample('mouse', 0))).toBe(1)
    expect(brushPressureFromPointerEvent(pointerSample('mouse', 0.5))).toBe(1)
  })

  test('maps light, medium, and full pen samples to distinct dab sizes', () => {
    const light = pressureSizeScale(0.1, true)
    const medium = pressureSizeScale(0.5, true)
    const full = pressureSizeScale(1, true)

    expect(light).toBeLessThan(medium)
    expect(medium).toBeLessThan(full)
    expect(pressureSizeScale(0.1, false)).toBe(1)
    expect(pressureSizeScale(0.5, false)).toBe(1)
    expect(pressureSizeScale(1, false)).toBe(1)
  })

  test('curve presets stay monotonic and bounded', () => {
    for (const curve of ['linear', 'soft', 'hard'] as const) {
      expect(curveTransform(0, curve)).toBe(0)
      expect(curveTransform(1, curve)).toBe(1)
      expect(curveTransform(0.25, curve)).toBeLessThan(curveTransform(0.75, curve))
    }
    expect(curveTransform(0.5, 'soft')).toBeGreaterThan(curveTransform(0.5, 'hard'))
  })

  test('size channel keeps the shipped soft concave response by default', () => {
    expect(pressureChannelScale(0, 'size', true, 'soft')).toBeCloseTo(0.25)
    expect(pressureChannelScale(1, 'size', true, 'soft')).toBeCloseTo(1)
    expect(pressureChannelScale(0.25, 'size', true, 'soft')).toBeCloseTo(
      0.25 + 0.75 * Math.sqrt(0.25),
    )
  })

  test('flow channel defaults preserve the legacy linear half-to-full mapping', () => {
    expect(dabOpacityFromPressure(
      {
        flow: 1,
        pressureControlsOpacity: false,
        pressureControlsFlow: true,
        pressureOpacityCurve: 'linear',
        pressureFlowCurve: 'linear',
      },
      0,
    )).toBeCloseTo(0.5)
    expect(dabOpacityFromPressure(
      {
        flow: 1,
        pressureControlsOpacity: false,
        pressureControlsFlow: true,
        pressureOpacityCurve: 'linear',
        pressureFlowCurve: 'linear',
      },
      1,
    )).toBeCloseTo(1)
    expect(dabOpacityFromPressure(
      {
        flow: 0.8,
        pressureControlsOpacity: false,
        pressureControlsFlow: false,
        pressureOpacityCurve: 'linear',
        pressureFlowCurve: 'linear',
      },
      0.2,
    )).toBeCloseTo(0.8)
  })

  test('opacity channel scales from zero when enabled', () => {
    expect(pressureChannelScale(0, 'opacity', true, 'linear')).toBe(0)
    expect(pressureChannelScale(0.5, 'opacity', true, 'hard')).toBeCloseTo(0.25)
    expect(pressureChannelScale(0.5, 'opacity', false, 'hard')).toBe(1)
  })

  test('validates persisted curve kinds', () => {
    expect(isPressureCurveKind('soft')).toBe(true)
    expect(isPressureCurveKind('bogus')).toBe(false)
  })
})
