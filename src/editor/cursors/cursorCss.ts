import arrowCounterClockwiseSvg from '@phosphor-icons/core/regular/arrow-counter-clockwise.svg?raw'
import arrowClockwiseSvg from '@phosphor-icons/core/regular/arrow-clockwise.svg?raw'
import arrowsInCardinalSvg from '@phosphor-icons/core/regular/arrows-in-cardinal.svg?raw'
import arrowsOutCardinalSvg from '@phosphor-icons/core/regular/arrows-out-cardinal.svg?raw'
import cropSvg from '@phosphor-icons/core/regular/crop.svg?raw'
import crosshairSvg from '@phosphor-icons/core/regular/crosshair.svg?raw'
import eyedropperSvg from '@phosphor-icons/core/regular/eyedropper.svg?raw'
import lassoSvg from '@phosphor-icons/core/regular/lasso.svg?raw'
import magicWandSvg from '@phosphor-icons/core/regular/magic-wand.svg?raw'
import magnifyingGlassMinusSvg from '@phosphor-icons/core/regular/magnifying-glass-minus.svg?raw'
import magnifyingGlassPlusSvg from '@phosphor-icons/core/regular/magnifying-glass-plus.svg?raw'
import plusSvg from '@phosphor-icons/core/regular/plus.svg?raw'
import penNibSvg from '@phosphor-icons/core/regular/pen-nib.svg?raw'
import cursorClickSvg from '@phosphor-icons/core/regular/cursor-click.svg?raw'
import pathSvg from '@phosphor-icons/core/regular/path.svg?raw'
import snowflakeSvg from '@phosphor-icons/core/regular/snowflake.svg?raw'
import spiralSvg from '@phosphor-icons/core/regular/spiral.svg?raw'
import stampSvg from '@phosphor-icons/core/regular/stamp.svg?raw'
import fingerprintSvg from '@phosphor-icons/core/regular/fingerprint.svg?raw'
import bandaidsSvg from '@phosphor-icons/core/regular/bandaids.svg?raw'
import firstAidSvg from '@phosphor-icons/core/regular/first-aid.svg?raw'
import dropSvg from '@phosphor-icons/core/regular/drop.svg?raw'
import dropHalfSvg from '@phosphor-icons/core/regular/drop-half.svg?raw'
import moonSvg from '@phosphor-icons/core/regular/moon.svg?raw'
import sparkleSvg from '@phosphor-icons/core/regular/sparkle.svg?raw'
import sunSvg from '@phosphor-icons/core/regular/sun.svg?raw'
import waveSineSvg from '@phosphor-icons/core/regular/wave-sine.svg?raw'
import type { CursorId } from './cursorIds'
import { cssCursorFromPhosphor, type PhosphorHotspot } from './phosphorCursor'

/** Hotspots for 24×24 Phosphor cursors (SPECS/CURSORS.md). */
const PHOSPHOR: Partial<
  Record<CursorId, { svg: string } & PhosphorHotspot>
> = {
  move: { svg: arrowsOutCardinalSvg, x: 12, y: 12, fallback: 'move' },
  'move-layer': {
    svg: arrowsOutCardinalSvg,
    x: 12,
    y: 12,
    fallback: 'move',
  },
  lasso: { svg: lassoSvg, x: 4, y: 20, fallback: 'crosshair' },
  wand: { svg: magicWandSvg, x: 4, y: 20, fallback: 'crosshair' },
  crop: { svg: cropSvg, x: 12, y: 12, fallback: 'crosshair' },
  shape: { svg: plusSvg, x: 12, y: 12, fallback: 'crosshair' },
  pen: { svg: penNibSvg, x: 4, y: 20, fallback: 'crosshair' },
  'path-selection': { svg: pathSvg, x: 4, y: 20, fallback: 'crosshair' },
  'direct-selection': { svg: cursorClickSvg, x: 4, y: 4, fallback: 'crosshair' },
  'zoom-in': {
    svg: magnifyingGlassPlusSvg,
    x: 10,
    y: 10,
    fallback: 'zoom-in',
  },
  'zoom-out': {
    svg: magnifyingGlassMinusSvg,
    x: 10,
    y: 10,
    fallback: 'zoom-out',
  },
  eyedropper: { svg: eyedropperSvg, x: 2, y: 22, fallback: 'cell' },
  rotate: { svg: arrowClockwiseSvg, x: 12, y: 12, fallback: 'crosshair' },
  precision: { svg: crosshairSvg, x: 12, y: 12, fallback: 'crosshair' },
  stamp: { svg: stampSvg, x: 5, y: 20, fallback: 'crosshair' },
  smudge: { svg: fingerprintSvg, x: 12, y: 12, fallback: 'crosshair' },
  blur: { svg: dropSvg, x: 12, y: 12, fallback: 'crosshair' },
  sharpen: { svg: sparkleSvg, x: 12, y: 12, fallback: 'crosshair' },
  dodge: { svg: sunSvg, x: 12, y: 12, fallback: 'crosshair' },
  burn: { svg: moonSvg, x: 12, y: 12, fallback: 'crosshair' },
  sponge: { svg: dropHalfSvg, x: 12, y: 12, fallback: 'crosshair' },
  heal: { svg: firstAidSvg, x: 12, y: 12, fallback: 'crosshair' },
  'spot-heal': { svg: bandaidsSvg, x: 12, y: 12, fallback: 'crosshair' },
  liquify: { svg: waveSineSvg, x: 12, y: 12, fallback: 'crosshair' },
  'liquify-reconstruct': { svg: arrowCounterClockwiseSvg, x: 12, y: 12, fallback: 'crosshair' },
  'liquify-bloat': { svg: arrowsOutCardinalSvg, x: 12, y: 12, fallback: 'crosshair' },
  'liquify-pucker': { svg: arrowsInCardinalSvg, x: 12, y: 12, fallback: 'crosshair' },
  'liquify-twirl': { svg: spiralSvg, x: 12, y: 12, fallback: 'crosshair' },
  'liquify-freeze': { svg: snowflakeSvg, x: 12, y: 12, fallback: 'crosshair' },
  'liquify-thaw': { svg: sunSvg, x: 12, y: 12, fallback: 'crosshair' },
}

const CSS_ONLY: Partial<Record<CursorId, string>> = {
  crosshair: 'crosshair',
  marquee: 'crosshair',
  text: 'text',
  hand: 'grab',
  grab: 'grab',
  grabbing: 'grabbing',
  'not-allowed': 'not-allowed',
  default: 'default',
  'resize-n': 'n-resize',
  'resize-s': 's-resize',
  'resize-e': 'e-resize',
  'resize-w': 'w-resize',
  'resize-ne': 'ne-resize',
  'resize-nw': 'nw-resize',
  'resize-se': 'se-resize',
  'resize-sw': 'sw-resize',
}

/** Build a CSS `cursor` value for a static inventory id. */
export function cssCursorForId(id: CursorId): string {
  const ph = PHOSPHOR[id]
  if (ph) {
    return cssCursorFromPhosphor(ph.svg, ph)
  }
  return CSS_ONLY[id] ?? 'default'
}
