import { describe, expect, test } from 'bun:test'
import {
  addEffectInstance,
  commitDraftEffects,
  createDefaultEffect,
  effectInstanceLabel,
  ensureStyleSlots,
} from './defaults'

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
