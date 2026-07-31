/** Character offset from the start of a contenteditable root to a DOM position. */
export function measureContentOffset(
  root: HTMLElement,
  node: Node,
  offset: number,
): number {
  const before = globalThis.document.createRange()
  before.selectNodeContents(root)
  before.setEnd(node, offset)
  return before.toString().length
}

/** Restore a character-index selection inside a contenteditable root. */
export function restoreContentSelection(
  root: HTMLElement,
  start: number,
  end: number,
): void {
  const selection = window.getSelection()
  if (!selection) return

  const range = globalThis.document.createRange()
  const walker = globalThis.document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  let count = 0
  let startNode: Node | null = null
  let startOffset = 0
  let endNode: Node | null = null
  let endOffset = 0

  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0
    if (!startNode && count + len >= start) {
      startNode = node
      startOffset = start - count
    }
    if (count + len >= end) {
      endNode = node
      endOffset = end - count
      break
    }
    count += len
  }

  if (!startNode) {
    range.selectNodeContents(root)
    range.collapse(end <= 0)
  } else {
    range.setStart(startNode, startOffset)
    range.setEnd(endNode ?? startNode, endNode ? endOffset : startOffset)
  }

  selection.removeAllRanges()
  selection.addRange(range)
}
