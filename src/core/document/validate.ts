import type { z } from 'zod'
import { validateDocumentInvariants } from './invariants'
import type { ValidationIssue } from './invariants'
import { HappyDocumentSchema } from './schema'
import type { HappyDocument } from './schema'

export type { ValidationIssue }

export type ParseDocumentResult =
  | { ok: true; document: HappyDocument }
  | { ok: false; issues: ValidationIssue[] }

function fromZodError(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length ? issue.path.map(String).join('.') : '(root)',
    message: issue.message,
  }))
}

/**
 * Parses and validates a `HappyDocument` from unknown/plain data: schema
 * shape first (Zod), then the structural invariants that Zod cannot express
 * (SPEC §8.2). Callers that already migrated a document to the current
 * schema version should use this directly.
 */
export function parseDocument(input: unknown): ParseDocumentResult {
  const parsed = HappyDocumentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, issues: fromZodError(parsed.error) }
  }

  const invariants = validateDocumentInvariants(parsed.data)
  if (!invariants.ok) {
    return { ok: false, issues: invariants.issues }
  }

  return { ok: true, document: parsed.data }
}

/** Throwing variant for call sites that treat an invalid document as a bug. */
export function assertValidDocument(input: unknown): HappyDocument {
  const result = parseDocument(input)
  if (!result.ok) {
    const summary = result.issues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ')
    throw new Error(`invalid HappyDocument: ${summary}`)
  }
  return result.document
}
