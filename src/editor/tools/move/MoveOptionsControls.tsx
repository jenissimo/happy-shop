import { Check, SelectionSlash } from '@phosphor-icons/react'
import { useEditorContext } from '../../state/EditorContext'
import { useSelectionStore } from '../../session/selectionStore'
import { IconButton } from '../../../ui/base/IconButton'
import { MODIFIER_GRAMMAR } from '../modifierGrammar'
import { useTransformStore } from './transformStore'
import styles from './MoveOptionsControls.module.css'

type CheckToggleProps = {
  label: string
  title: string
  checked: boolean
  onChange: (next: boolean) => void
}

function CheckToggle({ label, title, checked, onChange }: CheckToggleProps) {
  return (
    <button
      type="button"
      className={checked ? styles.checkOn : styles.check}
      title={title}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className={styles.box} aria-hidden>
        {checked ? <Check size={11} weight="bold" /> : null}
      </span>
      <span className={styles.checkLabel}>{label}</span>
    </button>
  )
}

/** Compact Move / Free Transform options for the tool options bar. */
export function MoveOptionsControls() {
  const { commands } = useEditorContext()
  const autoSelectLayer = useTransformStore((s) => s.autoSelectLayer)
  const setAutoSelectLayer = useTransformStore((s) => s.setAutoSelectLayer)
  const showTransformControls = useTransformStore((s) => s.showTransformControls)
  const setShowTransformControls = useTransformStore(
    (s) => s.setShowTransformControls,
  )
  const freeTransformSession = useTransformStore((s) => s.session)
  const canDeselect = useSelectionStore((s) => {
    if (s.mask && !s.mask.isEmpty()) return true
    return s.marquee != null && s.marquee.width >= 1 && s.marquee.height >= 1
  })

  const deselectCmd = commands.get('select.deselect')
  const deselectTitle = deselectCmd?.shortcut
    ? `Deselect (${deselectCmd.shortcut})`
    : 'Deselect'
  const moveModifiers = MODIFIER_GRAMMAR.find((row) => row.tool === 'Move')

  return (
    <div className={styles.bar} role="group" aria-label="Move options">
      <CheckToggle
        label="Auto-Select"
        title="Auto-Select Layer — click picks the topmost visible layer"
        checked={autoSelectLayer}
        onChange={setAutoSelectLayer}
      />
      <CheckToggle
        label="Show Transform Controls"
        title="Show Transform Controls — bounding box + handles on selection"
        checked={showTransformControls}
        onChange={setShowTransformControls}
      />
      <span className={styles.sep} aria-hidden />
      <IconButton
        icon={SelectionSlash}
        size={14}
        title={deselectTitle}
        disabled={!canDeselect}
        onClick={() => commands.run('select.deselect')}
      />
      {freeTransformSession ? (
        <span className={styles.badge} title="Enter commit · Esc cancel">
          Free Transform
        </span>
      ) : null}
      {moveModifiers ? (
        <span className={styles.hint} title="Canvas modifier grammar">
          Alt: {moveModifiers.alt}
        </span>
      ) : null}
    </div>
  )
}
