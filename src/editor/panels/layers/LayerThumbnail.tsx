import { useEffect, useState } from 'react'
import type { LayerId } from '../../../core/document'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import {
  LAYER_THUMB_SIZE,
  layerThumbDirtyKey,
  resolveLayerThumbnailUrl,
} from './layerThumbnails'
import styles from './LayersPanel.module.css'

type Props = {
  layerId: string
  /** Fallback when the live document layer is missing (mock adapter). */
  fallbackSwatch?: string
}

/**
 * Async ~40×40 layer preview. Shows a checker placeholder while loading;
 * rebuilds when the dirty key changes (rasterEpoch / shape / text props).
 */
export function LayerThumbnail({ layerId, fallbackSwatch }: Props) {
  const layer = useEditorSessionStore(
    (s) => s.document.layers[layerId as LayerId],
  )
  const rasterEpoch = useEditorSessionStore((s) => s.rasterEpoch)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const dirtyKey = layer ? layerThumbDirtyKey(layer, rasterEpoch) : ''

  useEffect(() => {
    if (!layer || layer.type === 'group') {
      setUrl(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void resolveLayerThumbnailUrl(layer, rasterEpoch, LAYER_THUMB_SIZE).then(
      (next) => {
        if (cancelled) return
        setUrl(next)
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [layer, rasterEpoch, dirtyKey])

  if (!layer || layer.type === 'group') {
    return (
      <span
        className={styles.thumb}
        style={fallbackSwatch ? { background: fallbackSwatch } : undefined}
      />
    )
  }

  return (
    <span
      className={`${styles.thumb} ${styles.thumbPixel}${
        loading ? ` ${styles.thumbLoading}` : ''
      }`}
      title="Layer preview"
    >
      {url ? (
        <img className={styles.thumbImg} src={url} alt="" draggable={false} />
      ) : null}
    </span>
  )
}
