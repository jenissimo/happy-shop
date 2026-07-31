export type Command = {
  id: string
  title: string
  shortcut?: string
  icon?: string
  enabled: () => boolean
  run: () => void
}

export class CommandRegistry {
  private readonly commands = new Map<string, Command>()

  register(command: Command): void {
    this.commands.set(command.id, command)
  }

  get(id: string): Command | undefined {
    return this.commands.get(id)
  }

  list(): Command[] {
    return [...this.commands.values()]
  }

  run(id: string): boolean {
    const cmd = this.commands.get(id)
    if (!cmd || !cmd.enabled()) return false
    cmd.run()
    return true
  }
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
}

/**
 * Match a keyboard event against a shortcut string like "Mod+S", "Mod+Shift+Z", "Delete".
 * Mod = Meta on macOS, Ctrl elsewhere.
 */
export function matchShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split('+').map((p) => p.trim().toLowerCase())
  if (parts.length === 0) return false

  const keyPart = parts[parts.length - 1]!
  const mods = new Set(parts.slice(0, -1))

  const wantMod = mods.has('mod')
  const wantCtrl = mods.has('ctrl') || mods.has('control')
  const wantMeta = mods.has('meta') || mods.has('cmd') || mods.has('command')
  const wantAlt = mods.has('alt') || mods.has('option')
  const wantShift = mods.has('shift')

  const mac = isMacPlatform()
  const modDown = mac ? e.metaKey : e.ctrlKey

  if (wantMod) {
    if (!modDown) return false
    if (mac && e.ctrlKey && !wantCtrl) return false
    if (!mac && e.metaKey && !wantMeta) return false
  } else {
    if (wantCtrl !== e.ctrlKey) return false
    if (wantMeta !== e.metaKey) return false
  }

  if (wantAlt !== e.altKey) return false
  if (wantShift !== e.shiftKey) return false

  const eventKey = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase()
  const codeKey = e.code.replace(/^Key/, '').replace(/^Digit/, '').toLowerCase()

  if (keyPart === 'delete' || keyPart === 'del') {
    return e.key === 'Delete' || e.key === 'Backspace'
  }
  if (keyPart === 'escape' || keyPart === 'esc') {
    return e.key === 'Escape'
  }
  if (keyPart === 'enter' || keyPart === 'return') {
    return e.key === 'Enter'
  }
  if (keyPart === 'space') {
    return e.key === ' ' || e.code === 'Space'
  }
  if (keyPart === 'plus' || keyPart === '=') {
    return e.key === '+' || e.key === '=' || e.code === 'Equal'
  }
  if (keyPart === 'minus' || keyPart === '-') {
    return e.key === '-' || e.key === '_' || e.code === 'Minus'
  }
  // Prefer physical keys: Shift+[ produces `{` on US layouts.
  if (keyPart === '[' || keyPart === 'bracketleft') {
    return e.code === 'BracketLeft'
  }
  if (keyPart === ']' || keyPart === 'bracketright') {
    return e.code === 'BracketRight'
  }
  if (keyPart === "'" || keyPart === 'quote') {
    return e.code === 'Quote' || e.key === "'"
  }

  return (
    eventKey === keyPart ||
    codeKey === keyPart ||
    e.key.toLowerCase() === keyPart
  )
}

export function findCommandByShortcut(
  registry: CommandRegistry,
  e: KeyboardEvent,
): Command | undefined {
  for (const cmd of registry.list()) {
    if (cmd.shortcut && matchShortcut(e, cmd.shortcut) && cmd.enabled()) {
      return cmd
    }
  }
  return undefined
}

function stubRun(id: string): () => void {
  return () => {
    // Placeholder until domain/session handlers land (M1–M4.5).
    console.info(`[command stub] ${id}`)
  }
}

function stub(
  id: string,
  title: string,
  shortcut?: string,
): Command {
  return {
    id,
    title,
    shortcut,
    enabled: () => true,
    run: stubRun(id),
  }
}

