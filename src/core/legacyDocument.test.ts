import { describe, expect, test } from 'bun:test'
import {
  createDemoDocument,
  createEmptyDocument,
  createRectNode,
  findNode,
  newNodeId,
} from './legacyDocument'

describe('legacyDocument', () => {
  test('createEmptyDocument has defaults', () => {
    const doc = createEmptyDocument('test')
    expect(doc.version).toBe(1)
    expect(doc.name).toBe('test')
    expect(doc.width).toBe(640)
    expect(doc.height).toBe(360)
    expect(doc.nodes).toEqual([])
  })

  test('createDemoDocument seeds Sky/Ground/Player/Block', () => {
    const doc = createDemoDocument()
    expect(doc.nodes.map((n) => n.name)).toEqual([
      'Sky',
      'Ground',
      'Player',
      'Block',
    ])
  })

  test('newNodeId returns unique ids', () => {
    const a = newNodeId()
    const b = newNodeId()
    expect(a).not.toBe(b)
  })

  test('findNode and createRectNode', () => {
    const node = createRectNode({ name: 'Box', x: 10, y: 20 })
    const doc = createEmptyDocument()
    doc.nodes.push(node)
    expect(findNode(doc, node.id)?.name).toBe('Box')
    expect(node.rotation).toBe(0)
    expect(findNode(doc, 'missing')).toBeUndefined()
  })
})
