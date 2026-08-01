export type ModifierGrammarRow = {
  tool: string
  shift: string
  alt: string
}

/** Single-source Help-sheet summary of the canvas modifier grammar. */
export const MODIFIER_GRAMMAR: ModifierGrammarRow[] = [
  { tool: 'Brush / Eraser', shift: 'Click: straight line; drag: 45°', alt: 'Sample color' },
  { tool: 'Pencil', shift: 'Click: straight line; drag: 45°', alt: 'Sample color' },
  { tool: 'Marquee', shift: 'Before: add; during: square/circle', alt: 'Before: subtract; during: from center' },
  { tool: 'Lasso / Wand', shift: 'Add to selection', alt: 'Subtract from selection' },
  { tool: 'Shape', shift: 'Square / circle', alt: 'From center' },
  { tool: 'Crop', shift: 'Square', alt: 'From center' },
  { tool: 'Transform', shift: 'Keep aspect', alt: '—' },
  { tool: 'Move', shift: '—', alt: 'Drag: duplicate layer' },
  {
    tool: 'Pen',
    shift: 'Constrain handles / rubber-band to 45°',
    alt: 'Place/drag: cusp (unlink handles)',
  },
  {
    tool: 'Direct Selection',
    shift: 'Toggle multi-select; constrain handle 45°',
    alt: 'Drag handle: break smooth link',
  },
]
