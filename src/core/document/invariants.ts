import {
  EFFECT_MULTIPLICITY,
  MAX_EFFECT_NODES_PER_LAYER,
} from './effectMultiplicity'
import { MAX_CANVAS_SIDE, exceedsMaxSide } from './limits'
import type { HappyDocument, Layer, LayerEffectType, LayerId } from './schema'

/**
 * Structural invariants from SPEC §8.2 that the Zod schema alone cannot
 * express (they depend on relationships between layers, not just shapes).
 * These operate on data that has already passed `HappyDocumentSchema`.
 */

export type ValidationIssue = {
  /** Dot/bracket path to the offending value, e.g. `layers["abc"].opacity`. */
  path: string
  message: string
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] }

function ok(): ValidationResult {
  return { ok: true }
}

function fail(issues: ValidationIssue[]): ValidationResult {
  return { ok: false, issues }
}

/** Every layer id key must be unique and equal its own `layer.id` field. */
export function checkLayerIdsMatchKeys(doc: HappyDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const [key, layer] of Object.entries(doc.layers)) {
    if (layer.id !== key) {
      issues.push({
        path: `layers["${key}"].id`,
        message: `layer id "${layer.id}" does not match its record key "${key}"`,
      })
    }
  }
  return issues
}

/** A usable document always has at least one layer node. */
export function checkMinimumLayerCount(doc: HappyDocument): ValidationIssue[] {
  return Object.keys(doc.layers).length > 0
    ? []
    : [{ path: 'layers', message: 'document must contain at least one layer' }]
}

type Container = {
  /** `null` for the document root. */
  parentId: LayerId | null
  path: string
  children: LayerId[]
}

function collectContainers(doc: HappyDocument): Container[] {
  const containers: Container[] = [
    { parentId: null, path: 'rootChildren', children: doc.rootChildren },
  ]
  for (const [id, layer] of Object.entries(doc.layers)) {
    if (layer.type === 'group') {
      containers.push({
        parentId: id as LayerId,
        path: `layers["${id}"].children`,
        children: layer.children,
      })
    }
  }
  return containers
}

/**
 * Every layer must appear in exactly one children array (its actual
 * parent's), no container may list a layer twice, every referenced id must
 * resolve to a real layer, and `parentId` must agree with the container that
 * actually holds the layer.
 */
export function checkSingleParent(doc: HappyDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const containers = collectContainers(doc)
  const referenceCount = new Map<LayerId, number>()
  const actualParentOf = new Map<LayerId, LayerId | null>()

  for (const container of containers) {
    const seenInContainer = new Set<LayerId>()
    for (const childId of container.children) {
      if (seenInContainer.has(childId)) {
        issues.push({
          path: container.path,
          message: `"${childId}" appears more than once in the same children array`,
        })
        continue
      }
      seenInContainer.add(childId)

      if (!doc.layers[childId]) {
        issues.push({
          path: container.path,
          message: `references unknown layer id "${childId}"`,
        })
        continue
      }

      referenceCount.set(childId, (referenceCount.get(childId) ?? 0) + 1)
      actualParentOf.set(childId, container.parentId)
    }
  }

  for (const id of Object.keys(doc.layers) as LayerId[]) {
    const count = referenceCount.get(id) ?? 0
    if (count === 0) {
      issues.push({
        path: `layers["${id}"]`,
        message: 'layer is not referenced by rootChildren or any group',
      })
    } else if (count > 1) {
      issues.push({
        path: `layers["${id}"]`,
        message: `layer is referenced by ${count} parents, expected exactly one`,
      })
    }

    const layer = doc.layers[id] as Layer
    const actualParent = actualParentOf.get(id) ?? null
    if (count === 1 && layer.parentId !== actualParent) {
      issues.push({
        path: `layers["${id}"].parentId`,
        message: `parentId "${String(layer.parentId)}" does not match actual container "${String(actualParent)}"`,
      })
    }
  }

  return issues
}

/**
 * Detects cycles and components unreachable from the document root. A cycle
 * among layers that all have exactly one parent reference (e.g. group A
 * contains group B and group B contains group A) would pass
 * `checkSingleParent` but never be reachable from `rootChildren`, so
 * reachability from the root is the authoritative cycle check.
 */
