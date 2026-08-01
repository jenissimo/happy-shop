import {
  ArrowCounterClockwise,
  ArrowsInCardinal,
  ArrowsOutCardinal,
  Bandaids,
  CircleDashed,
  ClockCounterClockwise,
  CursorClick,
  Drop,
  DropHalf,
  Crop,
  Eraser,
  Eyedropper,
  FirstAid,
  Fingerprint,
  Gradient,
  Hand,
  Lasso,
  MagicWand,
  MagnetStraight,
  MagnifyingGlass,
  Moon,
  PaintBrush,
  PaintBucket,
  Path,
  PenNib,
  PencilSimple,
  PlusCircle,
  MinusCircle,
  ArrowsLeftRight,
  Polygon,
  Rectangle,
  ArrowsClockwise,
  ScribbleLoop,
  Selection,
  Snowflake,
  Sparkle,
  Spiral,
  Stamp,
  Sun,
  TextT,
  WaveSine,
  Eye,
  type Icon,
} from '@phosphor-icons/react'
import type { LassoMode, MarqueeShape } from '../session/selectionToolStore'

/**
 * Tool strip order (SPECS/MULTI-DOC-AND-TOOLBAR.md §3 + SPECS/TEXT-TOOL.md).
 * Shape (U) sits with drawing tools above the Hand/Zoom block (SPECS/UX-AUDIT-PHOTOSHOP.md).
 */
export type EditorToolId =
  | 'move'
  | 'marquee'
  | 'lasso'
  | 'magicWand'
  | 'crop'
  | 'eyedropper'
  | 'brush'
  | 'pencil'
  | 'eraser'
  | 'paintBucket'
  | 'cloneStamp'
  | 'historyBrush'
  | 'patternStamp'
  | 'spotHealing'
  | 'healingBrush'
  | 'smudge'
  | 'blur'
  | 'sharpen'
  | 'dodge'
  | 'burn'
  | 'sponge'
  | 'liquifyWarp'
  | 'liquifyReconstruct'
  | 'liquifyBloat'
  | 'liquifyPucker'
  | 'liquifyTwirl'
  | 'liquifyFreeze'
  | 'liquifyThaw'
  | 'gradient'
  | 'text'
  | 'pathSelection'
  | 'directSelection'
  | 'pen'
  | 'freeformPen'
  | 'addAnchor'
  | 'deleteAnchor'
  | 'convertPoint'
  | 'shape'
  | 'hand'
  | 'rotateView'
  | 'zoom'
  | 'quickMask'

export type ToolGroup =
  | 'paint'
  | 'fill'
  | 'stamp'
  | 'healing'
  | 'blur'
  | 'toning'
  | 'liquify'
  | 'pathSelect'
  | 'pen'

export type ToolDef = {
  id: EditorToolId
  /** Single-letter shortcut (UX-PHOTOSHOP.md). */
  letter: string
  title: string
  commandId: string
  icon: Icon
  /** Visual separator before this tool (e.g. before Hand). */
  separatorBefore?: boolean
  /** Grayed until the milestone lands. */
  enabled?: boolean
  /** Other tools selected from the same Photoshop-style flyout. */
  group?: ToolGroup
}

