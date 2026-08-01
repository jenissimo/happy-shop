import { DotsThree } from '@phosphor-icons/react'
import { useRef, useState, type ReactNode } from 'react'
import { Popover } from '../../ui/base/Popover'
import styles from './OptionsMore.module.css'

/** Secondary, tool-specific controls kept out of the always-visible options row. */
export function OptionsMore({
  label = 'More options',
  children,
}: {
  label?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={styles.trigger}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <DotsThree size={18} weight="bold" aria-hidden />
      </button>
      <Popover
        open={open}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        placement="below-end"
        width={280}
        ariaLabel={label}
      >
        <div className={styles.content}>{children}</div>
      </Popover>
    </>
  )
}