export function checkNoCycles(doc: HappyDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const childrenOf = new Map<LayerId, LayerId[]>()
  for (const [id, layer] of Object.entries(doc.layers)) {
    if (layer.type === 'group') childrenOf.set(id as LayerId, layer.children)
  }

  const visited = new Set<LayerId>()
  const stack = new Set<LayerId>()

  function visit(id: LayerId): void {
    if (stack.has(id)) {
      issues.push({
        path: `layers["${id}"]`,
        message: 'cycle detected: layer is its own ancestor',
      })
      return
    }
    if (visited.has(id)) return
    if (!doc.layers[id]) return

    visited.add(id)
    stack.add(id)
    for (const childId of childrenOf.get(id) ?? []) {
      visit(childId)
    }
    stack.delete(id)
  }

  for (const rootId of doc.rootChildren) visit(rootId)

  for (const id of Object.keys(doc.layers) as LayerId[]) {
    if (!visited.has(id)) {
      issues.push({
        path: `layers["${id}"]`,
        message: 'layer is not reachable from the document root',
      })
    }
  }

  return issues
}

export function checkOpacityRange(doc: HappyDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const [id, layer] of Object.entries(doc.layers)) {
    if (layer.opacity < 0 || layer.opacity > 1) {
      issues.push({
        path: `layers["${id}"].opacity`,
        message: `opacity ${layer.opacity} is outside the 0..1 range`,
      })
    }
  }
  return issues
}

/** Hard canvas size limit (SPEC §1.3). The soft 64MP limit is a separate,
 * non-blocking helper — see `limits.ts`. */
export function checkCanvasLimits(doc: HappyDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const { width, height } = doc.canvas
  if (!Number.isInteger(width) || width <= 0) {
    issues.push({ path: 'canvas.width', message: 'must be a positive integer' })
  }
  if (!Number.isInteger(height) || height <= 0) {
    issues.push({
      path: 'canvas.height',
      message: 'must be a positive integer',
    })
  }
  if (exceedsMaxSide(width, height)) {
    issues.push({
      path: 'canvas',
      message: `canvas side (${width}x${height}) exceeds the ${MAX_CANVAS_SIDE}px limit`,
    })
  }
  return issues
}

/**
 * Layer FX stack invariants (SPECS/ND-EFFECT-STACK-VISION.md §3.4):
 * unique ids within a layer, hard cap 24, per-type multiplicity caps.
 */
export function checkEffectStack(doc: HappyDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const [id, layer] of Object.entries(doc.layers)) {
    const effects = layer.effects ?? []
    const path = `layers["${id}"].effects`
    if (effects.length > MAX_EFFECT_NODES_PER_LAYER) {
      issues.push({
        path,
        message: `effects length ${effects.length} exceeds ${MAX_EFFECT_NODES_PER_LAYER}`,
      })
    }
    const seen = new Set<string>()
    const typeCounts = new Map<LayerEffectType, number>()
    for (const effect of effects) {
      if (seen.has(effect.id)) {
        issues.push({
          path: `${path}["${effect.id}"]`,
          message: 'duplicate effect id within layer',
        })
      }
      seen.add(effect.id)
      const n = (typeCounts.get(effect.type) ?? 0) + 1
      typeCounts.set(effect.type, n)
      const cap = EFFECT_MULTIPLICITY[effect.type]
      if (n > cap) {
        issues.push({
          path,
          message: `${effect.type} count ${n} exceeds cap ${cap}`,
        })
      }
    }
  }
  return issues
}

export function validateDocumentInvariants(
  doc: HappyDocument,
): ValidationResult {
  const issues = [
    ...checkMinimumLayerCount(doc),
    ...checkLayerIdsMatchKeys(doc),
    ...checkSingleParent(doc),
    ...checkNoCycles(doc),
    ...checkOpacityRange(doc),
    ...checkCanvasLimits(doc),
    ...checkEffectStack(doc),
  ]
  return issues.length === 0 ? ok() : fail(issues)
}
