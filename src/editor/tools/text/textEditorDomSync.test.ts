import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  measureContentOffset,
  restoreContentSelection,
} from './textEditorDomSync'

type MockText = { nodeType: 3; textContent: string; parent: MockElement | null }
type MockElement = {
  nodeType: 1
  childNodes: MockText[]
  textContent: string
  innerHTML: string
  contentEditable?: string
  style: Record<string, string>
  appendChild(child: MockText): void
  remove(): void
}

type MockRange = {
  startContainer: MockText | MockElement
  startOffset: number
  endContainer: MockText | MockElement
  endOffset: number
  selectNodeContents(root: MockElement): void
  setEnd(node: MockText | MockElement, offset: number): void
  setStart(node: MockText | MockElement, offset: number): void
  collapse(toStart: boolean): void
  toString(): string
}

type MockSelection = {
  rangeCount: number
  anchorNode: MockText | MockElement | null
  anchorOffset: number
  _range: MockRange | null
  getRangeAt(index: number): MockRange
  removeAllRanges(): void
  addRange(range: MockRange): void
}

function textNode(text: string, parent: MockElement | null = null): MockText {
  return { nodeType: 3, textContent: text, parent }
}

function createMockDom(): { root: MockElement; selection: MockSelection } {
  const selection: MockSelection = {
    rangeCount: 0,
    anchorNode: null,
    anchorOffset: 0,
    _range: null,
    getRangeAt(index) {
      if (index !== 0 || !this._range) throw new Error('no range')
      return this._range
    },
    removeAllRanges() {
      this.rangeCount = 0
      this._range = null
      this.anchorNode = null
      this.anchorOffset = 0
    },
    addRange(range) {
      this.rangeCount = 1
      this._range = range
      this.anchorNode = range.startContainer
      this.anchorOffset = range.startOffset
    },
  }

  const createRange = (): MockRange => {
    const range: MockRange = {
      startContainer: root,
      startOffset: 0,
      endContainer: root,
      endOffset: 0,
      selectNodeContents(rootNode) {
        const texts = rootNode.childNodes
        if (texts.length) {
          this.startContainer = texts[0]!
          this.endContainer = texts[texts.length - 1]!
          this.startOffset = 0
          this.endOffset = texts[texts.length - 1]!.textContent.length
        } else {
          this.startContainer = rootNode
          this.endContainer = rootNode
          this.startOffset = 0
          this.endOffset = 0
        }
      },
      setEnd(node, offset) {
        this.endContainer = node
        this.endOffset = offset
      },
      setStart(node, offset) {
        this.startContainer = node
        this.startOffset = offset
      },
      collapse(toStart) {
        if (toStart) {
          this.endContainer = this.startContainer
          this.endOffset = this.startOffset
        } else {
          this.startContainer = this.endContainer
          this.startOffset = this.endOffset
        }
      },
      toString() {
        const collect = (node: MockText | MockElement, endNode: MockText | MockElement, endOffset: number) => {
          if (node.nodeType === 3) {
            const limit = node === endNode ? endOffset : node.textContent.length
            return node.textContent.slice(0, limit)
          }
          let out = ''
          for (const child of node.childNodes) {
            out += collect(child, endNode, endOffset)
            if (child === endNode) break
          }
          return out
        }
        const start = collect(this.startContainer, this.endContainer, this.endOffset)
        if (this.startContainer === this.endContainer && this.startContainer.nodeType === 3) {
          return this.startContainer.textContent.slice(this.startOffset, this.endOffset)
        }
        return start
      },
    }
    return range
  }

  const root: MockElement = {
    nodeType: 1,
    childNodes: [],
    textContent: '',
    innerHTML: '',
    style: {},
    appendChild(child) {
      child.parent = this
      this.childNodes.push(child)
      this.textContent = this.childNodes.map((n) => n.textContent).join('')
    },
    remove() {
      this.childNodes = []
      this.textContent = ''
    },
  }
  const rootNode = root

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createRange,
      createTreeWalker(
        rootEl: MockElement,
        whatToShow: number,
      ) {
        const SHOW_TEXT = 4
        const nodes = whatToShow === SHOW_TEXT ? [...rootEl.childNodes] : []
        let index = 0
        return {
          nextNode() {
            return index < nodes.length ? nodes[index++]! : null
          },
        }
      },
      body: { appendChild: (el: MockElement) => el },
    },
  })
  Object.defineProperty(globalThis, 'NodeFilter', {
    configurable: true,
    value: { SHOW_TEXT: 4 },
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { getSelection: () => selection },
  })

  return { root, selection }
}

describe('text editor DOM selection', () => {
  let root: MockElement
  let selection: MockSelection
  let previousDocument: typeof globalThis.document
  let previousWindow: typeof globalThis.window
  let previousNodeFilter: typeof globalThis.NodeFilter

  beforeEach(() => {
    previousDocument = globalThis.document
    previousWindow = globalThis.window
    previousNodeFilter = globalThis.NodeFilter
    ;({ root, selection } = createMockDom())
    root.style.textAlign = 'right'
    root.style.direction = 'ltr'
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: previousDocument,
    })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    })
    Object.defineProperty(globalThis, 'NodeFilter', {
      configurable: true,
      value: previousNodeFilter,
    })
  })

  test('restores caret at end after markup refresh on right-aligned editor', () => {
    const span = textNode('Hello')
    root.appendChild(span)

    restoreContentSelection(root as unknown as HTMLElement, 5, 5)
    expect(selection.rangeCount).toBe(1)
    expect(
      measureContentOffset(
        root as unknown as HTMLElement,
        selection.getRangeAt(0).startContainer as unknown as Node,
        selection.getRangeAt(0).startOffset,
      ),
    ).toBe(5)

    root.childNodes.length = 0
    root.appendChild(textNode('Hello'))
    restoreContentSelection(root as unknown as HTMLElement, 5, 5)

    expect(selection.rangeCount).toBe(1)
    expect(
      measureContentOffset(
        root as unknown as HTMLElement,
        selection.getRangeAt(0).startContainer as unknown as Node,
        selection.getRangeAt(0).startOffset,
      ),
    ).toBe(5)
  })

  test('append-at-end selection round-trips for left, center, and right align', () => {
    for (const align of ['left', 'center', 'right'] as const) {
      root.style.textAlign = align
      root.childNodes.length = 0
      root.appendChild(textNode('Hi'))
      restoreContentSelection(root as unknown as HTMLElement, 2, 2)
      const offset = measureContentOffset(
        root as unknown as HTMLElement,
        selection.getRangeAt(0).startContainer as unknown as Node,
        selection.getRangeAt(0).startOffset,
      )
      expect(offset).toBe(2)
    }
  })
})
