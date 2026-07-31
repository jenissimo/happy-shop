import { useEffect, useState } from 'react'
import {
  applyGaussianBlur,
  canApplyGaussianBlur,
  MAX_GAUSSIAN_BLUR_RADIUS,
} from '../../../editor/filters/gaussianBlur'
import { Button } from '../../base/Button'
import { FloatingWindow } from '../../base/FloatingWindow'
import { NumericField } from '../../base/NumericField'
import {
  closeGaussianBlurDialog,
  useGaussianBlurDialogOpen,
} from './controller'
import styles from './GaussianBlurDialog.module.css'

/** P0 Filter → Blur → Gaussian Blur destructive dialog. */
export function GaussianBlurDialog() {
  const open = useGaussianBlurDialogOpen()
  const [radius, setRadius] = useState(5)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (open) setApplying(false)
  }, [open])

  const handleApply = async () => {
    if (applying || radius <= 0 || !canApplyGaussianBlur()) return
    setApplying(true)
    try {
      const applied = await applyGaussianBlur(radius)
      if (applied) closeGaussianBlurDialog()
    } finally {
      setApplying(false)
    }
  }

  return (
    <FloatingWindow
      open={open}
      title="Gaussian Blur"
      onClose={closeGaussianBlurDialog}
      width={320}
      bare
    >
      <div className={styles.content}>
        <NumericField
          label="Radius"
          value={radius}
          min={0.1}
          max={MAX_GAUSSIAN_BLUR_RADIUS}
          step={0.1}
          onChange={setRadius}
        />
        <span className={styles.unit}>pixels</span>
        <p className={styles.note}>
          Adds a non-destructive Gaussian Blur effect to the active layer&apos;s FX stack.
        </p>
        <div className={styles.actions}>
          <Button onClick={closeGaussianBlurDialog} disabled={applying}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => void handleApply()}
            disabled={applying || radius <= 0 || !canApplyGaussianBlur()}
          >
            {applying ? 'Applying…' : 'OK'}
          </Button>
        </div>
      </div>
    </FloatingWindow>
  )
}
