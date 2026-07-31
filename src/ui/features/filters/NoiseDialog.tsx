import { useEffect, useState } from 'react'
import {
  applyNoise,
  canApplyNoise,
  MAX_NOISE_AMOUNT,
} from '../../../editor/filters/noise'
import { Button } from '../../base/Button'
import { FloatingWindow } from '../../base/FloatingWindow'
import { NumericField } from '../../base/NumericField'
import { closeNoiseDialog, useNoiseDialogOpen } from './controller'
import styles from './SharpenDialog.module.css'

/** Filter → Noise — adds a live content-phase FX node. */
export function NoiseDialog() {
  const open = useNoiseDialogOpen()
  const [amount, setAmount] = useState(0.12)
  const [distribution, setDistribution] = useState<'uniform' | 'gaussian'>('uniform')
  const [monochromatic, setMonochromatic] = useState(true)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (open) setApplying(false)
  }, [open])

  const handleApply = async () => {
    if (applying || amount <= 0 || !canApplyNoise()) return
    setApplying(true)
    try {
      const applied = await applyNoise(amount, distribution, monochromatic)
      if (applied) closeNoiseDialog()
    } finally {
      setApplying(false)
    }
  }

  return (
    <FloatingWindow
      open={open}
      title="Add Noise"
      onClose={closeNoiseDialog}
      width={320}
      bare
    >
      <div className={styles.content}>
        <NumericField
          label="Amount"
          value={Math.round(amount * 100)}
          min={0}
          max={Math.round(MAX_NOISE_AMOUNT * 100)}
          step={1}
          onChange={(v) => setAmount(v / 100)}
        />
        <label>
          Distribution{' '}
          <select
            value={distribution}
            onChange={(e) =>
              setDistribution(e.target.value as 'uniform' | 'gaussian')
            }
          >
            <option value="uniform">Uniform</option>
            <option value="gaussian">Gaussian</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={monochromatic}
            onChange={(e) => setMonochromatic(e.target.checked)}
          />{' '}
          Monochromatic
        </label>
        <p className={styles.note}>
          Adds a non-destructive noise effect to the active layer&apos;s FX stack.
        </p>
        <div className={styles.actions}>
          <Button onClick={closeNoiseDialog} disabled={applying}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleApply()}
            disabled={applying || amount <= 0 || !canApplyNoise()}
          >
            {applying ? 'Applying…' : 'OK'}
          </Button>
        </div>
      </div>
    </FloatingWindow>
  )
}
