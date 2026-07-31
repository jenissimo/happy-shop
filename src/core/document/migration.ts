import { migrateLegacyEffects } from './effectMigration'
import {
  CURRENT_SCHEMA_VERSION,
  HappyDocumentSchema,
  HappyDocumentV1Schema,
  HappyDocumentV2Schema,
  HappyDocumentV3Schema,
  HappyDocumentV4Schema,
  HappyDocumentV5Schema,
  SCHEMA_VERSION_1,
  SCHEMA_VERSION_2,
  SCHEMA_VERSION_3,
  SCHEMA_VERSION_4,
  SCHEMA_VERSION_5,
  UnknownVersionEnvelopeSchema,
  type HappyDocument,
  type HappyDocumentV5,
  type Layer,
} from './schema'
import { ensureDocumentHasPaintableLayer } from './factories'
import { parseDocument } from './validate'
import type { ValidationIssue } from './validate'

/**
 * Document open + migration (SPEC §8.2, SPECS/LAYER-STYLES.md).
 * - v6 → parse as current
 * - v5 → additive content-phase FX node types → v6
 * - v4 → add resolved text runs → v5 → v6
 * - v3 → additive vector shape parameters → v4 → v5 → v6
 * - v2 → migrate effects + fillOpacity → v3 → v4 → v5 → v6
 * - v1 → migrate to v2 shape then v3 → v4 → v5 → v6
 * - anything else → read-only unsupported (never silently coerced)
 */
export type OpenDocumentOutcome =
  | { status: 'ok'; document: HappyDocument; readOnly: false }
  | {
      status: 'unsupported-version'
      schemaVersion: unknown
      readOnly: true
      raw: unknown
    }
  | { status: 'invalid'; issues: ValidationIssue[]; readOnly: true }

function upgradeLayerToV3(layer: Record<string, unknown>): Layer {
  const effects = migrateLegacyEffects(
    Array.isArray(layer.effects) ? layer.effects : [],
  )
  return {
    ...layer,
    fillOpacity:
      typeof layer.fillOpacity === 'number' ? layer.fillOpacity : 1,
    effects,
  } as Layer
}

/** Pure v1 → v2: bump version; layer tree unchanged (no text/shape yet). */
export function migrateV1ToV2(input: unknown): {
  schemaVersion: typeof SCHEMA_VERSION_2
  id: string
  name: string
  canvas: HappyDocument['canvas']
  rootChildren: HappyDocument['rootChildren']
  layers: Record<string, unknown>
} | null {
  const parsed = HappyDocumentV1Schema.safeParse(input)
  if (!parsed.success) return null
  const v1 = parsed.data
  return {
    schemaVersion: SCHEMA_VERSION_2,
    id: v1.id,
    name: v1.name,
    canvas: v1.canvas,
    rootChildren: v1.rootChildren,
    layers: v1.layers as Record<string, unknown>,
  }
}

/** Pure v2 → v3: fillOpacity + Photoshop Layer Style param upgrade. */
export function migrateV2ToV3(input: unknown): HappyDocument | null {
  const parsed = HappyDocumentV2Schema.safeParse(input)
  if (!parsed.success) {
    // Allow already-partial upgrades from migrateV1ToV2 (layers still legacy).
    if (
      input &&
      typeof input === 'object' &&
      (input as { schemaVersion?: unknown }).schemaVersion === SCHEMA_VERSION_2
    ) {
      const loose = input as {
        id: string
        name: string
        canvas: HappyDocument['canvas']
        rootChildren: HappyDocument['rootChildren']
        layers: Record<string, Record<string, unknown>>
      }
      const layers: HappyDocument['layers'] = {}
      for (const [id, layer] of Object.entries(loose.layers)) {
        layers[id as keyof typeof layers] = upgradeLayerToV3(layer)
      }
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: loose.id,
        name: loose.name,
        canvas: loose.canvas,
        rootChildren: loose.rootChildren,
        layers,
      }
    }
    return null
  }
  const v2 = parsed.data
  const layers: HappyDocument['layers'] = {}
  for (const [id, layer] of Object.entries(v2.layers)) {
    layers[id as keyof typeof layers] = upgradeLayerToV3(
      layer as unknown as Record<string, unknown>,
    )
  }
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: v2.id,
    name: v2.name,
    canvas: v2.canvas,
    rootChildren: v2.rootChildren,
    layers,
  }
}

/** Pure additive v3 → v4 migration; existing shape documents remain unchanged. */
function migrateV3ToV4Raw(input: unknown): Record<string, unknown> | null {
  const parsed = HappyDocumentV3Schema.safeParse(input)
  if (!parsed.success) return null
  return { ...parsed.data, schemaVersion: SCHEMA_VERSION_4 }
}

/** Adds one resolved run per legacy text layer, preserving its layer style. */
export function migrateV4ToV5(input: unknown): HappyDocumentV5 | null {
  const parsed = HappyDocumentV4Schema.safeParse(input)
  if (!parsed.success) return null
  const layers: Record<string, HappyDocumentV5['layers'][keyof HappyDocumentV5['layers']]> = {}
  for (const [id, layer] of Object.entries(parsed.data.layers)) {
    if (layer.type !== 'text') {
      layers[id] = layer as HappyDocumentV5['layers'][keyof HappyDocumentV5['layers']]
      continue
    }
    layers[id] = {
      ...layer,
      runs: layer.content.length
        ? [{
            start: 0,
            end: layer.content.length,
            fontFamily: layer.fontFamily,
            fontSource: layer.fontSource,
            fontSize: layer.fontSize,
            fontWeight: layer.fontWeight,
            italic: layer.italic,
            color: layer.color,
          }]
        : [],
    } as HappyDocumentV5['layers'][keyof HappyDocumentV5['layers']]
  }
  return {
    ...parsed.data,
    schemaVersion: SCHEMA_VERSION_5,
    layers: layers as HappyDocumentV5['layers'],
  }
}

