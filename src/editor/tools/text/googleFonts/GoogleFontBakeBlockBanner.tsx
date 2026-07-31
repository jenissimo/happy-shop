import { Button } from '../../../../ui/base/Button'
import { useEditorSessionStore } from '../../../session/EditorSessionStore'
import { googleFontUnavailableMessage } from '../textRasterize'
import { useGoogleFontBakeBlockStore } from './googleFontBakeBlockStore'
import styles from '../../../shell/EditorShell.module.css'

/** Inline, non-scrim banner for Google Font bake hard-blocks with Retry. */
export function GoogleFontBakeBlockBanner() {
  const block = useGoogleFontBakeBlockStore((state) => state.block)
  const retry = useGoogleFontBakeBlockStore((state) => state.retry)
  const clear = useGoogleFontBakeBlockStore((state) => state.clear)
  const layer = useEditorSessionStore((state) =>
    block ? state.document.layers[block.layerId] : undefined,
  )

  if (!block) return null

  const textLayer = layer?.type === 'text' ? layer : undefined

  return (
    <div className={styles.conflict} role="alert" data-testid="google-font-bake-block-banner">
      <span>{googleFontUnavailableMessage(block.resolution)}</span>
      <div className={styles.conflictActions}>
        <Button onClick={clear}>Dismiss</Button>
        <Button
          variant="primary"
          disabled={block.retrying || !textLayer}
          onClick={() => void retry(textLayer)}
        >
          {block.retrying ? 'Retrying…' : 'Retry'}
        </Button>
      </div>
    </div>
  )
}
