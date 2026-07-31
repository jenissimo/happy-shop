import { z } from 'zod'
import { openDocument } from '../core/document'
import type { HappyDocument } from '../core/document'
import type { ProjectManifest } from './types'

export const ProjectAssetDescriptorSchema = z.object({
  id: z.string().min(1),
  relativePath: z.string().min(1),
  kind: z.enum(['layer', 'asset', 'thumbnail']),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  mimeType: z.string().optional(),
})

/**
 * Project package envelope (manifest schemaVersion stays 1). The embedded
 * document may be HappyDocument v1 or v2 — migrated via `openDocument`.
 */
export const ProjectManifestSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.string().min(1),
  savedAt: z.string().min(1),
  document: z.unknown(),
  assets: z.record(z.string(), ProjectAssetDescriptorSchema),
})

export function parseManifest(raw: unknown): ProjectManifest {
  const envelope = ProjectManifestSchema.parse(raw)
  const outcome = openDocument(envelope.document)
  if (outcome.status !== 'ok') {
    const detail =
      outcome.status === 'unsupported-version'
        ? `unsupported document schemaVersion ${String(outcome.schemaVersion)}`
        : outcome.issues.map((i) => i.message).join('; ')
    throw new Error(`manifest document invalid: ${detail}`)
  }
  return {
    schemaVersion: 1,
    revision: envelope.revision,
    savedAt: envelope.savedAt,
    document: outcome.document,
    assets: envelope.assets,
  }
}

export function createEmptyManifest(
  document: HappyDocument,
  revision: string,
): ProjectManifest {
  return {
    schemaVersion: 1,
    revision,
    savedAt: new Date().toISOString(),
    document,
    assets: {},
  }
}
