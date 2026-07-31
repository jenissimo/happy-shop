import { Monitor, PaintBrush, TextAa, Wrench } from '@phosphor-icons/react'
import { registerSettingsSection } from './registry'
import { AppearanceSection } from './sections/AppearanceSection'
import { EditorSection } from './sections/EditorSection'
import { ViewportSection } from './sections/ViewportSection'
import { ToolsSection } from './sections/ToolsSection'
import { TextSection } from './sections/TextSection'

let registered = false

/** Idempotent — safe to call from SettingsWindow mount. */
export function registerDefaultSettingsSections(): void {
  if (registered) return
  registered = true

  registerSettingsSection({
    id: 'appearance',
    label: 'Appearance',
    icon: PaintBrush,
    order: 10,
    Component: AppearanceSection,
  })

  registerSettingsSection({
    id: 'text',
    label: 'Text',
    icon: TextAa,
    order: 22,
    Component: TextSection,
  })

  registerSettingsSection({
    id: 'editor',
    label: 'Editor',
    icon: TextAa,
    order: 20,
    Component: EditorSection,
  })

  registerSettingsSection({
    id: 'tools',
    label: 'Tools',
    icon: Wrench,
    order: 25,
    Component: ToolsSection,
  })

  registerSettingsSection({
    id: 'viewport',
    label: 'Viewport',
    icon: Monitor,
    order: 30,
    Component: ViewportSection,
  })
}
