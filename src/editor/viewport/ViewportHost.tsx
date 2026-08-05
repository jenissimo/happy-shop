import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { PixiRenderBackend } from '../../rendering/pixi/PixiRenderBackend'
import {
  dispatchSyntheticContextLoss,
  dispatchSyntheticContextRestored,
  initialContextLossUiState,
  reduceContextLossUi,
  type ContextLossUiState,
} from '../../rendering/pixi/contextLossRecovery'
import type { RenderDocumentView } from '../../rendering/contracts'
import { Button } from '../../ui/base/Button'
import {
  BRUSH_CURSOR_MODE_CHANGED_EVENT,
  readBrushCursorModePref,
  readPixelatedPreviewPref,
  VIEWPORT_PIXELATED_PREVIEW_CHANGED_EVENT,
} from '../../ui/features/settings/prefs'
import { useViewPreferencesStore } from './viewPreferencesStore'
import {
  ContextMenu,
  ctxCommand,
  ctxSep,
  type ContextMenuItem,
} from '../../ui/shell/ContextMenu'
import {
  BrushTipCursorOverlay,
  canPaintActiveTarget,
  hitTestHoverHandle,
  resolveViewportCursor,
} from '../cursors'
import { ToolInputRouter } from '../tools/ToolInputRouter'
import { NO_MODIFIERS, readModifiers } from '../tools/toolModifiers'
import { BrushContextMenu } from '../tools/brush/BrushContextMenu'
import { useBrushSettingsStore } from '../tools/brush/brushSettingsStore'
import { useRetouchSettingsStore } from '../tools/retouch/retouchSettingsStore'
import { isLiquifyTool } from '../tools/liquify/liquifyTools'
import type { HandleId } from '../tools/move/transformMath'
import { useTransformStore } from '../tools/move/transformStore'
import { TextEditorOverlay } from '../tools/text/TextEditorOverlay'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { useEditorContext } from '../state/EditorContext'
import { useTheme } from '../theme/ThemeProvider'
import { mapClientToViewport } from './mapClientToViewport'
import { bindViewportCamera } from './viewportCameraAccess'
import { useViewportZoomStore } from './viewportZoomStore'
import { useCursorStatusStore } from './cursorStatusStore'
import { ViewportCamera } from './ViewportCamera'
import { createDemoDocumentView } from './demoDocument'
import { useGuidesStore } from './guides'
import {
  pickTouchPair,
  resolveTouchNavigation,
  type TouchNavPoint,
} from './touchNavigation'
import { resolveWheelNavigation } from './wheelNavigation'
import {
  isViewportZoomShortcut,
  setViewportPointerAnchor,
  ZOOM_STEP,
} from './zoomActions'
import { isEditableEventTarget } from '../../lib/editableTarget'
import styles from './ViewportHost.module.css'

export interface ViewportHostProps {
  /** Falls back to a small built-in fixture until a real document is wired up. */
  documentView?: RenderDocumentView
}

const FIT_PADDING = 32

type PanState = { pointerId: number; lastX: number; lastY: number } | null
type GuideDragState = { id: string; axis: 'x' | 'y' } | null

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  )
}

/**
 * Mounts the Pixi canvas, drives the camera from wheel/pointer/touch input
 * (scroll = pan, pinch/Mod+scroll = zoom, two-finger touch = pan+pinch), and
 * keeps the backend in sync with `documentView`.
 */
