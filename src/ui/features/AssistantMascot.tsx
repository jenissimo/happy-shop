import happyDog from '../../assets/happy_dog.gif'
import styles from './AssistantMascot.module.css'

export type AssistantMood =
  | 'idle'
  | 'thinking'
  | 'success'
  | 'error'
  | 'unconfigured'

type Props = {
  mood?: AssistantMood
  size?: number
  title?: string
  className?: string
}

/** Small pixel-art dog mascot for title bar and about dialog chrome. */
export function AssistantMascot({
  mood = 'idle',
  size = 18,
  title,
  className = '',
}: Props) {
  const classes = [styles.mascot, styles[`mood_${mood}`], className]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} title={title}>
      <img
        src={happyDog}
        alt=""
        width={size}
        height={size}
        draggable={false}
        aria-hidden
        style={{ width: size, height: size }}
      />
    </span>
  )
}
