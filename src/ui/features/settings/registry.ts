import type { SettingsSectionDef, SettingsSectionId } from './types'

const sections = new Map<SettingsSectionId, SettingsSectionDef>()

/** Register (or replace) a settings section. Call once from a section module. */
export function registerSettingsSection(def: SettingsSectionDef): void {
  sections.set(def.id, def)
}

export function getSettingsSection(
  id: SettingsSectionId,
): SettingsSectionDef | undefined {
  return sections.get(id)
}

/** Ordered list of registered sections. */
export function listSettingsSections(): SettingsSectionDef[] {
  return [...sections.values()].sort(
    (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.label.localeCompare(b.label),
  )
}

/** Test / hot-reload helper. */
export function clearSettingsSections(): void {
  sections.clear()
}
