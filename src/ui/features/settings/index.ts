export { SettingsWindow } from './SettingsWindow'
export { registerSettingsSection, listSettingsSections } from './registry'
export { registerDefaultSettingsSections } from './registerDefaultSections'
export type { SettingsSectionDef, SettingsSectionId } from './types'
export {
  SettingsRow,
  SettingsSection,
  SettingsHeading,
} from './SettingsRow'
export {
  VIEWPORT_PIXELATED_PREVIEW_KEY,
  readPixelatedPreviewPref,
  persistPixelatedPreviewPref,
} from './prefs'
