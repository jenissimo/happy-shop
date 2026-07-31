import type { HappyDocument, Layer, LayerId } from './schema'

export function getLayer(doc: HappyDocument, id: LayerId): Layer | undefined {
  return doc.layers[id]
}

/**
 * Children of `parentId` in bottom-to-top order, or the document root's
 * children when `parentId` is `null`. Returns `undefined` if `parentId`
 * does not resolve to a group layer.
 */
export function getChildrenIds(
  doc: HappyDocument,
  parentId: LayerId | null,
): readonly LayerId[] | undefined {
  if (parentId === null) return doc.rootChildren
  const layer = doc.layers[parentId]
  if (!layer || layer.type !== 'group') return undefined
  return layer.children
}

export function getParentId(
  doc: HappyDocument,
  id: LayerId,
): LayerId | null | undefined {
  return doc.layers[id]?.parentId
}

/** True if `id` is `ancestorId` itself or a descendant of it. */
export function isSelfOrDescendant(
  doc: HappyDocument,
  ancestorId: LayerId,
  id: LayerId,
): boolean {
  let current: LayerId | null | undefined = id
  const guard = new Set<LayerId>()
  while (current != null) {
    if (current === ancestorId) return true
    if (guard.has(current)) return false // defensive: malformed cyclic doc
    guard.add(current)
    current = getParentId(doc, current)
  }
  return false
}

/** All layers in bottom-to-top paint order, depth-first through groups. */
export function flattenPaintOrder(doc: HappyDocument): Layer[] {
  const result: Layer[] = []
  function visit(ids: readonly LayerId[]): void {
    for (const id of ids) {
      const layer = doc.layers[id]
      if (!layer) continue
      result.push(layer)
      if (layer.type === 'group') visit(layer.children)
    }
  }
  visit(doc.rootChildren)
  return result
}