export const TOOLS: readonly ToolDef[] = [
  {
    id: 'move',
    letter: 'V',
    title: 'Move Tool',
    commandId: 'tool.move',
    icon: ArrowsOutCardinal,
  },
  {
    id: 'marquee',
    letter: 'M',
    title: 'Rectangular Marquee Tool',
    commandId: 'tool.marquee',
    icon: Selection,
  },
  {
    id: 'lasso',
    letter: 'L',
    title: 'Lasso Tool',
    commandId: 'tool.lasso',
    icon: Lasso,
  },
  {
    id: 'magicWand',
    letter: 'W',
    title: 'Magic Wand Tool',
    commandId: 'tool.magicWand',
    icon: MagicWand,
  },
  {
    id: 'crop',
    letter: 'C',
    title: 'Crop Tool',
    commandId: 'tool.crop',
    icon: Crop,
  },
  {
    id: 'eyedropper',
    letter: 'I',
    title: 'Eyedropper Tool',
    commandId: 'tool.eyedropper',
    icon: Eyedropper,
  },
  {
    id: 'brush',
    letter: 'B',
    title: 'Brush Tool',
    commandId: 'tool.brush',
    icon: PaintBrush,
    group: 'paint',
  },
  {
    id: 'pencil',
    letter: 'B',
    title: 'Pencil Tool',
    commandId: 'tool.pencil',
    icon: PencilSimple,
    group: 'paint',
  },
  {
    id: 'eraser',
    letter: 'E',
    title: 'Eraser Tool',
    commandId: 'tool.eraser',
    icon: Eraser,
  },
  {
    id: 'paintBucket',
    letter: 'G',
    title: 'Paint Bucket Tool',
    commandId: 'tool.paintBucket',
    icon: PaintBucket,
    group: 'fill',
  },
  {
    id: 'gradient',
    letter: 'G',
    title: 'Gradient Tool',
    commandId: 'tool.gradient',
    icon: Gradient,
    group: 'fill',
  },
  {
    id: 'cloneStamp',
    letter: 'S',
    title: 'Clone Stamp Tool',
    commandId: 'tool.cloneStamp',
    icon: Stamp,
    group: 'stamp',
  },
  {
    id: 'historyBrush',
    letter: 'S',
    title: 'History Brush Tool',
    commandId: 'tool.historyBrush',
    icon: ClockCounterClockwise,
    group: 'stamp',
  },
  {
    id: 'patternStamp',
    letter: 'S',
    title: 'Pattern Stamp Tool',
    commandId: 'tool.patternStamp',
    icon: Stamp,
    group: 'stamp',
  },
  {
    id: 'spotHealing',
    letter: 'J',
    title: 'Spot Healing Brush Tool',
    commandId: 'tool.spotHealing',
    icon: Bandaids,
    group: 'healing',
  },
  {
    id: 'healingBrush',
    letter: 'J',
    title: 'Healing Brush Tool',
    commandId: 'tool.healingBrush',
    icon: FirstAid,
    group: 'healing',
  },
  {
    id: 'smudge',
    letter: '',
    title: 'Smudge Tool',
    commandId: 'tool.smudge',
    icon: Fingerprint,
    group: 'blur',
  },
  {
    id: 'blur',
    letter: '',
    title: 'Blur Tool',
    commandId: 'tool.blur',
    icon: Drop,
    group: 'blur',
  },
  {
    id: 'sharpen',
    letter: '',
    title: 'Sharpen Tool',
    commandId: 'tool.sharpen',
    icon: Sparkle,
    group: 'blur',
  },
  {
    id: 'dodge',
    letter: 'O',
    title: 'Dodge Tool',
    commandId: 'tool.dodge',
    icon: Sun,
    group: 'toning',
  },
  {
    id: 'burn',
    letter: 'O',
    title: 'Burn Tool',
    commandId: 'tool.burn',
    icon: Moon,
    group: 'toning',
  },
  {
    id: 'sponge',
    letter: 'O',
    title: 'Sponge Tool',
    commandId: 'tool.sponge',
    icon: DropHalf,
    group: 'toning',
  },
  {
    id: 'liquifyWarp',
    letter: '',
    title: 'Forward Warp Tool',
    commandId: 'tool.liquifyWarp',
    icon: WaveSine,
    group: 'liquify',
  },
  {
    id: 'liquifyReconstruct',
    letter: '',
    title: 'Reconstruct Tool',
    commandId: 'tool.liquifyReconstruct',
    icon: ArrowCounterClockwise,
    group: 'liquify',
  },
  {
    id: 'liquifyBloat',
    letter: '',
    title: 'Bloat Tool',
    commandId: 'tool.liquifyBloat',
    icon: ArrowsOutCardinal,
    group: 'liquify',
  },
  {
    id: 'liquifyPucker',
    letter: '',
    title: 'Pucker Tool',
    commandId: 'tool.liquifyPucker',
    icon: ArrowsInCardinal,
    group: 'liquify',
  },
  {
    id: 'liquifyTwirl',
    letter: '',
    title: 'Twirl Tool',
    commandId: 'tool.liquifyTwirl',
    icon: Spiral,
    group: 'liquify',
  },
  {
    id: 'liquifyFreeze',
    letter: '',
    title: 'Freeze Mask Tool',
    commandId: 'tool.liquifyFreeze',
    icon: Snowflake,
    group: 'liquify',
  },
  {
    id: 'liquifyThaw',
    letter: '',
    title: 'Thaw Mask Tool',
    commandId: 'tool.liquifyThaw',
    icon: Sun,
    group: 'liquify',
  },
  {
    id: 'text',
    letter: 'T',
    title: 'Type Tool',
    commandId: 'tool.text',
    icon: TextT,
  },
  {
    id: 'pathSelection',
    letter: 'A',
    title: 'Path Selection Tool',
    commandId: 'tool.pathSelection',
    icon: Path,
    group: 'pathSelect',
  },
  {
    id: 'directSelection',
    letter: 'A',
    title: 'Direct Selection Tool',
    commandId: 'tool.directSelection',
    icon: CursorClick,
    group: 'pathSelect',
  },
  {
    id: 'pen',
    letter: 'P',
    title: 'Pen Tool',
    commandId: 'tool.pen',
    icon: PenNib,
    group: 'pen',
  },
  {
    id: 'freeformPen',
    letter: 'P',
    title: 'Freeform Pen Tool',
    commandId: 'tool.freeformPen',
    icon: ScribbleLoop,
    group: 'pen',
  },
  {
    id: 'addAnchor',
    letter: 'P',
    title: 'Add Anchor Point Tool',
    commandId: 'tool.addAnchor',
    icon: PlusCircle,
    group: 'pen',
  },
  {
    id: 'deleteAnchor',
    letter: 'P',
    title: 'Delete Anchor Point Tool',
    commandId: 'tool.deleteAnchor',
    icon: MinusCircle,
    group: 'pen',
  },
  {
    id: 'convertPoint',
    letter: 'P',
    title: 'Convert Point Tool',
    commandId: 'tool.convertPoint',
    icon: ArrowsLeftRight,
    group: 'pen',
  },
  {
    id: 'shape',
    letter: 'U',
    title: 'Shape Tool',
    commandId: 'tool.shape',
    icon: Rectangle,
  },
  {
    id: 'hand',
    letter: 'H',
    title: 'Hand Tool',
    commandId: 'tool.hand',
    icon: Hand,
    separatorBefore: true,
  },
  {
    id: 'rotateView',
    letter: 'R',
    title: 'Rotate View Tool',
    commandId: 'tool.rotateView',
    icon: ArrowsClockwise,
  },
  {
    id: 'zoom',
    letter: 'Z',
    title: 'Zoom Tool',
    commandId: 'tool.zoom',
    icon: MagnifyingGlass,
  },
  {
    id: 'quickMask',
    letter: 'Q',
    title: 'Edit in Quick Mask Mode',
    commandId: 'tool.quickMask',
    icon: Eye,
  },
] as const

