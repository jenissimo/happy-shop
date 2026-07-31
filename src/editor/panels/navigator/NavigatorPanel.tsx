import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { getViewportCameraHandle } from '../../viewport/viewportCameraAccess'
import { useViewportZoomStore } from '../../viewport/viewportZoomStore'
import {
  buildNavigatorPreview,
  type NavigatorPreview,
} from './buildNavigatorPreview'
import styles from './NavigatorPanel.module.css'

type PreviewLayout = Omit<NavigatorPreview, 'bitmap'>

type ViewportOverlay = {
  left: number
  top: number
  width: number
  height: number
}

type DragState = {
  pointerId: number
  lastX: number
  lastY: number
}

function computeViewportOverlay(
  preview: PreviewLayout,
  displayScale: number,
): ViewportOverlay | null {
  const handle = getViewportCameraHandle()
  if (!handle) return null
  const { zoom, offsetX, offsetY } = handle.camera.getState()
  if (zoom <= 0) return null
  const { width: vpW, height: vpH } = handle.getViewportSize()

  const docLeft = -offsetX / zoom
  const docTop = -offsetY / zoom
  const docRight = (vpW - offsetX) / zoom
  const docBottom = (vpH - offsetY) / zoom

  const s = preview.scale * displayScale
  const left = (preview.padX + docLeft * preview.scale) * displayScale
  const top = (preview.padY + docTop * preview.scale) * displayScale
  const width = Math.max(2, (docRight - docLeft) * s)
  const height = Math.max(2, (docBottom - docTop) * s)

  return { left, top, width, height }
}

function panCameraByDocDelta(dxDoc: number, dyDoc: number): void {
  const handle = getViewportCameraHandle()
  if (!handle) return
  const zoom = handle.camera.getState().zoom
  handle.camera.panBy(-dxDoc * zoom, -dyDoc * zoom)
}

function centerCameraOnDocPoint(docX: number, docY: number): void {
  const handle = getViewportCameraHandle()
  if (!handle) return
  const { zoom } = handle.camera.getState()
  const { width: vpW, height: vpH } = handle.getViewportSize()
  handle.camera.setState({
    offsetX: vpW / 2 - docX * zoom,
    offsetY: vpH / 2 - docY * zoom,
  })
}

async function previewToObjectUrl(preview: NavigatorPreview): Promise<string | null> {
  const canvas = globalThis.document.createElement('canvas')
  canvas.width = preview.previewWidth
  canvas.height = preview.previewHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(preview.bitmap, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  )
  if (!blob) return null
  return URL.createObjectURL(blob)
}

export function NavigatorPanel() {
  const happyDoc = useEditorSessionStore((s) => s.document)
  const rasterEpoch = useEditorSessionStore((s) => s.rasterEpoch)
  const zoomPercent = useViewportZoomStore((s) => s.zoomPercent)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewMeta, setPreviewMeta] = useState<PreviewLayout | null>(null)
  const [overlay, setOverlay] = useState<ViewportOverlay | null>(null)
  const [displayScale, setDisplayScale] = useState(1)

  const wrapRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const previewRef = useRef<PreviewLayout | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const urlRef = useRef<string | null>(null)
  const genRef = useRef(0)

  useEffect(() => {
    const gen = ++genRef.current
    let cancelled = false
    void buildNavigatorPreview(happyDoc).then(async (preview) => {
      if (cancelled || gen !== genRef.current || !preview) return
      try {
        const url = await previewToObjectUrl(preview)
        if (cancelled || gen !== genRef.current || !url) return
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = url
        const layout: PreviewLayout = {
          scale: preview.scale,
          padX: preview.padX,
          padY: preview.padY,
          previewWidth: preview.previewWidth,
          previewHeight: preview.previewHeight,
          docWidth: preview.docWidth,
          docHeight: preview.docHeight,
        }
        previewRef.current = layout
        setPreviewMeta(layout)
        setPreviewUrl(url)
      } finally {
        preview.bitmap.close()
      }
    })
    return () => {
      cancelled = true
    }
  }, [happyDoc, rasterEpoch])

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  const refreshOverlay = useCallback(() => {
    const preview = previewRef.current
    if (!preview) {
      setOverlay(null)
      return
    }
    const img = imgRef.current
    const ds =
      img && preview.previewWidth > 0
        ? img.clientWidth / preview.previewWidth
        : 1
    setDisplayScale(ds)
    setOverlay(computeViewportOverlay(preview, ds))
  }, [])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      refreshOverlay()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [refreshOverlay, previewUrl])

  const clientToDoc = (clientX: number, clientY: number) => {
    const wrap = wrapRef.current
    const preview = previewRef.current
    if (!wrap || !preview) return null
    const rect = wrap.getBoundingClientRect()
    const ds =
      imgRef.current && preview.previewWidth > 0
        ? imgRef.current.clientWidth / preview.previewWidth
        : displayScale
    const localX = clientX - rect.left
    const localY = clientY - rect.top
    const previewX = localX / ds
    const previewY = localY / ds
    return {
      x: (previewX - preview.padX) / preview.scale,
      y: (previewY - preview.padY) / preview.scale,
      ds,
    }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const docPt = clientToDoc(e.clientX, e.clientY)
    if (!docPt) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
    }
    centerCameraOnDocPoint(docPt.x, docPt.y)
    refreshOverlay()
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const preview = previewRef.current
    if (!preview) return
    const ds =
      imgRef.current && preview.previewWidth > 0
        ? imgRef.current.clientWidth / preview.previewWidth
        : displayScale
    const dxPreview = e.clientX - drag.lastX
    const dyPreview = e.clientY - drag.lastY
    drag.lastX = e.clientX
    drag.lastY = e.clientY
    panCameraByDocDelta(
      dxPreview / (preview.scale * ds),
      dyPreview / (preview.scale * ds),
    )
    refreshOverlay()
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.meta}>
          {zoomPercent}%
          {previewMeta
            ? ` · ${previewMeta.docWidth}×${previewMeta.docHeight}`
            : ''}
        </span>
      </div>
      <div className={styles.stage}>
        {!previewUrl ? (
          <div className={styles.empty}>Building overview…</div>
        ) : (
          <div
            ref={wrapRef}
            className={styles.canvasWrap}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img
              ref={imgRef}
              className={styles.preview}
              src={previewUrl}
              alt="Document overview"
              draggable={false}
              onLoad={refreshOverlay}
            />
            {overlay ? (
              <div
                className={styles.viewportRect}
                style={{
                  left: overlay.left,
                  top: overlay.top,
                  width: overlay.width,
                  height: overlay.height,
                }}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
