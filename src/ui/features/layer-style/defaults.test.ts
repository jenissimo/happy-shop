import { describe, expect, test } from 'bun:test'
import {
  addEffectInstance,
  commitDraftEffects,
  createDefaultEffect,
  effectInstanceLabel,
  ensureStyleSlots,
  GLOBAL_LIGHT_ANGLE,
  STYLE_EFFECT_ORDER,
} from './defaults'

/**
 * Photoshop-parity pin. These are the values PS 2025 shows on a freshly ticked
 * effect. Opacity is stored 0..1 and shown 0..100 — a `0.35` here is "35%".
 * Change only with evidence from the Photoshop dialog.
 */
describe('Photoshop default parity', () => {
  test('drop shadow', () => {
    const fx = createDefaultEffect('drop-shadow')
    expect(fx).toMatchObject({
      blendMode: 'multiply',
      color: '#000000',
      opacity: 0.35,
      angle: 90,
      useGlobalLight: true,
      distance: 3,
      spread: 0,
      size: 7,
      contour: 'linear',
      noise: 0,
      layerKnocksOutDropShadow: true,
    })
  })

  test('inner shadow', () => {
    expect(createDefaultEffect('inner-shadow')).toMatchObject({
      blendMode: 'multiply',
      color: '#000000',
      opacity: 0.35,
      angle: 90,
      useGlobalLight: true,
      distance: 3,
      choke: 0,
      size: 7,
      contour: 'linear',
      noise: 0,
    })
  })

  test('outer glow', () => {
    expect(createDefaultEffect('outer-glow')).toMatchObject({
      blendMode: 'screen',
      color: '#ffffff',
      opacity: 0.35,
      noise: 0,
      technique: 'softer',
      spread: 0,
      size: 7,
      contour: 'linear',
      range: 50,
      jitter: 0,
    })
  })

  test('inner glow', () => {
    expect(createDefaultEffect('inner-glow')).toMatchObject({
      blendMode: 'screen',
      color: '#ffffff',
      opacity: 0.35,
      noise: 0,
      technique: 'softer',
      source: 'edge',
      choke: 0,
      size: 7,
      contour: 'linear',
      range: 50,
      jitter: 0,
    })
  })

  test('bevel & emboss', () => {
    expect(createDefaultEffect('bevel-emboss')).toMatchObject({
      style: 'inner-bevel',
      technique: 'smooth',
      depth: 100,
      direction: 'up',
      size: 7,
      soften: 0,
      angle: 90,
      useGlobalLight: true,
      altitude: 30,
      glossContour: 'linear',
      highlightMode: 'screen',
      highlightColor: '#ffffff',
      highlightOpacity: 0.5,
      shadowMode: 'multiply',
      shadowColor: '#000000',
      shadowOpacity: 0.5,
      contour: { enabled: false, contour: 'linear', range: 50, antiAliased: false },
      texture: { enabled: false, scale: 100, depth: 100, invert: false, alignWithLayer: true },
    })
  })

  test('satin', () => {
    expect(createDefaultEffect('satin')).toMatchObject({
      blendMode: 'multiply',
      color: '#000000',
      opacity: 0.5,
      angle: 90,
      distance: 50,
      size: 80,
      invert: true,
    })
  })

  /**
   * The reported bug: at 100% PS replaces the layer colour outright; our old
   * 50% default tinted it instead. Colour sampled from the PS 2025 swatch.
   */
  test('color overlay is opaque mid grey on Normal', () => {
    expect(createDefaultEffect('color-overlay')).toMatchObject({
      blendMode: 'normal',
      color: '#818181',
      opacity: 1,
    })
  })

  test('gradient overlay', () => {
    expect(createDefaultEffect('gradient-overlay')).toMatchObject({
      blendMode: 'normal',
      opacity: 1,
      style: 'linear',
      angle: 90,
      scale: 100,
      reverse: false,
      alignWithLayer: true,
      offsetX: 0,
      offsetY: 0,
    })
  })

  test('pattern overlay', () => {
    expect(createDefaultEffect('pattern-overlay')).toMatchObject({
      blendMode: 'normal',
      opacity: 1,
      scale: 100,
      angle: 0,
      invert: false,
      linkWithLayer: true,
      offsetX: 0,
      offsetY: 0,
    })
  })

  test('stroke', () => {
    expect(createDefaultEffect('stroke')).toMatchObject({
      blendMode: 'normal',
      color: '#000000',
      opacity: 1,
      overprint: false,
      size: 1,
      position: 'inside',
      fillType: 'color',
    })
  })

  test('global light angle/altitude agree across effects', () => {
    const shadow = createDefaultEffect('drop-shadow')
    const inner = createDefaultEffect('inner-shadow')
    const bevel = createDefaultEffect('bevel-emboss')
    // Sourced from the constant, so moving Global Light cannot silently
    // desynchronise the three effects that share it.
    const angle = GLOBAL_LIGHT_ANGLE
    expect(angle).toBe(90)
    expect(shadow.type === 'drop-shadow' && shadow.angle).toBe(angle)
    expect(inner.type === 'inner-shadow' && inner.angle).toBe(angle)
    expect(bevel.type === 'bevel-emboss' && bevel.angle).toBe(angle)
    expect(bevel.type === 'bevel-emboss' && bevel.altitude).toBe(30)
  })

  test('opacities stay inside the 0..1 unit interval', () => {
    for (const type of STYLE_EFFECT_ORDER) {
      const fx = createDefaultEffect(type) as Record<string, unknown>
      for (const key of ['opacity', 'highlightOpacity', 'shadowOpacity']) {
        const value = fx[key]
        if (typeof value !== 'number') continue
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('layer style multi-instance stack', () => {
  test('ensureStyleSlots preserves multiple strokes and appends missing types', () => {
    const a = createDefaultEffect('stroke')
    const b = createDefaultEffect('stroke')
    b.enabled = true
    const draft = ensureStyleSlots([a, b])
    const strokes = draft.filter((e) => e.type === 'stroke')
    expect(strokes).toHaveLength(2)
    expect(strokes.map((e) => e.id)).toEqual([a.id, b.id])
    expect(draft.some((e) => e.type === 'drop-shadow')).toBe(true)
  })

  /** P0: open Layer Style (draft) + OK must not collapse multi-instance by type. */
  test('3 strokes survive ensureStyleSlots draft → commitDraftEffects (OK path)', () => {
    const strokes = [
      { ...createDefaultEffect('stroke'), enabled: true, size: 1 },
      { ...createDefaultEffect('stroke'), enabled: true, size: 2 },
      { ...createDefaultEffect('stroke'), enabled: true, size: 3 },
    ]
    const layerEffects = strokes
    const draft = ensureStyleSlots(layerEffects)
    expect(draft.filter((e) => e.type === 'stroke')).toHaveLength(3)
    expect(draft.filter((e) => e.type === 'stroke').map((e) => e.id)).toEqual(
      strokes.map((e) => e.id),
    )
    // Dialog still has PS checklist placeholders for missing singleton types.
    expect(draft.some((e) => e.type === 'drop-shadow' && !e.enabled)).toBe(true)

    const committed = commitDraftEffects(draft)
    expect(committed).toHaveLength(3)
    expect(committed.every((e) => e.type === 'stroke')).toBe(true)
    expect(committed.map((e) => e.id)).toEqual(strokes.map((e) => e.id))
    expect(
      committed.map((e) => (e.type === 'stroke' ? e.size : -1)),
    ).toEqual([1, 2, 3])
  })

  test('addEffectInstance inserts multipliable type at Adobe slot / after sibling', () => {
    const base = ensureStyleSlots([])
    const result = addEffectInstance(base, 'stroke')
    expect(result).not.toBeNull()
    const { next, created } = result!
    expect(created.type).toBe('stroke')
    expect(created.enabled).toBe(true)
    expect(next.filter((e) => e.type === 'stroke').length).toBe(2)
    // New stroke sits after the existing stroke sibling.
    const idxs = next
      .map((e, i) => (e.type === 'stroke' ? i : -1))
      .filter((i) => i >= 0)
    expect(idxs[1]).toBe(idxs[0]! + 1)
  })

  test('addEffectInstance refuses singleton already present (placeholder counts)', () => {
    const base = ensureStyleSlots([])
    expect(addEffectInstance(base, 'bevel-emboss')).toBeNull()
    expect(addEffectInstance(base, 'satin')).toBeNull()
    expect(addEffectInstance(base, 'outer-glow')).toBeNull()
  })

  test('effectInstanceLabel numbers duplicates', () => {
    const a = createDefaultEffect('stroke')
    const b = createDefaultEffect('stroke')
    const siblings = [a, b]
    expect(effectInstanceLabel(a, siblings)).toBe('Stroke')
    expect(effectInstanceLabel(b, siblings)).toBe('Stroke 2')
  })

  test('commitDraftEffects keeps enabled + multi disabled, drops sole placeholders', () => {
    const stroke = { ...createDefaultEffect('stroke'), enabled: true }
    const shadowOff = { ...createDefaultEffect('drop-shadow'), enabled: false }
    const stroke2Off = { ...createDefaultEffect('stroke'), enabled: false }
    const committed = commitDraftEffects([stroke, shadowOff, stroke2Off])
    expect(committed.some((e) => e.id === stroke.id)).toBe(true)
    expect(committed.some((e) => e.id === stroke2Off.id)).toBe(true)
    expect(committed.some((e) => e.id === shadowOff.id)).toBe(false)
  })
})
