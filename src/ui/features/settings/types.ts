import type { ComponentType, ReactNode } from 'react'
import type { Icon } from '@phosphor-icons/react'

/** Stable id for a settings sidebar section. */
export type SettingsSectionId = string

export type SettingsSectionDef = {
  id: SettingsSectionId
  label: string
  icon: Icon
  /** Lower sorts first. Default 100. */
  order?: number
  /** Section body. Mounted when the section is active. */
  Component: ComponentType
}

export type SettingsRowProps = {
  title: string
  hint?: ReactNode
  children: ReactNode
}
