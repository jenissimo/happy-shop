import type { ToolsStripLayout } from '../../ui/features/settings/prefs'

/** Discrete CSS widths for the docked tools strip (matches ToolsStrip.module.css). */
export const TOOLS_STRIP_SINGLE_WIDTH = 34
export const TOOLS_STRIP_DOUBLE_WIDTH = 66

/** Midpoint between single and double — drag past this snaps to the other column count. */
export const TOOLS_STRIP_SNAP_THRESHOLD =
  (TOOLS_STRIP_SINGLE_WIDTH + TOOLS_STRIP_DOUBLE_WIDTH) / 2

export function toolsStripWidthForLayout(layout: ToolsStripLayout): number {
  return layout === 'double' ? TOOLS_STRIP_DOUBLE_WIDTH : TOOLS_STRIP_SINGLE_WIDTH
}

/** Map a virtual drag width to the discrete Photoshop-style column layout. */
export function toolsStripLayoutFromDragWidth(width: number): ToolsStripLayout {
  return width > TOOLS_STRIP_SNAP_THRESHOLD ? 'double' : 'single'
}