export const DEFAULT_TOOL_ID: EditorToolId = 'move'

export function getToolDef(id: EditorToolId): ToolDef | undefined {
  return TOOLS.find((t) => t.id === id)
}

export function marqueeIcon(shape: MarqueeShape): Icon {
  return shape === 'ellipse' ? CircleDashed : Selection
}

export function lassoIcon(mode: LassoMode): Icon {
  if (mode === 'polygonal') return Polygon
  if (mode === 'magnetic') return MagnetStraight
  return Lasso
}

export function marqueeTitle(shape: MarqueeShape): string {
  return shape === 'ellipse'
    ? 'Elliptical Marquee Tool'
    : 'Rectangular Marquee Tool'
}

export function lassoTitle(mode: LassoMode): string {
  if (mode === 'polygonal') return 'Polygonal Lasso Tool'
  if (mode === 'magnetic') return 'Magnetic Lasso Tool'
  return 'Lasso Tool'
}

export type PathSelectToolId = 'pathSelection' | 'directSelection'

export function pathSelectIcon(id: PathSelectToolId): Icon {
  return id === 'directSelection' ? CursorClick : Path
}

export function pathSelectTitle(id: PathSelectToolId): string {
  return id === 'directSelection' ? 'Direct Selection Tool' : 'Path Selection Tool'
}

export type PenToolId =
  | 'pen'
  | 'freeformPen'
  | 'addAnchor'
  | 'deleteAnchor'
  | 'convertPoint'

export const PEN_TOOL_CYCLE: readonly PenToolId[] = [
  'pen',
  'freeformPen',
  'addAnchor',
  'deleteAnchor',
  'convertPoint',
]

export function penIcon(id: PenToolId): Icon {
  switch (id) {
    case 'freeformPen':
      return ScribbleLoop
    case 'addAnchor':
      return PlusCircle
    case 'deleteAnchor':
      return MinusCircle
    case 'convertPoint':
      return ArrowsLeftRight
    default:
      return PenNib
  }
}

export function penTitle(id: PenToolId): string {
  switch (id) {
    case 'freeformPen':
      return 'Freeform Pen Tool'
    case 'addAnchor':
      return 'Add Anchor Point Tool'
    case 'deleteAnchor':
      return 'Delete Anchor Point Tool'
    case 'convertPoint':
      return 'Convert Point Tool'
    default:
      return 'Pen Tool'
  }
}

export function isPenToolId(id: string): id is PenToolId {
  return (PEN_TOOL_CYCLE as readonly string[]).includes(id)
}

export function cyclePenTool(id: string, reverse = false): PenToolId {
  const index = PEN_TOOL_CYCLE.indexOf(id as PenToolId)
  const from = index >= 0 ? index : 0
  const next = reverse
    ? (from - 1 + PEN_TOOL_CYCLE.length) % PEN_TOOL_CYCLE.length
    : (from + 1) % PEN_TOOL_CYCLE.length
  return PEN_TOOL_CYCLE[next]!
}
