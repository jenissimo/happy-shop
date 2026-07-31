import { useRef, useState } from 'react'
import type { CommandRegistry } from '../../core/commands/registry'
import {
  listBuiltinWorkspaceItems,
  listCustomWorkspaceItems,
  resolveActiveWorkspaceLabel,
  type SavedWorkspaceEntry,
} from '../../editor/shell/workspaceDropdownModel'
import type { WorkspaceLayoutId } from '../../editor/shell/defaultLayout'
import { Popover } from '../base/Popover'
import styles from './WorkspaceLayoutDropdown.module.css'

type Props = {
  commands: CommandRegistry
  activeCommandId: string | null
  customWorkspaces: readonly SavedWorkspaceEntry[]
  fallbackLayoutId?: WorkspaceLayoutId
}

/** Compact workspace picker for the title bar (PS-style, right-aligned). */
export function WorkspaceLayoutDropdown({
  commands,
  activeCommandId,
  customWorkspaces,
  fallbackLayoutId = 'essentials',
}: Props) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const builtins = listBuiltinWorkspaceItems()
  const customs = listCustomWorkspaceItems(customWorkspaces)
  const label = resolveActiveWorkspaceLabel(
    activeCommandId,
    builtins,
    customs,
    commands,
    fallbackLayoutId,
  )

  const runCommand = (commandId: string) => {
    commands.run(commandId)
    setOpen(false)
  }

  return (
    <div className={styles.root}>
      <button
        ref={anchorRef}
        type="button"
        className={styles.trigger}
        title="Workspace layout"
        aria-label={`Workspace: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.label}>{label}</span>
        <span className={styles.caret} aria-hidden>
          ▾
        </span>
      </button>
      <Popover
        open={open}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        placement="below-end"
        width={196}
        maxHeight={360}
        ariaLabel="Workspace layouts"
      >
        <div className={styles.menu} role="menu">
          {builtins.map((item) => {
            const cmd = commands.get(item.commandId)
            const checked = activeCommandId === item.commandId
            return (
              <button
                key={item.commandId}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                disabled={cmd ? !cmd.enabled() : true}
                onClick={() => runCommand(item.commandId)}
              >
                <span>{item.title}</span>
                <span className={styles.check} aria-hidden>
                  {checked ? '✓' : ''}
                </span>
              </button>
            )
          })}

          {customs.length > 0 ? (
            <>
              <hr className={styles.sep} />
              <div className={styles.sectionLabel}>Saved</div>
              {customs.map((item) => {
                const cmd = commands.get(item.commandId)
                const checked = activeCommandId === item.commandId
                return (
                  <button
                    key={item.commandId}
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    disabled={cmd ? !cmd.enabled() : true}
                    title={item.name}
                    onClick={() => runCommand(item.commandId)}
                  >
                    <span className={styles.label}>{item.name}</span>
                    <span className={styles.check} aria-hidden>
                      {checked ? '✓' : ''}
                    </span>
                  </button>
                )
              })}
            </>
          ) : null}

          <hr className={styles.sep} />
          <button
            type="button"
            role="menuitem"
            disabled={!commands.get('workspace.reset')?.enabled()}
            onClick={() => runCommand('workspace.reset')}
          >
            Reset Workspace
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!commands.get('workspace.saveCurrent')?.enabled()}
            onClick={() => runCommand('workspace.saveCurrent')}
          >
            Save Workspace…
          </button>
        </div>
      </Popover>
    </div>
  )
}