/**
 * Registers UX-PHOTOSHOP.md File / Layer / View / Window command ids as
 * stubs (or no-ops). Real handlers may overwrite the same ids later
 * (`registerFileCommands`, EditorShell panel toggles, EditorContext, etc.).
 *
 * Browser-safe shortcuts only — does **not** bind Mod+W / Mod+F / Mod+P /
 * F5. `layer.group` reserves Mod+G (PS Group Layers); grid uses Mod+' in
 * EditorContext. Skips ids already owned by EditorContext (`doc.save`,
 * `history.*`, `view.toggleGrid|Rulers|Snap`).
 */
export function registerPhotoshopMenuCommands(registry: CommandRegistry): void {
  const commands: Command[] = [
    // File
    stub('file.new', 'New…', 'Mod+N'),
    stub('file.newFromClipboard', 'New from Clipboard', 'Mod+Shift+N'),
    stub('file.open', 'Open…', 'Mod+O'),
    stub('file.saveAs', 'Save As…'),
    stub('file.export', 'Export As PNG…', 'Mod+Alt+Shift+S'),
    stub('file.documentInfo', 'Document Info…'),
    stub('file.close', 'Close'),

    // Layer
    stub('layer.new', 'New Layer'),
    stub('layer.newGroup', 'New Group'),
    stub('layer.duplicate', 'Duplicate Layer'),
    stub('layer.delete', 'Delete Layer'),
    // PS "Group Layers" (selection → folder) — distinct from empty `layer.newGroup`.
    stub('layer.group', 'Group Layers', 'Mod+G'),
    stub('layer.ungroup', 'Ungroup Layers', 'Mod+Shift+G'),
    stub('layer.fx.open', 'Layer Style…'),
    stub('layer.fx.copy', 'Copy Layer Style'),
    stub('layer.fx.paste', 'Paste Layer Style'),
    stub('layer.fx.dropShadow', 'Drop Shadow…'),
    stub('layer.fx.stroke', 'Stroke…'),
    stub('layer.fx.colorOverlay', 'Color Overlay…'),
    stub('layer.fx.chromaKey', 'Chroma Key…'),
    stub('layer.mask.add', 'Reveal All'),
    stub('layer.mask.hideAll', 'Hide All'),
    stub('layer.mask.disable', 'Disable Layer Mask'),
    stub('layer.mask.delete', 'Delete Layer Mask'),
    stub('layer.bringToFront', 'Bring to Front'),
    stub('layer.bringForward', 'Bring Forward'),
    stub('layer.sendBackward', 'Send Backward'),
    stub('layer.sendToBack', 'Send to Back'),
    stub('layer.mergeDown', 'Merge Down', 'Mod+E'),
    stub('layer.mergeVisible', 'Merge Visible', 'Mod+Shift+E'),
    stub('layer.rasterize', 'Rasterize Layer'),

    // View (extras beyond EditorContext grid/rulers/snap)
    stub('view.zoomIn', 'Zoom In', 'Mod+='),
    stub('view.zoomOut', 'Zoom Out', 'Mod+-'),
    stub('view.fit', 'Fit on Screen', 'Mod+0'),
    stub('view.actualPixels', 'Actual Pixels', 'Mod+1'),
    stub('view.toggleExtras', 'Extras'),
    stub('view.resetLayout', 'Reset Layout'),

    // Window
    stub('panel.layers.toggle', 'Layers'),
    stub('panel.inspector.toggle', 'Inspector'),
    stub('panel.history.toggle', 'History'),
    stub('panel.navigator.toggle', 'Navigator'),
    stub('panel.effects.toggle', 'Effects'),
    stub('panel.info.toggle', 'Info'),
    stub('panel.swatches.toggle', 'Swatches'),
    stub('panel.brushes.toggle', 'Brushes'),
  ]

  for (const command of commands) {
    registry.register(command)
  }
}
