import type { ReactNode } from 'react'
import type { SettingsRowProps } from './types'
import styles from './SettingsRow.module.css'

export function SettingsSection({ children }: { children: ReactNode }) {
  return <div className={styles.section}>{children}</div>
}

export function SettingsHeading({ children }: { children: ReactNode }) {
  return <h3 className={styles.heading}>{children}</h3>
}

export function SettingsRow({ title, hint, children }: SettingsRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.meta}>
        <div className={styles.title}>{title}</div>
        {hint ? <div className={styles.hint}>{hint}</div> : null}
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  )
}
