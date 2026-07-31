import type { CursorId } from '../../cursors/cursorIds'
import type { EditorToolId } from '../../toolbar/tools'
import type { LiquifyKind } from './LiquifyToolController'

export const LIQUIFY_TOOL_IDS = [
  'liquifyWarp',
  'liquifyReconstruct',
  'liquifyBloat',
  'liquifyPucker',
  'liquifyTwirl',
  'liquifyFreeze',
  'liquifyThaw',
] as const satisfies readonly EditorToolId[]

export type LiquifyToolId = (typeof LIQUIFY_TOOL_IDS)[number]

const TOOL_TO_KIND: Record<LiquifyToolId, LiquifyKind> = {
  liquifyWarp: 'warp',
  liquifyReconstruct: 'reconstruct',
  liquifyBloat: 'bloat',
  liquifyPucker: 'pucker',
  liquifyTwirl: 'twirl',
  liquifyFreeze: 'freeze',
  liquifyThaw: 'thaw',
}

export function isLiquifyTool(toolId: EditorToolId): toolId is LiquifyToolId {
  return (LIQUIFY_TOOL_IDS as readonly EditorToolId[]).includes(toolId)
}

export function liquifyKindForTool(toolId: EditorToolId): LiquifyKind | null {
  if (!isLiquifyTool(toolId)) return null
  return TOOL_TO_KIND[toolId]
}

export function liquifyCursorIdForTool(toolId: LiquifyToolId): CursorId {
  switch (toolId) {
    case 'liquifyReconstruct':
      return 'liquify-reconstruct'
    case 'liquifyBloat':
      return 'liquify-bloat'
    case 'liquifyPucker':
      return 'liquify-pucker'
    case 'liquifyTwirl':
      return 'liquify-twirl'
    case 'liquifyFreeze':
      return 'liquify-freeze'
    case 'liquifyThaw':
      return 'liquify-thaw'
    default:
      return 'liquify'
  }
}

export function liquifyHintForTool(toolId: LiquifyToolId): string {
  switch (toolId) {
    case 'liquifyWarp':
      return 'Drag to push pixels along the stroke'
    case 'liquifyReconstruct':
      return 'Drag to blend back toward stroke start'
    case 'liquifyBloat':
      return 'Drag to bulge pixels outward from the brush center'
    case 'liquifyPucker':
      return 'Drag to pinch pixels inward toward the brush center'
    case 'liquifyTwirl':
      return 'Drag to rotate pixels around the brush center'
    case 'liquifyFreeze':
      return 'Paint to pin regions — warp tools skip frozen pixels'
    case 'liquifyThaw':
      return 'Paint to unpin frozen regions'
  }
}
