import { describe, expect, test } from 'bun:test'
import { createEmptyDocument, createGroupLayer, createTextLayer } from './factories'
import { addLayer } from './operations'
import {
  CURRENT_SCHEMA_VERSION,
  LEGACY_SCHEMA_VERSION,
  SCHEMA_VERSION_2,
  SCHEMA_VERSION_3,
  SCHEMA_VERSION_5,
} from './schema'
import {
  openDocument,
  isReadOnlyOutcome,
  migrateV1ToV2,
  migrateV2ToV3,
  migrateV3ToV4,
  migrateV4ToV5,
  migrateV5ToV6,
} from './migration'

describe('openDocument', () => {
  test('opens a valid current-schema document', () => {
    const doc = createEmptyDocument()
    const outcome = openDocument(doc)
    expect(outcome.status).toBe('ok')
    expect(outcome.readOnly).toBe(false)
    expect(isReadOnlyOutcome(outcome)).toBe(false)
    if (outcome.status === 'ok') {
      expect(outcome.document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    }
  })

  test('repairs a legacy empty document with an initial layer on open', () => {
    const legacyEmpty = {
      ...createEmptyDocument(),
      rootChildren: [],
      layers: {},
    }
    const outcome = openDocument(legacyEmpty)

    expect(outcome.status).toBe('ok')
    if (outcome.status === 'ok') {
      expect(outcome.document.rootChildren).toHaveLength(1)
      expect(Object.keys(outcome.document.layers)).toHaveLength(1)
      expect(outcome.document.layers[outcome.document.rootChildren[0]!]?.type).toBe('raster')
    }
  })

  test('upgrades the former empty Layer 1 group repair to a raster', () => {
    const placeholder = createGroupLayer({ name: 'Layer 1' })
    const legacyPlaceholder = {
      ...createEmptyDocument(),
      rootChildren: [placeholder.id],
      layers: { [placeholder.id]: placeholder },
    }
    const outcome = openDocument(legacyPlaceholder)

    expect(outcome.status).toBe('ok')
    if (outcome.status === 'ok') {
      const layer = outcome.document.layers[placeholder.id]
      expect(layer?.type).toBe('raster')
      if (layer?.type === 'raster') expect(String(layer.pixels)).not.toBe('')
    }
  })

  test('migrates schemaVersion 1 to current', () => {
    const v1 = { ...createEmptyDocument(), schemaVersion: LEGACY_SCHEMA_VERSION }
    // Strip fillOpacity so it looks like a true v1 layer tree after re-tag.
    const layers: Record<string, unknown> = {}
    for (const [id, layer] of Object.entries(v1.layers)) {
      const { fillOpacity: _f, ...rest } = layer as Record<string, unknown>
      layers[id] = rest
    }
    const outcome = openDocument({ ...v1, layers })
    expect(outcome.status).toBe('ok')
    if (outcome.status === 'ok') {
      expect(outcome.document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
      expect(outcome.readOnly).toBe(false)
    }
  })

  test('migrateV1ToV2 preserves layer tree at schemaVersion 2', () => {
    const base = createEmptyDocument({ name: 'Legacy' })
    const layers: Record<string, unknown> = {}
    for (const [id, layer] of Object.entries(base.layers)) {
      const { fillOpacity: _f, ...rest } = layer as Record<string, unknown>
      layers[id] = rest
    }
    const v1 = {
      ...base,
      layers,
      schemaVersion: LEGACY_SCHEMA_VERSION as 1,
    }
    const migrated = migrateV1ToV2(v1)
    expect(migrated).not.toBeNull()
    expect(migrated!.schemaVersion).toBe(2)
    expect(migrated!.name).toBe('Legacy')
    expect(migrated!.rootChildren).toEqual(base.rootChildren)
  })

  test('migrates schemaVersion 2 drop-shadow offset/blur → angle/distance/size', () => {
    const layerId = 'L1'
    const v2 = {
      schemaVersion: SCHEMA_VERSION_2,
      id: 'doc',
      name: 'V2',
      canvas: {
        width: 64,
        height: 64,
        colorSpace: 'srgb' as const,
        pixelFormat: 'rgba8' as const,
        background: 'transparent' as const,
      },
      rootChildren: [layerId],
      layers: {
        [layerId]: {
          id: layerId,
          name: 'Layer',
          type: 'raster',
          parentId: null,
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          transform: {
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            rotationDeg: 0,
            skewXDeg: 0,
            skewYDeg: 0,
            pivotX: 0,
            pivotY: 0,
          },
          pixels: 'asset-1',
          effects: [
            {
              id: 'fx1',
              type: 'drop-shadow',
              enabled: true,
              color: '#000000',
              opacity: 0.75,
              offsetX: 4,
              offsetY: 0,
              blur: 8,
              spread: 0,
            },
          ],
        },
      },
    }
    const migrated = migrateV2ToV3(v2)
    expect(migrated).not.toBeNull()
    const fx = migrated!.layers[layerId as never]?.effects[0]
    expect(fx?.type).toBe('drop-shadow')
    if (fx?.type === 'drop-shadow') {
      expect(fx.size).toBe(8)
      expect(fx.distance).toBeCloseTo(4, 5)
      expect(fx.angle).toBeCloseTo(0, 5)
    }
    expect(migrated!.layers[layerId as never]?.fillOpacity).toBe(1)
  })

  test('migrates legacy rect ShapeLayers additively from v3', () => {
    const shape = {
      ...createEmptyDocument(),
      schemaVersion: SCHEMA_VERSION_3,
      rootChildren: ['shape'],
      layers: {
        shape: {
          ...createTextLayer(),
          id: 'shape',
          name: 'Legacy rectangle',
          type: 'shape',
          bounds: { x: 0, y: 0, w: 20, h: 10 },
          primitive: 'rect',
          fill: { enabled: true, color: '#000000', opacity: 1 },
          stroke: { enabled: false, color: '#000000', opacity: 1, width: 0 },
        },
      },
    }
    const migrated = migrateV3ToV4(shape)
    expect(migrated?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated?.layers.shape?.type).toBe('shape')
    if (migrated?.layers.shape?.type === 'shape') {
      expect(migrated.layers.shape.sides).toBeUndefined()
      expect(migrated.layers.shape.cornerRadius).toBeUndefined()
    }
  })

  test('migrates plain v4 text into one resolved run', () => {
    const text = createTextLayer({ content: 'Bold me', fontWeight: 700 })
    const { runs: _runs, ...plainText } = text
    const v4 = {
      ...createEmptyDocument(),
      schemaVersion: 4,
      rootChildren: [text.id],
      layers: { [text.id]: plainText },
    }
    const migrated = migrateV4ToV5(v4)
    const result = migrated?.layers[text.id]
    expect(migrated?.schemaVersion).toBe(SCHEMA_VERSION_5)
    expect(result?.type).toBe('text')
    if (result?.type === 'text') {
      expect(result.runs).toEqual([{
        start: 0, end: 7, fontFamily: text.fontFamily, fontSource: undefined,
        fontSize: text.fontSize, fontWeight: 700, italic: false, color: text.color,
      }])
    }
  })

  test('migrates schemaVersion 5 to current additively', () => {
    const doc = { ...createEmptyDocument(), schemaVersion: SCHEMA_VERSION_5 }
    const migrated = migrateV5ToV6(doc)
    expect(migrated?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    const outcome = openDocument(doc)
    expect(outcome.status).toBe('ok')
    if (outcome.status === 'ok') {
      expect(outcome.document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    }
  })

  test('marks an unsupported schemaVersion read-only instead of coercing it', () => {
    const doc = { ...createEmptyDocument(), schemaVersion: 99 }
    const outcome = openDocument(doc)
    expect(outcome.status).toBe('unsupported-version')
    expect(outcome.readOnly).toBe(true)
    expect(isReadOnlyOutcome(outcome)).toBe(true)
    if (outcome.status === 'unsupported-version') {
      expect(outcome.schemaVersion).toBe(99)
    }
  })

  test('marks a missing schemaVersion read-only', () => {
    const outcome = openDocument({ name: 'no version at all' })
    expect(outcome.status).toBe('unsupported-version')
    expect(outcome.readOnly).toBe(true)
  })

  test('reports structural issues for a current document that fails invariants', () => {
    const doc = createEmptyDocument()
    const broken = { ...doc, rootChildren: ['missing'] }
    const outcome = openDocument(broken)
    expect(outcome.status).toBe('invalid')
    expect(outcome.readOnly).toBe(true)
    if (outcome.status === 'invalid') {
      expect(outcome.issues.length).toBeGreaterThan(0)
    }
  })

  test('opens a document that contains a text layer', () => {
    const layer = createTextLayer({ content: 'Hello' })
    const doc = addLayer(createEmptyDocument(), layer)
    const outcome = openDocument(doc)
    expect(outcome.status).toBe('ok')
    if (outcome.status === 'ok') {
      expect(outcome.document.layers[layer.id]?.type).toBe('text')
    }
  })
})
