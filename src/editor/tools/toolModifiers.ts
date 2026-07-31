import { create } from 'zustand'

/** Canvas-relevant modifier state captured at input event time. */
export type ToolModifiers = {
  shift: boolean
  alt: boolean
  ctrl: boolean
  meta: boolean
}

export const NO_MODIFIERS: ToolModifiers = Object.freeze({
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
})

export function readModifiers(
  event: Pick<KeyboardEvent | MouseEvent | PointerEvent, 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'>,
): ToolModifiers {
  return {
    shift: event.shiftKey,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
  }
}

/** Compatibility adapter for older direct controller tests/callers. */
export function normalizeModifiers(
  mods: ToolModifiers | { shiftKey?: boolean; altKey?: boolean } = NO_MODIFIERS,
): ToolModifiers {
  if ('shift' in mods) {
    return {
      shift: mods.shift,
      alt: mods.alt,
      ctrl: mods.ctrl,
      meta: mods.meta,
    }
  }
  return {
    shift: mods.shiftKey ?? false,
    alt: mods.altKey ?? false,
    ctrl: false,
    meta: false,
  }
}

/** Live, user-facing description of a drag constraint. */
export const useToolModifierStatusStore = create<{
  activeConstraint: string | null
  setActiveConstraint: (activeConstraint: string | null) => void
}>((set) => ({
  activeConstraint: null,
  setActiveConstraint: (activeConstraint) => set({ activeConstraint }),
}))
