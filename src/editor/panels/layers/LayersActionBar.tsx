import { useEffect, useRef, useState } from 'react'
import {
  CircleHalf,
  FilePlus,
  FolderSimplePlus,
  LinkSimple,
  Sparkle,
  SquareHalf,
  Trash,
} from '@phosphor-icons/react'
import type { CommandRegistry } from '../../../core/commands/registry'
import { IconButton } from '../../../ui/base/IconButton'
import styles from './LayersPanel.module.css'

const ADJUST_COMMANDS = [
  'image.adjust.brightnessContrast',
  'image.adjust.hueSaturation',
  'image.adjust.levels',
] as const

function commandTooltip(commands: CommandRegistry, id: string, fallback: string): string {
  const cmd = commands.get(id)
  if (!cmd) return fallback
  return cmd.shortcut ? `${cmd.title} (${cmd.shortcut})` : cmd.title
}

function isCommandDisabled(commands: CommandRegistry, id: string): boolean {
  const cmd = commands.get(id)
  return !cmd || !cmd.enabled()
}

type Props = {
  commands: CommandRegistry
}

/** Photoshop-like bottom strip: link / fx / mask / adjust / group / new / delete. */
export function LayersActionBar({ commands }: Props) {
  const [adjustOpen, setAdjustOpen] = useState(false)
  const adjustWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!adjustOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!adjustWrapRef.current?.contains(e.target as Node)) {
        setAdjustOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAdjustOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [adjustOpen])

  const run = (id: string) => {
    commands.run(id)
  }

  return (
    <div className={styles.actionBar} role="toolbar" aria-label="Layer actions">
      <IconButton
        icon={LinkSimple}
        size={14}
        className={styles.actionBtn}
        title="Coming soon"
        disabled
      />
      <IconButton
        icon={Sparkle}
        size={14}
        className={styles.actionBtn}
        title={commandTooltip(commands, 'layer.fx.open', 'Layer Style…')}
        disabled={isCommandDisabled(commands, 'layer.fx.open')}
        onClick={() => run('layer.fx.open')}
      />
      <IconButton
        icon={SquareHalf}
        size={14}
        className={styles.actionBtn}
        title={commandTooltip(commands, 'layer.mask.add', 'Reveal All')}
        disabled={isCommandDisabled(commands, 'layer.mask.add')}
        onClick={() => run('layer.mask.add')}
      />

      <div className={styles.adjustWrap} ref={adjustWrapRef}>
        <IconButton
          icon={CircleHalf}
          size={14}
          className={styles.actionBtn}
          title="Create new fill or adjustment layer"
          active={adjustOpen}
          onClick={() => setAdjustOpen((v) => !v)}
        />
        {adjustOpen ? (
          <div className={styles.adjustMenu} role="menu">
            {ADJUST_COMMANDS.map((id) => {
              const cmd = commands.get(id)
              const disabled = !cmd || !cmd.enabled()
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  className={styles.adjustItem}
                  disabled={disabled}
                  onClick={() => {
                    setAdjustOpen(false)
                    run(id)
                  }}
                >
                  {cmd?.title ?? id}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <IconButton
        icon={FolderSimplePlus}
        size={14}
        className={styles.actionBtn}
        title={commandTooltip(commands, 'layer.newGroup', 'New Group')}
        disabled={isCommandDisabled(commands, 'layer.newGroup')}
        onClick={() => run('layer.newGroup')}
      />
      <IconButton
        icon={FilePlus}
        size={14}
        className={styles.actionBtn}
        title={commandTooltip(commands, 'layer.new', 'New Layer')}
        disabled={isCommandDisabled(commands, 'layer.new')}
        onClick={() => run('layer.new')}
      />
      <IconButton
        icon={Trash}
        size={14}
        className={styles.actionBtn}
        title={commandTooltip(commands, 'layer.delete', 'Delete Layer')}
        disabled={isCommandDisabled(commands, 'layer.delete')}
        danger
        onClick={() => run('layer.delete')}
      />
    </div>
  )
}
