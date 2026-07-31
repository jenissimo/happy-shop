/**
 * Large-doc smoke (SPEC §21.7): 6000×4000 × 5 layers open/edit/save path.
 * Uses synthetic in-memory surfaces + bridge fs save (no GPU/CI WebGL required).
 *
 * Full flattened GPU export for this size remains a **manual / reference-machine**
 * check. Automated GPU export coverage is the tiny flatten path in
 * `gpuExport.smoke.test.ts` (WS-HARDEN).
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
  setTransform,
  type HappyDocument,
} from '../core/document'
import {
  openProjectDirectory,
  saveProject,
  stageAsset,
} from '../bridge/happyshopProject'
import { getRenderCoordinator } from '../editor/session/RenderCoordinator'
import { effectsPadding } from '../rendering/effects/filters/buildLayerFilters'
import type { RenderLayerEffect } from '../rendering/contracts/RenderDocumentView'

const W = 6000
const H = 4000
const LAYER_COUNT = 5

/** Minimal valid PNG (1×1) — asset staging does not need full-res bytes. */
const TINY_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
])

function buildLargeDoc(): HappyDocument {
  let doc = createEmptyDocument({
    name: 'large-smoke',
    width: W,
    height: H,
    background: 'transparent',
  })
  for (let i = 0; i < LAYER_COUNT; i++) {
    const layer = createRasterLayer({
      name: `Layer ${i + 1}`,
      pixels: asRasterAssetRef(`smoke-asset-${i}`),
      transform: {
        x: i * 10,
        y: i * 8,
      },
    })
    doc = addLayer(doc, layer)
  }
  return doc
}

describe('large document smoke 6000×4000 × 5', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
    dirs.length = 0
  })

  test('builds document and render view', () => {
    const doc = buildLargeDoc()
    expect(doc.canvas.width).toBe(W)
    expect(doc.canvas.height).toBe(H)
    expect(Object.keys(doc.layers).length).toBe(LAYER_COUNT + 1)

    const view = getRenderCoordinator().buildView(doc)
    expect(view.width).toBe(W)
    expect(view.height).toBe(H)
    expect(view.layers.length).toBe(LAYER_COUNT)
  })

  test('transform all layers without throw', () => {
    let doc = buildLargeDoc()
    const ids = Object.keys(doc.layers)
    for (const id of ids) {
      doc = setTransform(doc, id, {
        x: 100,
        y: 50,
        scaleX: 1.05,
        scaleY: 1.05,
        rotationDeg: 15,
      })
    }
    const view = getRenderCoordinator().buildView(doc)
    for (const layer of view.layers) {
      expect(layer.transform.rotationDeg).toBe(15)
      expect(layer.width).toBe(W)
      expect(layer.height).toBe(H)
    }
  })

  test('effect padding stays finite for shadow+stroke stack', () => {
    const effects: RenderLayerEffect[] = [
      {
        type: 'drop-shadow',
        enabled: true,
        blendMode: 'multiply',
        color: '#000000',
        opacity: 0.75,
        angle: 120,
        distance: 12,
        spread: 0,
        size: 24,
        contour: 'linear',
        noise: 0,
        layerKnocksOutDropShadow: true,
      },
      {
        type: 'stroke',
        enabled: true,
        blendMode: 'normal',
        color: '#ffffff',
        opacity: 1,
        size: 4,
        position: 'outside',
      },
    ]
    const pad = effectsPadding(effects)
    expect(Number.isFinite(pad)).toBe(true)
    expect(pad).toBeGreaterThan(0)
    expect(pad).toBeLessThan(10_000)
  })

  test('atomic save + stage 5 layer assets (edit → save path)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'happyshop-large-'))
    dirs.push(dir)
    const projectDir = join(dir, 'Large.happyshop')
    const opened = openProjectDirectory(projectDir)
    const firstRev = opened.manifest.revision

    let doc = buildLargeDoc()
    const ids = Object.keys(doc.layers)
    for (const id of ids) {
      doc = setTransform(doc, id, { x: 20, y: 30, rotationDeg: 5 })
    }

    for (let i = 0; i < LAYER_COUNT; i++) {
      stageAsset(`smoke-asset-${i}`, 'layer', TINY_PNG, {
        width: W,
        height: H,
        mimeType: 'image/png',
      })
    }

    const ok = saveProject({
      expectedRevision: firstRev,
      document: doc,
    })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return

    const manifest = JSON.parse(
      readFileSync(join(projectDir, 'manifest.json'), 'utf8'),
    ) as {
      revision: string
      document: {
        canvas: { width: number; height: number }
        layers: Record<string, { type: string }>
      }
      assets?: unknown
    }
    expect(manifest.revision).toBe(ok.revision)
    expect(manifest.document.canvas.width).toBe(W)
    expect(manifest.document.canvas.height).toBe(H)
    expect(Object.keys(manifest.document.layers).length).toBe(LAYER_COUNT + 1)

    // Manifest must stay JSON-safe (no Pixi/DOM handles) — §21.8 smoke.
    expect(JSON.stringify(manifest)).not.toMatch(/Pixi|WebGL|HTMLCanvas|Sprite/)

    for (let i = 0; i < LAYER_COUNT; i++) {
      const bytes = readFileSync(join(projectDir, 'layers', `smoke-asset-${i}.png`))
      expect(bytes[0]).toBe(0x89)
    }

    // Stale revision conflict still visible after large save.
    const conflict = saveProject({
      expectedRevision: firstRev,
      document: doc,
    })
    expect(conflict.ok).toBe(false)
    if (!conflict.ok) {
      expect(conflict.conflict).toBe(true)
    }
  })
})
