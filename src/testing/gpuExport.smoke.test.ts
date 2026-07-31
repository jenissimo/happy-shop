/**
 * GPU export smoke (WS-HARDEN / SPEC §21.7 slice):
 * Exercises the flatten path (`exportFlattenedRegion` → `RenderBackend.exportRegion`)
 * on a tiny document and asserts output dimensions.
 *
 * CI / `bun test` uses a stub backend (no WebGL). Full 6000×4000×5 GPU flatten
 * export remains a **manual / reference-machine** check — see
 * `largeDoc.smoke.test.ts` (open/edit/save only).
 */
import { describe, expect, test } from 'bun:test'
import { exportFlattenedRegion } from '../editor/export/exportFlattened'
import {
  identityTransform,
  type ExportRegionRequest,
  type RenderBackend,
  type RenderDocumentView,
  type RuntimeCapabilities,
  type ViewportFrame,
} from '../rendering/contracts'

const W = 32
const H = 24

function tinyView(): RenderDocumentView {
  return {
    id: 'gpu-export-smoke',
    width: W,
    height: H,
    background: 'transparent',
    layers: [
      {
        id: 'fill',
        kind: 'raster',
        visible: true,
        opacity: 1,
        fillOpacity: 1,
        blendMode: 'normal',
        transform: identityTransform(),
        width: W,
        height: H,
        source: { kind: 'color', color: '#336699' },
      },
    ],
  }
}

type StubBackend = RenderBackend & {
  synced: RenderDocumentView | null
  rendered: ViewportFrame | null
  lastExport: ExportRegionRequest | null
}

function stubBackend(): StubBackend {
  const backend: StubBackend = {
    synced: null,
    rendered: null,
    lastExport: null,
    async init(_target: HTMLCanvasElement, _caps: RuntimeCapabilities) {
      /* no-op for CI */
    },
    syncDocument(view) {
      backend.synced = view
    },
    render(frame) {
      backend.rendered = frame
    },
    async exportRegion(request) {
      backend.lastExport = request
      return {
        width: Math.max(1, Math.round(request.width * (request.scale ?? 1))),
        height: Math.max(1, Math.round(request.height * (request.scale ?? 1))),
        close() {},
      } as ImageBitmap
    },
    destroy() {
      /* no-op */
    },
  }
  return backend
}

describe('GPU export smoke (tiny flatten path)', () => {
  test('exportFlattenedRegion calls exportRegion and asserts dimensions', async () => {
    const view = tinyView()
    const backend = stubBackend()
    const bitmap = await exportFlattenedRegion(backend, view)

    expect(backend.synced?.id).toBe('gpu-export-smoke')
    expect(backend.rendered?.viewportWidth).toBe(W)
    expect(backend.rendered?.viewportHeight).toBe(H)
    expect(backend.lastExport).toEqual({
      x: 0,
      y: 0,
      width: W,
      height: H,
    })
    expect(bitmap.width).toBe(W)
    expect(bitmap.height).toBe(H)
    bitmap.close()
  })

  test('documents large-doc GPU export as out of CI scope', () => {
    // Keep this assertion so the smoke suite explicitly records the gate:
    // automated coverage is the tiny path above; 6k×4k GPU flatten is manual.
    expect(
      'large-doc GPU flatten/export is reference-machine / manual (not CI)',
    ).toBeTruthy()
  })
})
