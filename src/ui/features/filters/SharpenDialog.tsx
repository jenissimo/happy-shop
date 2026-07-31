import { useEffect, useState } from 'react'
import {
  applySharpen,
  canApplySharpen,
  MAX_SHARPEN_AMOUNT,
  MAX_SHARPEN_RADIUS,
} from '../../../editor/filters/sharpen'
import { Button } from '../../base/Button'
import { FloatingWindow } from '../../base/FloatingWindow'
import { NumericField } from '../../base/NumericField'
import { closeSharpenDialog, useSharpenDialogOpen } from './controller'
import styles from './SharpenDialog.module.css'

/** Filter → Sharpen — adds a live content-phase FX node. */
export function SharpenDialog() {
  const open = useSharpenDialogOpen()
  const [amount, setAmount] = useState(1)
  const [radius, setRadius] = useState(1)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (open) setApplying(false)
  }, [open])

  const handleApply = async () => {
    if (applying || amount <= 0 || radius <= 0 || !canApplySharpen()) return
    setApplying(true)
    try {
      const applied = await applySharpen(amount, radius)
      if (applied) closeSharpenDialog()
    } finally {
      setApplying(false)
    }
  }

  return (
    <FloatingWindow
      open={open}
      title="Sharpen"
      onClose={closeSharpenDialog}
      width={320}
      bare
    >
      <div className={styles.content}>
        <NumericField
          label="Amount"
          value={amount}
          min={0.1}
          max={MAX_SHARPEN_AMOUNT}
          step={0.1}
          onChange={setAmount}
        />
        <NumericField
          label="Radius"
          value={radius}
          min={0.1}
          max={MAX_SHARPEN_RADIUS}
          step={0.1}
          onChange={setRadius}
        />
        <p className={styles.note}>
          Adds a non-destructive sharpen effect to the active layer&apos;s FX stack.
        </p>
        <div className={styles.actions}>
          <Button onClick={closeSharpenDialog} disabled={applying}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleApply()}
            disabled={applying || amount <= 0 || radius <= 0 || !canApplySharpen()}
          >
            {applying ? 'Applying…' : 'OK'}
          </Button>
        </div>
      </div>
    </FloatingWindow>
  )
}