export function ViewportHost({ documentView }: ViewportHostProps) {
  const { theme } = useTheme()
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const backendRef = useRef<PixiRenderBackend | null>(null)
  const persistedCamera = useEditorSessionStore((s) => s.cameraPrefs.camera)
  const fitOnLoad = useEditorSessionStore((s) => s.cameraPrefs.fitOnLoad)
  const cameraRef = useRef(new ViewportCamera(persistedCamera))
  const sizeRef = useRef({ width: 1, height: 1 })
  const hasFittedRef = useRef(false)
  const viewSizeRef = useRef({ width: 1, height: 1 })
  const panRef = useRef<PanState>(null)
  /** Active touch contacts in viewport screen CSS px (for two-finger nav). */
  const touchPointersRef = useRef(new Map<number, TouchNavPoint>())
  /** True while two or more touches are driving pan/pinch. */
  const touchNavActiveRef = useRef(false)
  /**
   * After a multi-touch gesture, ignore leftover single-touch until all
   * fingers lift — avoids accidental tool strokes on pinch end.
   */
  const touchNavSuppressToolsRef = useRef(false)
  const guideDragRef = useRef<GuideDragState>(null)
  const tipRingRef = useRef<HTMLDivElement>(null)
  const guideRef = useRef<SVGSVGElement>(null)
  const guideLightRef = useRef<SVGLineElement>(null)
  const guideDarkRef = useRef<SVGLineElement>(null)
  const pointerHostRef = useRef({ x: 0, y: 0 })
  const toolRouterRef = useRef(new ToolInputRouter())
  const demoViewRef = useRef<RenderDocumentView | null>(null)
  const viewRef = useRef<RenderDocumentView | null>(null)
  const [ready, setReady] = useState(false)
  const [cameraVersion, setCameraVersion] = useState(0)
  const [backendGeneration, setBackendGeneration] = useState(0)
  const [contextUi, setContextUi] = useState<ContextLossUiState>(
    initialContextLossUiState,
  )
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [shiftHeld, setShiftHeld] = useState(false)
  const [altHeld, setAltHeld] = useState(false)
  const [precisionHeld, setPrecisionHeld] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [isTouchNavigating, setIsTouchNavigating] = useState(false)
  const [pixelatedPreview, setPixelatedPreview] = useState(
    readPixelatedPreviewPref,
  )
  const [brushMenu, setBrushMenu] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [hoverHandle, setHoverHandle] = useState<Exclude<
    HandleId,
    'body'
  > | null>(null)
  const [hoverHandleRotationDeg, setHoverHandleRotationDeg] = useState(0)
  const [pointerInside, setPointerInside] = useState(false)
  const [brushCursorPreference, setBrushCursorPreference] = useState(
    readBrushCursorModePref,
  )
  const activeToolId = useEditorSessionStore((s) => s.activeToolId)
  const selectedLayerIds = useEditorSessionStore((s) => s.selectedLayerIds)
  const documentLayers = useEditorSessionStore((s) => s.document.layers)
  const brushSize = useBrushSettingsStore((s) => s.size)
  const brushHardness = useBrushSettingsStore((s) => s.hardness)
  const retouchSize = useRetouchSettingsStore((s) => s.size)
  const zoomPercent = useViewportZoomStore((s) => s.zoomPercent)
  const activeTransformHandle = useTransformStore((s) => s.activeHandle)
  const transformGesturing = useTransformStore((s) => s.gesturing)
  const { commands, showRulers } = useEditorContext()
  const guides = useGuidesStore((state) => state.guides)
  // View → Extras hides guides with the rest of the overlay group without
  // deleting them, so toggling Extras back on brings the same guides back.
  const extrasVisible = useViewPreferencesStore((state) => state.extrasVisible)

  // selectedLayerIds / documentLayers subscriptions invalidate paintability.
  void selectedLayerIds
  void documentLayers
  void zoomPercent
  const canPaint = canPaintActiveTarget()
  const retouchLike =
    activeToolId === 'cloneStamp' ||
    activeToolId === 'historyBrush' ||
    activeToolId === 'patternStamp' ||
    activeToolId === 'smudge' ||
    activeToolId === 'blur' ||
    activeToolId === 'sharpen' ||
    activeToolId === 'dodge' ||
    activeToolId === 'burn' ||
    activeToolId === 'sponge' ||
    activeToolId === 'spotHealing' ||
    activeToolId === 'healingBrush' ||
    isLiquifyTool(activeToolId)
  const effectiveHandle =
    transformGesturing &&
    activeTransformHandle &&
    activeTransformHandle !== 'body'
      ? activeTransformHandle
      : hoverHandle
  const cursor = resolveViewportCursor({
    activeToolId,
    overCanvas: true,
    spaceHeld,
    isPanning: isPanning || isTouchNavigating,
    altHeld,
    precisionHeld,
    brushCursorPreference,
    zoom: cameraRef.current.getState().zoom,
    brushSizeDocPx: retouchLike ? retouchSize : brushSize,
    // Retouch strength is an effect blend amount, not tip edge hardness.
    brushHardness: retouchLike ? 1 : brushHardness,
    canPaint,
    hoverHandle: effectiveHandle,
    hoverHandleRotationDeg,
  })

  const updateCursorOverlays = useCallback(
    (x: number, y: number) => {
      const ring = tipRingRef.current
      if (ring && cursor.tipRing) {
        const size = cursor.tipRing.diameterPx
        ring.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`
      }

      const guide = guideRef.current
      const light = guideLightRef.current
      const dark = guideDarkRef.current
      const brushLike = activeToolId === 'brush' || activeToolId === 'eraser'
      const anchor =
        shiftHeld && brushLike && !isPanning && !isTouchNavigating && !altHeld
          ? toolRouterRef.current.brushAnchor
          : null
      if (!guide || !light || !dark || !anchor) {
        if (guide) guide.style.visibility = 'hidden'
        return
      }

      const start = cameraRef.current.documentToScreen(anchor)
      for (const line of [light, dark]) {
        line.setAttribute('x1', String(start.x))
        line.setAttribute('y1', String(start.y))
        line.setAttribute('x2', String(x))
        line.setAttribute('y2', String(y))
      }
      guide.style.visibility = 'visible'
    },
    [activeToolId, altHeld, cursor.tipRing, isPanning, isTouchNavigating, shiftHeld],
  )

  const hardReloadGraphics = useCallback(() => {
    setContextUi((s) => reduceContextLossUi(s, { type: 'recovering' }))
    setReady(false)
    setBackendGeneration((g) => g + 1)
  }, [])

  const pointerCtx = useCallback(() => {
    const host = hostRef.current
    if (!host) return null
    const { width, height } = sizeRef.current
    return {
      host,
      camera: cameraRef.current,
      viewportWidth: width,
      viewportHeight: height,
    }
  }, [])

  const refreshCamera = useCallback(() => setCameraVersion((version) => version + 1), [])

  const toTouchNavPoint = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): TouchNavPoint => {
    const host = event.currentTarget
    const { width, height } = sizeRef.current
    const screen = mapClientToViewport(
      event.clientX,
      event.clientY,
      host,
      width,
      height,
    )
    return { id: event.pointerId, x: screen.x, y: screen.y }
  }

  const endTouchNavigation = () => {
    if (!touchNavActiveRef.current) return
    touchNavActiveRef.current = false
    setIsTouchNavigating(false)
    touchNavSuppressToolsRef.current = true
  }

  const beginTouchNavigation = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (touchNavActiveRef.current) return
    touchNavActiveRef.current = true
    setIsTouchNavigating(true)
    touchNavSuppressToolsRef.current = true

    // Abort single-finger pan / in-progress tool so pinch owns the gesture.
    if (panRef.current) {
      panRef.current = null
      setIsPanning(false)
    }
    const ctx = pointerCtx()
    if (ctx) {
      const first = touchPointersRef.current.values().next().value
      if (first) {
        const synthetic = {
          ...event.nativeEvent,
          pointerId: first.id,
        } as PointerEvent
        void toolRouterRef.current.pointerUp(synthetic, ctx)
      }
      toolRouterRef.current.cancelSelectionGesture()
    }
  }

  const applyTouchNavigationMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): boolean => {
    const pointers = touchPointersRef.current
    if (event.pointerType !== 'touch' || !pointers.has(event.pointerId)) {
      return false
    }
    const prevPair = pickTouchPair(pointers)
    pointers.set(event.pointerId, toTouchNavPoint(event))
    if (!touchNavActiveRef.current) return false
    const nextPair = pickTouchPair(pointers)
    if (!prevPair || !nextPair) return true

    const action = resolveTouchNavigation(prevPair, nextPair)
    if (action.dx !== 0 || action.dy !== 0) {
      cameraRef.current.panBy(action.dx, action.dy)
    }
    if (action.factor !== 1) {
      cameraRef.current.zoomBy(action.factor, {
        x: action.anchorX,
        y: action.anchorY,
      })
    }
    refreshCamera()
    return true
  }

  if (!documentView && !demoViewRef.current) {
    demoViewRef.current = createDemoDocumentView()
  }
  const view = documentView ?? demoViewRef.current!
  viewRef.current = view
  viewSizeRef.current = { width: view.width, height: view.height }

  // Expose camera to View zoom commands + status bar.
  useEffect(() => {
    return bindViewportCamera({
      camera: cameraRef.current,
      getViewportSize: () => sizeRef.current,
      getDocSize: () => viewSizeRef.current,
      notifyChanged: refreshCamera,
    })
  }, [refreshCamera])

  useEffect(() => {
    if (persistedCamera) cameraRef.current.setState(persistedCamera)
  }, [persistedCamera])

  useEffect(() => {
    const sync = () => setBrushCursorPreference(readBrushCursorModePref())
    window.addEventListener(BRUSH_CURSOR_MODE_CHANGED_EVENT, sync)
    return () =>
      window.removeEventListener(BRUSH_CURSOR_MODE_CHANGED_EVENT, sync)
  }, [])

  useEffect(() => {
    const sync = () => {
      const enabled = useViewPreferencesStore.getState().pixelatedPreview
      setPixelatedPreview(enabled)
      backendRef.current?.setPixelatedPreview(enabled)
    }
    window.addEventListener(VIEWPORT_PIXELATED_PREVIEW_CHANGED_EVENT, sync)
    return () =>
      window.removeEventListener(VIEWPORT_PIXELATED_PREVIEW_CHANGED_EVENT, sync)
  }, [])

  useEffect(() => {
    if (!pointerInside) return
    const { x, y } = pointerHostRef.current
    updateCursorOverlays(x, y)
  }, [pointerInside, updateCursorOverlays])

  // Mount / remount Pixi (generation bump = hard context-loss recovery).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let destroyed = false
    let rafHandle = 0
    let lastZoomPercent = -1
    const backend = new PixiRenderBackend()
    backendRef.current = backend

    const destroyOnce = () => {
      if (destroyed) return
      destroyed = true
      cancelAnimationFrame(rafHandle)
      backend.setContextListener(null)
      backend.destroy()
    }

    backend.setContextListener((event) => {
      if (destroyed) return
      if (event === 'lost') {
        setContextUi((s) => reduceContextLossUi(s, { type: 'lost' }))
        return
      }
      // Soft rebuild after browser restores the GL context.
      setContextUi((s) => reduceContextLossUi(s, { type: 'recovering' }))
      try {
        backend.rebuildGpuResources()
        const current = viewRef.current
        if (current) backend.syncDocument(current)
        setContextUi((s) => reduceContextLossUi(s, { type: 'restored' }))
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Graphics restore failed'
        setContextUi((s) => reduceContextLossUi(s, { type: 'failed', error: message }))
      }
    })

    // Dev/E2E: synthetic context-loss without WEBGL_lose_context.
    if (typeof window !== 'undefined') {
      window.__happyShopViewport = {
        simulateContextLoss: () => dispatchSyntheticContextLoss(canvas),
        simulateContextRestored: () => dispatchSyntheticContextRestored(canvas),
        reloadGraphics: () => hardReloadGraphics(),
      }
    }

    void backend
      .init(canvas, {
        preference: 'webgl',
        antialias: false,
        backgroundAlpha: 0,
        powerPreference: 'high-performance',
      })
      .then(() => {
        if (destroyed) return
        backend.setPixelatedPreview(readPixelatedPreviewPref())
        const current = viewRef.current
        if (current) backend.syncDocument(current)
        setReady(true)
        setContextUi((s) =>
          s.phase === 'recovering' || s.phase === 'failed' || s.phase === 'lost'
            ? reduceContextLossUi(s, { type: 'restored' })
            : s,
        )
        const tick = () => {
          rafHandle = requestAnimationFrame(tick)
          const { width, height } = sizeRef.current
          const camera = cameraRef.current.getState()
          backend.render({
            camera,
            viewportWidth: width,
            viewportHeight: height,
            devicePixelRatio: window.devicePixelRatio || 1,
          })
          const zoomPercent = Math.round(camera.zoom * 100)
          if (zoomPercent !== lastZoomPercent) {
            lastZoomPercent = zoomPercent
            useViewportZoomStore.getState().setZoomPercent(zoomPercent)
          }
        }
        tick()
      })
      .catch((err) => {
        if (destroyed) return
        const message =
          err instanceof Error ? err.message : 'Failed to initialize graphics'
        setContextUi((s) => reduceContextLossUi(s, { type: 'failed', error: message }))
      })

    return () => {
      if (typeof window !== 'undefined' && window.__happyShopViewport) {
        delete window.__happyShopViewport
      }
      backendRef.current = null
      destroyOnce()
    }
  }, [backendGeneration, hardReloadGraphics])

  // Track host CSS size (clientWidth/Height = padding box = canvas fill area).
  // Avoid ResizeObserver contentRect alone — it can disagree with the border-box
  // used by getBoundingClientRect in pointer mapping.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const syncSize = () => {
      sizeRef.current = {
        width: Math.max(1, host.clientWidth),
        height: Math.max(1, host.clientHeight),
      }
    }
    syncSize()
    const observer = new ResizeObserver(syncSize)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  // Push document changes to the backend once it's initialized.
  useEffect(() => {
    if (!ready) return
    backendRef.current?.syncDocument(view)
  }, [ready, view])

  // Transparency grid follows theme checker tokens (light vs dark).
  useEffect(() => {
    if (!ready) return
    backendRef.current?.invalidateCheckerboard()
  }, [ready, theme])

  // Fit new documents, but retain a validated restored camera on boot/HMR.
  useEffect(() => {
    if (!ready) return
    if (!fitOnLoad) return
    const { width, height } = sizeRef.current
    if (width <= 0 || height <= 0) return
    hasFittedRef.current = true
    cameraRef.current.fitToViewport(view.width, view.height, width, height, FIT_PADDING)
  }, [ready, view.id, view.width, view.height, fitOnLoad])

  // Wheel: plain scroll = pan; pinch / Mod+scroll = zoom toward cursor.
  // Native listener so preventDefault reliably stops page scroll.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const action = resolveWheelNavigation({
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      })
      if (action.type === 'pan') {
        cameraRef.current.panBy(action.dx, action.dy)
      } else {
        const { width, height } = sizeRef.current
        const anchor = mapClientToViewport(
          event.clientX,
          event.clientY,
          host,
          width,
          height,
        )
        cameraRef.current.zoomBy(action.factor, anchor)
      }
      refreshCamera()
    }
    host.addEventListener('wheel', handleWheel, { passive: false })
    return () => host.removeEventListener('wheel', handleWheel)
  }, [refreshCamera])

  // Space bar arms drag-to-pan (in addition to always-on middle-mouse pan).
  // Alt while brush/eraser = temp eyedropper cursor (sample on click in router).
  // Mod / Caps Lock = precision crosshair for brush/eraser.
  // Escape cancels polygonal lasso / Free Transform; Enter commits.
  useEffect(() => {
    const syncPrecision = (event: KeyboardEvent) => {
      const caps =
        typeof event.getModifierState === 'function' &&
        event.getModifierState('CapsLock')
      setPrecisionHeld(Boolean(event.ctrlKey || event.metaKey || caps))
    }
    const onKeyDown = (event: KeyboardEvent) => {
      syncPrecision(event)
      if (event.key === 'Shift' || event.key === 'Alt') {
        toolRouterRef.current.modifiersChanged(readModifiers(event))
      }
      if (event.key === 'Shift') setShiftHeld(true)
      if (isEditableTarget(event.target)) return
      if (event.code === 'Space') {
        setSpaceHeld(true)
        toolRouterRef.current.setSpaceHeld(true)
        return
      }
      if (event.key === 'Alt') {
        setAltHeld(true)
        return
      }
      if (event.key === 'Escape') {
        if (toolRouterRef.current.cancelTransformSession()) {
          event.preventDefault()
          return
        }
        toolRouterRef.current.cancelSelectionGesture()
        return
      }
      if (event.key === 'Enter') {
        if (toolRouterRef.current.commitSelectionGesture()) {
          event.preventDefault()
        }
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      syncPrecision(event)
      if (event.key === 'Shift' || event.key === 'Alt') {
        toolRouterRef.current.modifiersChanged(readModifiers(event))
      }
      if (event.key === 'Shift') setShiftHeld(false)
      if (event.code === 'Space') {
        setSpaceHeld(false)
        toolRouterRef.current.setSpaceHeld(false)
      }
      if (event.key === 'Alt') setAltHeld(false)
    }
    const onBlur = () => {
      setSpaceHeld(false)
      toolRouterRef.current.setSpaceHeld(false)
      setShiftHeld(false)
      setAltHeld(false)
      setPrecisionHeld(false)
      toolRouterRef.current.modifiersChanged(NO_MODIFIERS)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // Browser zoom hijacks Mod+`+`/`-`/`0` before any command can run, and the
  // command path only calls preventDefault when a command actually matched.
  // Capture-phase, so the page can never zoom while the viewport is mounted;
  // the shortcut itself is still dispatched by the command registry.
  useEffect(() => {
    const onZoomKeyCapture = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (isEditableEventTarget(event)) return
      if (!isViewportZoomShortcut(event)) return
      event.preventDefault()
    }
    window.addEventListener('keydown', onZoomKeyCapture, { capture: true })
    return () =>
      window.removeEventListener('keydown', onZoomKeyCapture, { capture: true })
  }, [])

  // Drop in-progress lasso / marquee preview when switching tools; commit FT.
  useEffect(() => {
    toolRouterRef.current.onToolChanged(activeToolId)
  }, [activeToolId])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      touchPointersRef.current.set(event.pointerId, toTouchNavPoint(event))
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* capture may fail if the pointer already ended */
      }
      if (touchPointersRef.current.size >= 2) {
        event.preventDefault()
        beginTouchNavigation(event)
        return
      }
      if (touchNavSuppressToolsRef.current) {
        event.preventDefault()
        return
      }
    }

    // Zoom tool: click zooms in, Alt+click zooms out — anchored on the cursor,
    // the same `camera.zoomBy` primitive the shortcuts and wheel use.
    if (event.button === 0 && activeToolId === 'zoom') {
      event.preventDefault()
      const { width, height } = sizeRef.current
      const anchor = mapClientToViewport(
        event.clientX,
        event.clientY,
        event.currentTarget,
        width,
        height,
      )
      cameraRef.current.zoomBy(event.altKey ? 1 / ZOOM_STEP : ZOOM_STEP, anchor)
      refreshCamera()
      return
    }

    const isMiddleButton = event.button === 1
    const isSpaceDrag = event.button === 0 && spaceHeld
    const isHandTool = event.button === 0 && activeToolId === 'hand'
    if (isMiddleButton || isSpaceDrag || isHandTool) {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      panRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      }
      setIsPanning(true)
      return
    }

    const ctx = pointerCtx()
    if (ctx) void toolRouterRef.current.pointerDown(event.nativeEvent, ctx)
  }

  const syncCursorHover = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    const host = event.currentTarget
    const rect = host.getBoundingClientRect()
    const { width, height } = sizeRef.current
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top
    // Map painted box → logical viewport (same as pointer tools).
    const sx = rect.width > 1e-6 ? width / rect.width : 1
    const sy = rect.height > 1e-6 ? height / rect.height : 1
    const x = localX * sx
    const y = localY * sy
    pointerHostRef.current = { x, y }
    // Keyboard / menu zoom anchors on the cursor, exactly like the Zoom tool.
    setViewportPointerAnchor({ x, y })
    if (!pointerInside) setPointerInside(true)
    updateCursorOverlays(x, y)

    if (isPanning || isTouchNavigating || spaceHeld) {
      if (hoverHandle) setHoverHandle(null)
      return
    }
    const zoom = cameraRef.current.getState().zoom
    const doc = cameraRef.current.screenToDocument({
      x,
      y,
    })
    useCursorStatusStore.getState().setDocCursor({ x: doc.x, y: doc.y })
    const hit = hitTestHoverHandle(doc.x, doc.y, zoom)
    const next = hit?.handle ?? null
    const nextRot = hit?.rotationDeg ?? 0
    if (next !== hoverHandle) setHoverHandle(next)
    if (nextRot !== hoverHandleRotationDeg) setHoverHandleRotationDeg(nextRot)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const guideDrag = guideDragRef.current
    if (guideDrag) {
      const ctx = pointerCtx()
      if (!ctx) return
      const doc = cameraRef.current.screenToDocument(
        mapClientToViewport(
          event.clientX,
          event.clientY,
          ctx.host,
          ctx.viewportWidth,
          ctx.viewportHeight,
        ),
      )
      useGuidesStore.getState().moveGuide(
        guideDrag.id,
        Math.round(guideDrag.axis === 'x' ? doc.x : doc.y),
      )
      return
    }
    if (applyTouchNavigationMove(event)) {
      syncCursorHover(event)
      return
    }
    syncCursorHover(event)
    const pan = panRef.current
    if (pan && pan.pointerId === event.pointerId) {
      const host = event.currentTarget
      const rect = host.getBoundingClientRect()
      const { width, height } = sizeRef.current
      const sx = rect.width > 1e-6 ? width / rect.width : 1
      const sy = rect.height > 1e-6 ? height / rect.height : 1
      const dx = (event.clientX - pan.lastX) * sx
      const dy = (event.clientY - pan.lastY) * sy
      pan.lastX = event.clientX
      pan.lastY = event.clientY
      cameraRef.current.panBy(dx, dy)
      refreshCamera()
      return
    }
    if (touchNavSuppressToolsRef.current && event.pointerType === 'touch') {
      return
    }
    const ctx = pointerCtx()
    if (ctx) void toolRouterRef.current.pointerMove(event.nativeEvent, ctx)
  }

  const onContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (event.altKey && (activeToolId === 'brush' || activeToolId === 'eraser' || activeToolId === 'pencil')) return
    if (activeToolId === 'brush' || activeToolId === 'eraser') {
      setCanvasMenu(null)
      setBrushMenu({ x: event.clientX, y: event.clientY })
      return
    }
    setBrushMenu(null)
    setCanvasMenu({ x: event.clientX, y: event.clientY })
  }

  const canvasMenuItems = (): ContextMenuItem[] => [
    ctxCommand(commands, 'select.deselect'),
    ctxSep(),
    ctxCommand(commands, 'edit.fill'),
    ctxCommand(commands, 'edit.clear'),
    ctxSep(),
    ctxCommand(commands, 'edit.copy'),
    ctxCommand(commands, 'edit.paste'),
  ]

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (guideDragRef.current) {
      guideDragRef.current = null
      return
    }

    if (event.pointerType === 'touch') {
      const wasTracked = touchPointersRef.current.delete(event.pointerId)
      const wasNavigating = touchNavActiveRef.current
      const wasSuppressing = touchNavSuppressToolsRef.current
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* pointer already released */
      }
      if (touchPointersRef.current.size < 2) {
        endTouchNavigation()
      }
      if (touchPointersRef.current.size === 0) {
        touchNavSuppressToolsRef.current = false
      }
      // Multi-touch owned the gesture — don't forward leftover ups to tools.
      if (
        wasTracked &&
        (wasNavigating || wasSuppressing || touchNavActiveRef.current)
      ) {
        return
      }
    }

    const pan = panRef.current
    if (pan && pan.pointerId === event.pointerId) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* pointer already released */
      }
      panRef.current = null
      setIsPanning(false)
      return
    }
    if (touchNavSuppressToolsRef.current && event.pointerType === 'touch') {
      return
    }
    const ctx = pointerCtx()
    if (ctx) {
      void toolRouterRef.current
        .pointerUp(event.nativeEvent, ctx)
        .finally(() => {
          const { x, y } = pointerHostRef.current
          updateCursorOverlays(x, y)
        })
    }
  }

  const beginGuideDrag = (
    axis: 'x' | 'y',
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const host = hostRef.current
    if (!host) return
    const doc = cameraRef.current.screenToDocument(
      mapClientToViewport(
        event.clientX,
        event.clientY,
        host,
        sizeRef.current.width,
        sizeRef.current.height,
      ),
    )
    const id = useGuidesStore.getState().addGuide(
      axis,
      Math.round(axis === 'x' ? doc.x : doc.y),
    )
    guideDragRef.current = { id, axis }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const rulerMarks = (axis: 'x' | 'y') => {
    const camera = cameraRef.current
    const zoom = camera.getState().zoom
    const max = axis === 'x' ? view.width : view.height
    const desiredStep = 80 / Math.max(zoom, 0.02)
    const power = 10 ** Math.floor(Math.log10(desiredStep))
    const normalized = desiredStep / power
    const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power
    const result: Array<{ value: number; screen: number }> = []
    for (let value = 0; value <= max; value += step) {
      const screen = camera.documentToScreen(axis === 'x' ? { x: value, y: 0 } : { x: 0, y: value })
      result.push({ value, screen: axis === 'x' ? screen.x : screen.y })
    }
    return result
  }

  // Keep the document edge in DOM chrome rather than baking it into pixels.
  // It tracks the same camera as Pixi and makes the editable surface legible
  // on every workspace/theme without affecting exports or hit testing.
  const camera = cameraRef.current.getState()
  const documentFrameStyle = {
    left: camera.offsetX,
    top: camera.offsetY,
    width: view.width * camera.zoom,
    height: view.height * camera.zoom,
  }
  void cameraVersion

  return (
    <div
      ref={hostRef}
      className={styles.root}
      data-testid="viewport-host"
      data-cursor={cursor.id}
      style={{ cursor: cursor.css }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onPointerLeave={() => {
        setPointerInside(false)
        setViewportPointerAnchor(null)
        useCursorStatusStore.getState().setDocCursor(null)
        if (guideRef.current) guideRef.current.style.visibility = 'hidden'
        setHoverHandle(null)
      }}
      onContextMenu={onContextMenu}
    >
      <canvas
        ref={canvasRef}
        className={`${styles.canvas}${pixelatedPreview ? ` ${styles.canvasPixelated}` : ''}`}
      />
      <div
        className={styles.documentFrame}
        style={documentFrameStyle}
        aria-hidden
      />
      {showRulers ? (
        <>
          <div className={styles.rulerCorner} aria-hidden />
          <div
            className={styles.rulerHorizontal}
            data-testid="ruler-horizontal"
            role="presentation"
            title="Drag to add a horizontal guide"
            onPointerDown={(event) => beginGuideDrag('y', event)}
          >
            {rulerMarks('x').map(({ value, screen }) => (
              <span key={value} className={styles.rulerTick} style={{ left: screen }}>
                {Math.round(value)}
              </span>
            ))}
          </div>
          <div
            className={styles.rulerVertical}
            data-testid="ruler-vertical"
            role="presentation"
            title="Drag to add a vertical guide"
            onPointerDown={(event) => beginGuideDrag('x', event)}
          >
            {rulerMarks('y').map(({ value, screen }) => (
              <span key={value} className={styles.rulerTick} style={{ top: screen }}>
                {Math.round(value)}
              </span>
            ))}
          </div>
          {(extrasVisible ? guides : []).map((guide) => {
            const screen = cameraRef.current.documentToScreen(
              guide.axis === 'x' ? { x: guide.pos, y: 0 } : { x: 0, y: guide.pos },
            )
            return (
              <div
                key={guide.id}
                className={guide.axis === 'x' ? styles.verticalGuide : styles.horizontalGuide}
                data-testid={`guide-${guide.axis}`}
                style={guide.axis === 'x' ? { left: screen.x } : { top: screen.y }}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  guideDragRef.current = { id: guide.id, axis: guide.axis }
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
              />
            )
          })}
        </>
      ) : null}
      <svg
        ref={guideRef}
        className={styles.brushShiftGuide}
        aria-hidden
      >
        <line ref={guideLightRef} className={styles.brushShiftGuideLight} />
        <line ref={guideDarkRef} className={styles.brushShiftGuideDark} />
      </svg>
      {cursor.tipRing && pointerInside ? (
        <BrushTipCursorOverlay
          overlayRef={tipRingRef}
          ring={cursor.tipRing}
          x={pointerHostRef.current.x}
          y={pointerHostRef.current.y}
        />
      ) : null}
      {contextUi.phase !== 'ok' && contextUi.message ? (
        <div
          className={styles.contextBanner}
          role="status"
          aria-live="polite"
          data-testid="webgl-context-banner"
          data-phase={contextUi.phase}
        >
          <span className={styles.contextBannerMessage}>{contextUi.message}</span>
          {contextUi.phase === 'failed' || contextUi.phase === 'lost' ? (
            <div className={styles.contextBannerActions}>
              <Button variant="primary" onClick={hardReloadGraphics}>
                Reload graphics
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <TextEditorOverlay cameraRef={cameraRef} cameraVersion={cameraVersion} />
      {brushMenu ? (
        <BrushContextMenu
          x={brushMenu.x}
          y={brushMenu.y}
          onClose={() => setBrushMenu(null)}
        />
      ) : null}
      {canvasMenu ? (
        <ContextMenu
          x={canvasMenu.x}
          y={canvasMenu.y}
          items={canvasMenuItems()}
          onClose={() => setCanvasMenu(null)}
        />
      ) : null}
    </div>
  )
}

declare global {
  interface Window {
    __happyShopViewport?: {
      simulateContextLoss: () => void
      simulateContextRestored: () => void
      reloadGraphics: () => void
    }
  }
}
