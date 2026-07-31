import happyDog from '../../assets/happy_dog.gif'
import { Button } from '../base/Button'
import { FloatingWindow } from '../base/FloatingWindow'
import styles from './AboutWindow.module.css'

type Props = {
  open: boolean
  onClose: () => void
}

export function AboutWindow({ open, onClose }: Props) {
  return (
    <FloatingWindow open={open} title="About Happy Shop" onClose={onClose} width={420} bare>
      <div className={styles.content}>
        <div className={styles.heading}>
          <img
            className={styles.logo}
            src={happyDog}
            alt=""
            width={32}
            height={32}
            draggable={false}
            aria-hidden
          />
          <h3 className={styles.brand}>Happy Shop</h3>
        </div>
        <p className={styles.body}>
          Browser-based image editor: dockable panels, commands, undo history, Vite/Bun project
          bridge, PixiJS viewport, and non-destructive layer styles.
        </p>
        <div className={styles.actions}>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </FloatingWindow>
  )
}
