import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { CommandRegistry } from '../../core/commands/registry'
import { CaretRight } from '@phosphor-icons/react'
import appLogo from '../../assets/app-logo.svg'
import { AssistantMascot } from '../features/AssistantMascot'
import {
  listBuiltinWorkspaceItems,
} from '../../editor/shell/workspaceDropdownModel'
import { openProjectPath } from '../features/new-document/commands'
import { useRecentProjects } from '../features/new-document/recentProjects'
import styles from './TitleBar.module.css'

const MenuBarContext = createContext<{
  openId: string | null
  setOpenId: (id: string | null) => void
} | null>(null)

function MenuBar({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (!openId) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t?.closest(`.${styles.menus}`)) setOpenId(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [openId])

  const value = useMemo(() => ({ openId, setOpenId }), [openId])

  return (
    <MenuBarContext.Provider value={value}>
      <div className={styles.menus} role="menubar">
        {children}
      </div>
    </MenuBarContext.Provider>
  )
}

export function Menu({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: ReactNode
}) {
  const ctx = useContext(MenuBarContext)
  if (!ctx) throw new Error('Menu outside TitleBar')
  const open = ctx.openId === id

  return (
    <div
      className={`${styles.menu}${open ? ` ${styles.menuOpen}` : ''}`}
      onMouseEnter={() => {
        if (ctx.openId != null) ctx.setOpenId(id)
      }}
    >
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => ctx.setOpenId(open ? null : id)}
      >
        {label}
      </button>
      {open && (
        <div
          className={styles.pop}
          role="menu"
          onClick={() => ctx.setOpenId(null)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function MenuSep() {
  return <hr className={styles.sep} />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className={styles.menuLabel}>{children}</div>
}

/**
 * A flyout menu item. Children may be commands, separators, labels, or another
 * MenuSubmenu, allowing menu models to nest without special-case Window logic.
 */
export function MenuSubmenu({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  const ctx = useContext(MenuBarContext)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const closeAndFocusTrigger = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div
      className={styles.submenu}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.submenuTrigger}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen(true)
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            closeAndFocusTrigger()
          }
        }}
      >
        <span>{label}</span>
        <CaretRight aria-hidden size={12} weight="bold" />
      </button>
      {open && (
        <div
          className={styles.submenuPop}
          role="menu"
          aria-label={label}
          onClick={() => ctx?.setOpenId(null)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              closeAndFocusTrigger()
            }
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** Menu row that runs a registered command by id. */
export function MenuCommand({
  commands,
  id,
  label,
}: {
  commands: CommandRegistry
  id: string
  label?: string
}) {
  const cmd = commands.get(id)
  if (!cmd) {
    return (
      <button type="button" disabled>
        {label ?? id}
      </button>
    )
  }
  return (
    <button
      type="button"
      disabled={!cmd.enabled()}
      onClick={() => {
        commands.run(id)
      }}
    >
      {label ?? cmd.title}
      {cmd.shortcut ? <kbd>{cmd.shortcut}</kbd> : null}
    </button>
  )
}

function OpenRecentMenu() {
  const projects = useRecentProjects()
  return (
    <MenuSubmenu label="Open Recent">
      {projects.length === 0 ? (
        <button type="button" disabled>No recent projects</button>
      ) : projects.map((project) => (
        <button
          key={project.path}
          type="button"
          title={project.path}
          onClick={() => void openProjectPath(project.path)}
        >
          {project.name}
        </button>
      ))}
    </MenuSubmenu>
  )
}

/**
 * Photoshop-like File / Edit / Layer / View / Window / Help menu IA
 * (SPECS/UX-PHOTOSHOP.md). All items dispatch through the command registry.
 */
export function PhotoshopMenus({
  commands,
  customWorkspaceCommandIds = [],
  toolPresetCommandIds = [],
}: {
  commands: CommandRegistry
  customWorkspaceCommandIds?: string[]
  toolPresetCommandIds?: string[]
}) {
  return (
    <>
      <Menu id="file" label="File">
        <MenuCommand commands={commands} id="file.new" />
        <MenuCommand commands={commands} id="file.newFromClipboard" />
        <MenuCommand commands={commands} id="file.open" />
        <OpenRecentMenu />
        <MenuSep />
        <MenuCommand commands={commands} id="doc.save" label="Save" />
        <MenuCommand commands={commands} id="file.saveAs" />
        <MenuCommand commands={commands} id="file.export" label="Export As PNG…" />
        <MenuCommand commands={commands} id="file.documentInfo" label="Document Info…" />
        <MenuSep />
        <MenuCommand commands={commands} id="file.close" />
      </Menu>

      <Menu id="edit" label="Edit">
        <MenuCommand commands={commands} id="history.undo" label="Undo" />
        <MenuCommand commands={commands} id="history.redo" label="Redo" />
        <MenuSep />
        <MenuCommand commands={commands} id="edit.cut" />
        <MenuCommand commands={commands} id="edit.copy" />
        <MenuCommand commands={commands} id="edit.copyMerged" />
        <MenuCommand commands={commands} id="edit.paste" />
        <MenuCommand commands={commands} id="edit.pasteInPlace" />
        <MenuSep />
        <MenuCommand commands={commands} id="edit.clear" />
        <MenuCommand commands={commands} id="edit.fill" label="Fill…" />
        <MenuSep />
        <MenuSubmenu label="Transform">
          <MenuCommand commands={commands} id="edit.freeTransform" label="Free Transform" />
          <MenuCommand commands={commands} id="edit.transform.cage" label="Cage Transform" />
          <MenuSubmenu label="Cage Density">
            <MenuCommand commands={commands} id="edit.transform.cage.density.2" label="2×2" />
            <MenuCommand commands={commands} id="edit.transform.cage.density.3" label="3×3" />
            <MenuCommand commands={commands} id="edit.transform.cage.density.4" label="4×4" />
          </MenuSubmenu>
        </MenuSubmenu>
        <MenuSep />
        <MenuCommand commands={commands} id="settings.open" label="Settings…" />
      </Menu>

      <Menu id="image" label="Image">
        <MenuCommand commands={commands} id="image.imageSize" />
        <MenuCommand commands={commands} id="image.crop" />
        <MenuCommand commands={commands} id="image.trim" />
        <MenuCommand commands={commands} id="image.canvasSize" />
        <MenuSep />
        <MenuLabel>Adjustments</MenuLabel>
        <MenuCommand commands={commands} id="image.adjust.brightnessContrast" />
        <MenuCommand commands={commands} id="image.adjust.hueSaturation" />
        <MenuCommand commands={commands} id="image.adjust.levels" />
      </Menu>

      <Menu id="filter" label="Filter">
        <MenuSubmenu label="Blur">
          <MenuCommand commands={commands} id="filter.blur.gaussian" />
        </MenuSubmenu>
        <MenuCommand commands={commands} id="filter.sharpen" />
        <MenuCommand commands={commands} id="filter.noise" />
        <MenuSep />
        <MenuLabel>Adjustments</MenuLabel>
        <MenuCommand commands={commands} id="filter.adjust.brightnessContrast" />
        <MenuCommand commands={commands} id="filter.adjust.hueSaturation" />
        <MenuCommand commands={commands} id="filter.adjust.levels" />
        <MenuSep />
        <MenuCommand commands={commands} id="filter.rasterize" />
      </Menu>

      <Menu id="layer" label="Layer">
        <MenuCommand commands={commands} id="layer.new" />
        <MenuCommand commands={commands} id="layer.newGroup" />
        <MenuCommand commands={commands} id="layer.duplicate" />
        <MenuCommand commands={commands} id="layer.delete" />
        <MenuCommand commands={commands} id="layer.group" />
        <MenuCommand commands={commands} id="layer.ungroup" />
        <MenuSep />
        <MenuLabel>Layer Style</MenuLabel>
        <MenuCommand commands={commands} id="layer.fx.open" />
        <MenuCommand commands={commands} id="layer.fx.dropShadow" />
        <MenuCommand commands={commands} id="layer.fx.stroke" />
        <MenuCommand commands={commands} id="layer.fx.colorOverlay" />
        <MenuCommand commands={commands} id="layer.fx.chromaKey" />
        <MenuSep />
        <MenuLabel>Mask</MenuLabel>
        <MenuCommand commands={commands} id="layer.mask.add" />
        <MenuCommand commands={commands} id="layer.mask.hideAll" />
        <MenuCommand commands={commands} id="layer.mask.disable" />
        <MenuCommand commands={commands} id="layer.mask.delete" />
        <MenuSep />
        <MenuLabel>Arrange</MenuLabel>
        <MenuCommand commands={commands} id="layer.bringToFront" />
        <MenuCommand commands={commands} id="layer.bringForward" />
        <MenuCommand commands={commands} id="layer.sendBackward" />
        <MenuCommand commands={commands} id="layer.sendToBack" />
        <MenuSep />
        <MenuCommand commands={commands} id="layer.mergeDown" />
        <MenuCommand commands={commands} id="layer.mergeVisible" />
        <MenuSep />
        <MenuCommand commands={commands} id="layer.rasterize" />
      </Menu>

      <Menu id="select" label="Select">
        <MenuCommand commands={commands} id="select.all" />
        <MenuCommand commands={commands} id="select.deselect" />
        <MenuCommand commands={commands} id="select.reselect" />
        <MenuCommand commands={commands} id="select.inverse" />
        <MenuSep />
        <MenuSubmenu label="Modify">
          <MenuCommand commands={commands} id="select.modify.feather" />
        </MenuSubmenu>
        <MenuCommand commands={commands} id="select.transformSelection" />
        <MenuSep />
        <MenuCommand
          commands={commands}
          id="tool.marquee.rect"
          label="Rectangular Marquee"
        />
        <MenuCommand
          commands={commands}
          id="tool.marquee.ellipse"
          label="Elliptical Marquee"
        />
        <MenuCommand commands={commands} id="tool.lasso.freehand" label="Lasso" />
        <MenuCommand
          commands={commands}
          id="tool.lasso.polygonal"
          label="Polygonal Lasso"
        />
        <MenuCommand
          commands={commands}
          id="tool.lasso.magnetic"
          label="Magnetic Lasso"
        />
        <MenuCommand commands={commands} id="tool.magicWand" label="Magic Wand" />
      </Menu>

      <Menu id="view" label="View">
        <MenuCommand commands={commands} id="view.zoomIn" />
        <MenuCommand commands={commands} id="view.zoomOut" />
        <MenuCommand commands={commands} id="view.fit" />
        <MenuCommand commands={commands} id="view.actualPixels" />
        <MenuSep />
        <MenuCommand commands={commands} id="view.toggleExtras" />
        <MenuCommand commands={commands} id="view.toggleRulers" label="Rulers" />
        <MenuCommand commands={commands} id="view.toggleGrid" label="Grid" />
        <MenuCommand commands={commands} id="view.togglePixelGrid" label="Pixel Grid" />
        <MenuCommand commands={commands} id="view.toggleSnap" label="Snap" />
        <MenuCommand commands={commands} id="view.togglePixelatedPreview" label="Pixelated Preview" />
        <MenuSep />
        <MenuCommand commands={commands} id="palette.toggle" label="Command Palette" />
      </Menu>

      <Menu id="window" label="Window">
        <MenuSubmenu label="Workspace">
          {listBuiltinWorkspaceItems().map((item) => (
            <MenuCommand
              key={item.commandId}
              commands={commands}
              id={item.commandId}
              label={item.title}
            />
          ))}
          <MenuSep />
          <MenuCommand commands={commands} id="workspace.reset" />
          <MenuCommand commands={commands} id="workspace.saveCurrent" />
          {customWorkspaceCommandIds.length > 0 ? <MenuSep /> : null}
          {customWorkspaceCommandIds.map((id) => (
            <MenuCommand
              key={id}
              commands={commands}
              id={id}
              label={commands.get(id)?.title.replace(/^Workspace:\s*/, '')}
            />
          ))}
        </MenuSubmenu>
        <MenuSubmenu label="Tool Presets">
          <MenuCommand commands={commands} id="toolPreset.save" label="Save Tool Preset…" />
          {toolPresetCommandIds.length > 0 ? <MenuSep /> : null}
          {toolPresetCommandIds.map((id) => (
            <MenuCommand key={id} commands={commands} id={id} />
          ))}
        </MenuSubmenu>
        <MenuSep />
        <MenuCommand commands={commands} id="panel.layers.toggle" />
        <MenuCommand commands={commands} id="panel.inspector.toggle" />
        <MenuCommand commands={commands} id="panel.history.toggle" />
        <MenuCommand commands={commands} id="panel.navigator.toggle" />
        <MenuCommand commands={commands} id="panel.info.toggle" />
        <MenuCommand commands={commands} id="panel.effects.toggle" />
        <MenuSep />
        <MenuCommand commands={commands} id="panel.character.toggle" />
        <MenuCommand commands={commands} id="panel.paragraph.toggle" />
        <MenuCommand commands={commands} id="panel.paths.toggle" />
        <MenuSep />
        <MenuCommand commands={commands} id="panel.swatches.toggle" />
        <MenuCommand commands={commands} id="panel.brushes.toggle" />
      </Menu>

      <Menu id="help" label="Help">
        <MenuCommand
          commands={commands}
          id="help.shortcuts"
          label="Keyboard Shortcuts…"
        />
        <MenuSep />
        <MenuCommand commands={commands} id="about.open" label="About" />
      </Menu>
    </>
  )
}

type Props = {
  title?: string
  status?: string
  tools?: ReactNode
  /** Right-aligned chrome before status (e.g. workspace dropdown). */
  trailing?: ReactNode
  /** When set (and `children` omitted), renders PhotoshopMenus. */
  commands?: CommandRegistry
  /** Saved workspace command ids shown under Window → Workspace. */
  customWorkspaceCommandIds?: string[]
  /** Saved tool preset apply command ids shown under Window → Tool Presets. */
  toolPresetCommandIds?: string[]
  children?: ReactNode
}

export function TitleBar({
  title = 'Happy Shop',
  status,
  tools,
  trailing,
  commands,
  customWorkspaceCommandIds,
  toolPresetCommandIds,
  children,
}: Props) {
  const menus =
    children ??
    (commands ? (
      <PhotoshopMenus
        commands={commands}
        customWorkspaceCommandIds={customWorkspaceCommandIds}
        toolPresetCommandIds={toolPresetCommandIds}
      />
    ) : null)

  return (
    <header className={styles.bar}>
      <span className={styles.brand} title={title}>
        <img
          className={styles.appLogo}
          src={appLogo}
          alt=""
          width={16}
          height={16}
          draggable={false}
          aria-hidden
        />
        <AssistantMascot size={18} title="Happy Shop mascot" className={styles.mascot} />
        <span className={styles.title}>{title}</span>
      </span>
      {menus ? <MenuBar>{menus}</MenuBar> : <div className={styles.menus} />}
      {trailing || tools || status ? (
        <div className={styles.trailing}>
          {trailing}
          {tools ? <div className={styles.tools}>{tools}</div> : null}
          {status ? <span className={styles.status}>{status}</span> : null}
        </div>
      ) : null}
    </header>
  )
}