/** Pure additive v5 → v6: content-phase FX node types; layer trees unchanged. */
export function migrateV5ToV6(input: unknown): HappyDocument | null {
  const parsed = HappyDocumentV5Schema.safeParse(input)
  if (!parsed.success) return null
  return { ...parsed.data, schemaVersion: CURRENT_SCHEMA_VERSION }
}

/** Historical convenience API: migrate a v3 document all the way to current. */
export function migrateV3ToV4(input: unknown): HappyDocument | null {
  const v4 = migrateV3ToV4Raw(input)
  const v5 = v4 && migrateV4ToV5(v4)
  return v5 && migrateV5ToV6(v5)
}

/**
 * Legacy files may predate the minimum-layer rule. Repair that one recoverable
 * omission at the document-open boundary; malformed trees still fail normal
 * schema and invariant validation.
 */
function parseOpenedDocument(input: unknown) {
  const parsed = HappyDocumentSchema.safeParse(input)
  if (!parsed.success) return parseDocument(input)
  return parseDocument(ensureDocumentHasPaintableLayer(parsed.data))
}

export function openDocument(input: unknown): OpenDocumentOutcome {
  const envelope = UnknownVersionEnvelopeSchema.safeParse(input)
  const schemaVersion = envelope.success ? envelope.data.schemaVersion : undefined

  if (schemaVersion === SCHEMA_VERSION_1) {
    const v2 = migrateV1ToV2(input)
    if (!v2) {
      return {
        status: 'invalid',
        issues: [
          {
            path: 'schemaVersion',
            message: 'legacy schemaVersion 1 document failed v1 parse during migration',
          },
        ],
        readOnly: true,
      }
    }
    const v3 = migrateV2ToV3(v2)
    const v4 = v3 && migrateV3ToV4Raw({ ...v3, schemaVersion: SCHEMA_VERSION_3 })
    const v5 = v4 && migrateV4ToV5(v4)
    const migrated = v5 && migrateV5ToV6(v5)
    if (!migrated) {
      return {
        status: 'invalid',
        issues: [
          {
            path: 'schemaVersion',
            message: 'schemaVersion 1→2→3→4→5→6 migration failed',
          },
        ],
        readOnly: true,
      }
    }
    const result = parseOpenedDocument(migrated)
    if (!result.ok) {
      return { status: 'invalid', issues: result.issues, readOnly: true }
    }
    return { status: 'ok', document: result.document, readOnly: false }
  }

  if (schemaVersion === SCHEMA_VERSION_2) {
    const v3 = migrateV2ToV3(input)
    const v4 = v3 && migrateV3ToV4Raw({ ...v3, schemaVersion: SCHEMA_VERSION_3 })
    const v5 = v4 && migrateV4ToV5(v4)
    const migrated = v5 && migrateV5ToV6(v5)
    if (!migrated) {
      return {
        status: 'invalid',
        issues: [
          {
            path: 'schemaVersion',
            message: 'schemaVersion 2 document failed migration to v6',
          },
        ],
        readOnly: true,
      }
    }
    const result = parseOpenedDocument(migrated)
    if (!result.ok) {
      return { status: 'invalid', issues: result.issues, readOnly: true }
    }
    return { status: 'ok', document: result.document, readOnly: false }
  }

  if (schemaVersion === SCHEMA_VERSION_3) {
    const v4 = migrateV3ToV4Raw(input)
    const v5 = v4 && migrateV4ToV5(v4)
    const migrated = v5 && migrateV5ToV6(v5)
    if (!migrated) {
      return {
        status: 'invalid',
        issues: [{ path: 'schemaVersion', message: 'schemaVersion 3 document failed migration to v6' }],
        readOnly: true,
      }
    }
    const result = parseOpenedDocument(migrated)
    if (!result.ok) return { status: 'invalid', issues: result.issues, readOnly: true }
    return { status: 'ok', document: result.document, readOnly: false }
  }

  if (schemaVersion === SCHEMA_VERSION_4) {
    const v5 = migrateV4ToV5(input)
    const migrated = v5 && migrateV5ToV6(v5)
    if (!migrated) {
      return {
        status: 'invalid',
        issues: [{ path: 'schemaVersion', message: 'schemaVersion 4 document failed migration to v6' }],
        readOnly: true,
      }
    }
    const result = parseOpenedDocument(migrated)
    if (!result.ok) return { status: 'invalid', issues: result.issues, readOnly: true }
    return { status: 'ok', document: result.document, readOnly: false }
  }

  if (schemaVersion === SCHEMA_VERSION_5) {
    const migrated = migrateV5ToV6(input)
    if (!migrated) {
      return {
        status: 'invalid',
        issues: [{ path: 'schemaVersion', message: 'schemaVersion 5 document failed migration to v6' }],
        readOnly: true,
      }
    }
    const result = parseOpenedDocument(migrated)
    if (!result.ok) return { status: 'invalid', issues: result.issues, readOnly: true }
    return { status: 'ok', document: result.document, readOnly: false }
  }

  if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return {
      status: 'unsupported-version',
      schemaVersion,
      readOnly: true,
      raw: input,
    }
  }

  const result = parseOpenedDocument(input)
  if (!result.ok) {
    return { status: 'invalid', issues: result.issues, readOnly: true }
  }

  return { status: 'ok', document: result.document, readOnly: false }
}

export function isReadOnlyOutcome(outcome: OpenDocumentOutcome): boolean {
  return outcome.status !== 'ok'
}
