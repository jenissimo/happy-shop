# Viewport (M1b)

`ViewportHost.tsx` is a self-contained Pixi viewport: canvas mount, trackpad
pan (two-finger scroll) and zoom (pinch / Mod+scroll), space/middle-drag pan,
resize observer, and a checkerboard + layers rendered through
`RenderDocumentView` / `PixiRenderBackend`. `EditorShell` mounts it as
the `viewport` dockview panel and feeds `documentView` from
`toRenderDocumentView(session.document)`.

## Mounting in `EditorShell`

`EditorShell` already registers a `ViewportView` that maps the session document
and mounts `ViewportHost`:

```tsx
import { ViewportHost } from '../viewport/ViewportHost'
import { toRenderDocumentView } from '../session/toRenderDocumentView'
import { useEditorSessionStore } from '../session/EditorSessionStore'

function ViewportView(_props: IDockviewPanelProps) {
  const document = useEditorSessionStore((s) => s.document)
  const documentView = useMemo(() => toRenderDocumentView(document), [document])
  return <ViewportHost documentView={documentView} />
}
```

`ViewportHost` still falls back to `createDemoDocumentView()` when
`documentView` is omitted (standalone smoke tests).

`toRenderDocumentView` (in `src/editor/session/`) builds the view from
`HappyDocument` + resolved `RasterSurfaceStore` assets. `ViewportHost` diffs
by `layer.id` on every `syncDocument` call, so re-renders are cheap as long as
unchanged layers keep the same `id`.

`RenderDocumentView` intentionally only supports flattened raster layers today
(SPEC's `GroupLayer`/`AdjustmentLayer` aren't represented yet).

## WebGL context-loss recovery (WS-HARDEN)

`PixiRenderBackend` listens for `webglcontextlost` / `webglcontextrestored`,
skips render while lost, and exposes `rebuildGpuResources()` to recreate owned
textures after restore. `ViewportHost` shows a non-modal top banner
(`data-testid="webgl-context-banner"`) and offers **Reload graphics** (hard
remount) if soft rebuild fails. Dev/E2E: `window.__happyShopViewport.simulateContextLoss()`.

## What's stubbed for later milestones

- `OverlayPass` (`src/rendering/pixi/OverlayPass.ts`) is an empty draw pass
  wired into the render loop (`overlayLayer`, camera-transformed just like the
  document). Tools (M3+) should extend `sync()` to draw selection/handles/
  guides instead of adding a second overlay container.
- `PixiRenderBackend.exportRegion` extracts straight from `contentLayer`
  (document-space, no checkerboard/camera); `exportFlattenedRegion` / PNG export
  use that path. Tiny GPU export smoke: `src/testing/gpuExport.smoke.test.ts`.
- `RendererPreference` already has `'webgpu-experimental'`; `PixiRenderBackend`
  passes `['webgpu', 'webgl']` to Pixi's `preference` so it falls back to WebGL
  automatically if WebGPU init fails. No settings UI wires this yet.
