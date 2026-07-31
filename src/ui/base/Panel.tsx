import type { ReactNode } from 'react'
import styles from './Panel.module.css'

type Props = {
  title?: string
  headerRight?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export function Panel({
  title,
  headerRight,
  children,
  className,
  bodyClassName,
}: Props) {
  return (
    <div className={[styles.panel, className].filter(Boolean).join(' ')}>
      {(title || headerRight) && (
        <div className={styles.header}>
          <span>{title}</span>
          {headerRight}
        </div>
      )}
      <div className={[styles.body, bodyClassName].filter(Boolean).join(' ')}>
        {children}
      </div>
    </div>
  )
}
