/** Toy document model — colored rectangles. Replace when forking for a real tool. */

export type RectNode = {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  color: string
  /** Degrees clockwise around the node center. Missing = 0. */
  rotation?: number
  /** Optional hierarchy; null/undefined = root. */
  parentId?: string | null
}

export type EditorDocument = {
  version: 1
  name: string
  width: number
  height: number
  nodes: RectNode[]
}

export function createEmptyDocument(name = 'untitled'): EditorDocument {
  return {
    version: 1,
    name,
    width: 640,
    height: 360,
    nodes: [],
  }
}

export function createDemoDocument(): EditorDocument {
  return {
    version: 1,
    name: 'demo',
    width: 640,
    height: 360,
    nodes: [
      {
        id: 'n1',
        name: 'Sky',
        x: 0,
        y: 0,
        w: 640,
        h: 200,
        color: '#3d7eb5',
      },
      {
        id: 'n2',
        name: 'Ground',
        x: 0,
        y: 200,
        w: 640,
        h: 160,
        color: '#3d6b3d',
      },
      {
        id: 'n3',
        name: 'Player',
        x: 80,
        y: 160,
        w: 48,
        h: 64,
        color: '#ffc83d',
      },
      {
        id: 'n4',
        name: 'Block',
        x: 280,
        y: 240,
        w: 80,
        h: 40,
        color: '#c44',
      },
    ],
  }
}

let idCounter = 0

export function newNodeId(): string {
  idCounter += 1
  return `n_${Date.now().toString(36)}_${idCounter}`
}

export function findNode(
  doc: EditorDocument,
  id: string,
): RectNode | undefined {
  return doc.nodes.find((n) => n.id === id)
}

export function createRectNode(
  partial?: Partial<Omit<RectNode, 'id'>> & { id?: string },
): RectNode {
  return {
    id: partial?.id ?? newNodeId(),
    name: partial?.name ?? 'Rect',
    x: partial?.x ?? 40,
    y: partial?.y ?? 40,
    w: partial?.w ?? 80,
    h: partial?.h ?? 60,
    color: partial?.color ?? '#5b9fd4',
    rotation: partial?.rotation ?? 0,
    parentId: partial?.parentId ?? null,
  }
}
