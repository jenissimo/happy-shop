import type { EditorToolId, ToolDef, ToolGroup } from './tools'

const KEY = 'happy-shop.tool-flyouts'

export type ToolFlyoutPrefs = Partial<Record<ToolGroup, EditorToolId>>

export function readToolFlyoutPrefs(): ToolFlyoutPrefs {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as ToolFlyoutPrefs } catch { return {} }
}

export function persistToolFlyoutSelection(group: ToolGroup, id: EditorToolId): void {
  const next = { ...readToolFlyoutPrefs(), [group]: id }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
}

export function visibleTools(tools: readonly ToolDef[], prefs: ToolFlyoutPrefs): ToolDef[] {
  return tools.filter((tool) => !tool.group || (prefs[tool.group] ?? tools.find((candidate) => candidate.group === tool.group)?.id) === tool.id)
}

export function cycleToolGroup(
  tools: readonly ToolDef[],
  prefs: ToolFlyoutPrefs,
  group: ToolGroup,
  activeToolId: EditorToolId,
  direction: 1 | -1,
): EditorToolId {
  const variants = tools.filter((tool) => tool.group === group)
  const currentId = variants.some((tool) => tool.id === activeToolId)
    ? activeToolId
    : prefs[group] ?? variants[0]?.id
  const currentIndex = variants.findIndex((tool) => tool.id === currentId)
  const nextIndex = (currentIndex + direction + variants.length) % variants.length
  return variants[nextIndex]?.id ?? activeToolId
}
