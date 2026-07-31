import { useEffect, useRef, type ReactNode } from 'react'
import type { CommandRegistry } from '../../core/commands/registry'
import styles from './ContextMenu.module.css'

export type ContextMenuItem =
  | {
      kind?: 'item'
      id: string
      label: string
      shortcut?: string
      disabled?: boolean
      danger?: boolean
      run: () => void
    }
  | { kind: 'separator' }

type Props = {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onScroll = () => onClose()
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pad = 8
    let left = x
    let top = y
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad)
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad)
    }
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [x, y, items])

  return (
    <div
      ref={rootRef}
      className={styles.menu}
      style={{ left: x, top: y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.kind === 'separator') {
          return <div key={`sep-${i}`} className={styles.sep} role="separator" />
        }
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`${styles.item}${item.danger ? ` ${styles.danger}` : ''}`}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              item.run()
              onClose()
            }}
          >
            <span>{item.label}</span>
            {item.shortcut ? (
              <span className={styles.shortcut}>{item.shortcut}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function ctxSep(): ContextMenuItem {
  return { kind: 'separator' }
}

export function ctxItem(
  partial: Omit<Extract<ContextMenuItem, { run: () => void }>, 'kind'>,
): ContextMenuItem {
  return { kind: 'item', ...partial }
}

/** Menu row bound to a command id (label/enabled/shortcut from the registry). */
export function ctxCommand(
  commands: CommandRegistry,
  id: string,
  opts?: { label?: string; danger?: boolean },
): ContextMenuItem {
  const cmd = commands.get(id)
  return ctxItem({
    id,
    label: opts?.label ?? cmd?.title ?? id,
    shortcut: cmd?.shortcut,
    disabled: !cmd || !cmd.enabled(),
    danger: opts?.danger,
    run: () => {
      commands.run(id)
    },
  })
}

export function ContextMenuLayer({ children }: { children: ReactNode }) {
  return <div className={styles.layer}>{children}</div>
}
