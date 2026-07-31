import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import {
  ArrowsOutCardinal,
  CaretDown,
  CaretRight,
  Eye,
  EyeSlash,
  FolderSimple,
  Image,
  LockSimple,
  LockSimpleOpen,
  PaintBrush,
  Sparkle,
  SquareHalf,
  TextT,
} from '@phosphor-icons/react'
import { BLEND_MODES, type BlendMode, type LayerId } from '../../../core/document'
import { FlyoutSliderField } from '../../../ui/base/FlyoutSliderField'
import {
  ContextMenu,
  ctxCommand,
  ctxSep,
  type ContextMenuItem,
} from '../../../ui/shell/ContextMenu'
import { useEditorContext } from '../../state/EditorContext'
import { LayersActionBar } from './LayersActionBar'
import { LayerThumbnail } from './LayerThumbnail'
import { hasTextLayerBadge } from './layerBadges'
import { toggleExpandedFx } from './layersFxTree'
import styles from './LayersPanel.module.css'
import type { LayersPanelLayer, LayersPanelProps } from './types'
import { useSessionLayersAdapter } from './useSessionLayersAdapter'
import { beginTextEditSession } from '../../tools/text/textCommands'

function layerSwatchColor(layer: LayersPanelLayer): string {
  // Fallback for mock adapters / missing session layers.
  let hash = 0
  for (let i = 0; i < layer.id.length; i += 1) hash = (hash * 31 + layer.id.charCodeAt(i)) | 0
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 45%, 45%)`
}

function visibleRows(
  layers: LayersPanelLayer[],
  collapsed: ReadonlySet<string>,
): LayersPanelLayer[] {
  const hiddenParents = new Set<string>()
  const out: LayersPanelLayer[] = []
  for (const layer of layers) {
    if (layer.parentId && (collapsed.has(layer.parentId) || hiddenParents.has(layer.parentId))) {
      hiddenParents.add(layer.id)
      continue
    }
    out.push(layer)
  }
  return out
}

type PanelMenu =
  | { kind: 'layer'; x: number; y: number }
  | { kind: 'empty'; x: number; y: number }

export function LayersPanel({
  adapter: adapterProp,
  onOpenFx,
}: LayersPanelProps = {}) {
  const sessionAdapter = useSessionLayersAdapter()
  const adapter = adapterProp ?? sessionAdapter
  const { commands } = useEditorContext()

  const {
    layers,
    selectedLayerIds,
    selectLayer,
    toggleVisibility,
    toggleLocked,
    setLayerLockFlag,
    renameLayer,
    setOpacity,
    setFillOpacity,
    setBlendMode,
    setGroupIsolated,
    setMaskHidesEffects,
    toggleLayerEffect,
    reorderLayerEffect,
    reorderLayer,
  } = adapter

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dragOverFxIndex, setDragOverFxIndex] = useState<{
    layerId: string
    index: number
  } | null>(null)
  const [menu, setMenu] = useState<PanelMenu | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [expandedFx, setExpandedFx] = useState<Set<string>>(() => new Set())
  const dragIdRef = useRef<string | null>(null)
  const dragFxRef = useRef<{ layerId: string; effectId: string } | null>(null)

  const rows = useMemo(() => visibleRows(layers, collapsed), [layers, collapsed])

  const activeLayer =
    selectedLayerIds.length === 1
      ? (layers.find((l) => l.id === selectedLayerIds[0]) ?? null)
      : null
  const opacityPct = activeLayer ? Math.round(activeLayer.opacity * 100) : 100
  const fillPct = activeLayer ? Math.round(activeLayer.fillOpacity * 100) : 100
  const lockControls = [
    {
      flag: 'transparentPixels' as const,
      label: 'Lock transparent pixels',
      icon: PaintBrush,
    },
    {
      flag: 'imagePixels' as const,
      label: 'Lock image pixels',
      icon: Image,
    },
    {
      flag: 'position' as const,
      label: 'Lock position',
      icon: ArrowsOutCardinal,
    },
  ]

  const commitOpacity = (pct: number) => {
    if (!activeLayer) return
    setOpacity(activeLayer.id, pct / 100)
  }

  const commitFillOpacity = (pct: number) => {
    if (!activeLayer) return
    setFillOpacity(activeLayer.id, pct / 100)
  }

  const beginRename = (layer: LayersPanelLayer) => {
    setRenamingId(layer.id)
    setRenameDraft(layer.name)
  }

  const commitRename = () => {
    if (renamingId) renameLayer(renamingId, renameDraft)
    setRenamingId(null)
  }

  const onRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitRename()
    else if (e.key === 'Escape') setRenamingId(null)
  }

  const toggleCollapsed = (groupId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const toggleFxExpanded = (layerId: string) => {
    setExpandedFx((prev) => toggleExpandedFx(prev, layerId))
  }

  const onDragStart = (e: DragEvent, layerId: string) => {
    dragIdRef.current = layerId
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', layerId)
  }

  const onDragOver = (e: DragEvent, visualIndex: number) => {
    if (!dragIdRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(visualIndex)
  }

  const onDrop = (e: DragEvent, visualIndex: number) => {
    e.preventDefault()
    const draggedId = dragIdRef.current ?? e.dataTransfer.getData('text/plain')
    dragIdRef.current = null
    setDragOverIndex(null)
    if (!draggedId) return
    const dragged = layers.find((l) => l.id === draggedId)
    if (!dragged) return

    const dropBefore = rows[visualIndex]
    if (!dropBefore || dropBefore.parentId !== dragged.parentId) return

    const siblings = layers.filter((l) => l.parentId === dragged.parentId)
    const siblingVisualIndex = siblings.findIndex((l) => l.id === dropBefore.id)
    if (siblingVisualIndex < 0) return
    reorderLayer(draggedId, siblingVisualIndex)
  }

  const onDragEnd = () => {
    dragIdRef.current = null
    setDragOverIndex(null)
  }

  const onFxDragStart = (e: DragEvent, layerId: string, effectId: string) => {
    e.stopPropagation()
    dragFxRef.current = { layerId, effectId }
    e.dataTransfer.effectAllowed = 'move'
  }

  const onFxDrop = (e: DragEvent, layer: LayersPanelLayer, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    const dragged = dragFxRef.current
    dragFxRef.current = null
    setDragOverFxIndex(null)
    if (!dragged || dragged.layerId !== layer.id) return
    const fromIndex = layer.effects.findIndex((effect) => effect.id === dragged.effectId)
    if (fromIndex === -1 || fromIndex === index) return
    reorderLayerEffect(layer.id, fromIndex, index)
  }

  const layerMenuItems = (): ContextMenuItem[] => [
    ctxCommand(commands, 'layer.duplicate'),
    ctxCommand(commands, 'layer.delete', { danger: true }),
    ctxSep(),
    ctxCommand(commands, 'layer.group'),
    ctxCommand(commands, 'layer.ungroup'),
    ctxCommand(commands, 'layer.group.toggleIsolated'),
    ctxSep(),
    ctxCommand(commands, 'layer.mergeDown'),
    ctxCommand(commands, 'layer.mergeVisible'),
    ctxSep(),
    ctxCommand(commands, 'layer.rasterize'),
    ctxSep(),
    ctxCommand(commands, 'layer.fx.open'),
    ctxCommand(commands, 'layer.fx.copy'),
    ctxCommand(commands, 'layer.fx.paste'),
    ctxSep(),
    ctxCommand(commands, 'layer.bringToFront'),
    ctxCommand(commands, 'layer.bringForward'),
    ctxCommand(commands, 'layer.sendBackward'),
    ctxCommand(commands, 'layer.sendToBack'),
  ]

  const emptyMenuItems = (): ContextMenuItem[] => [
    ctxCommand(commands, 'layer.new'),
    ctxCommand(commands, 'layer.newGroup'),
    ctxCommand(commands, 'edit.paste'),
  ]

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <select
          className={styles.blendSelect}
          disabled={!activeLayer}
          value={activeLayer?.blendMode ?? 'normal'}
          onChange={(e) => {
            if (activeLayer) setBlendMode(activeLayer.id, e.target.value as BlendMode)
          }}
          aria-label="Blend mode"
        >
          {BLEND_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
        {activeLayer?.kind === 'group' ? (
          <label
            className={styles.isolationToggle}
            title="Flatten this group before applying its blend mode, opacity, mask, and layer effects"
          >
            <input
              type="checkbox"
              checked={activeLayer.isolated ?? false}
              onChange={(e) => setGroupIsolated(activeLayer.id, e.target.checked)}
            />
            Isolated
          </label>
        ) : null}
        {activeLayer?.hasMask && activeLayer.maskEnabled ? (
          <label
            className={styles.isolationToggle}
            title="When checked, the layer mask clips layer effects (Photoshop Mask Hides Effects)"
          >
            <input
              type="checkbox"
              checked={activeLayer.maskHidesEffects}
              onChange={(e) => setMaskHidesEffects(activeLayer.id, e.target.checked)}
            />
            Mask clips FX
          </label>
        ) : null}
        <div className={styles.opacityStack}>
          <FlyoutSliderField
            className={styles.opacityField}
            label="Opacity"
            disabled={!activeLayer}
            min={0}
            max={100}
            step={1}
            unit="%"
            defaultValue={100}
            value={opacityPct}
            onChange={commitOpacity}
          />
          <FlyoutSliderField
            className={styles.opacityField}
            label="Fill"
            disabled={!activeLayer}
            min={0}
            max={100}
            step={1}
            unit="%"
            defaultValue={100}
            value={fillPct}
            onChange={commitFillOpacity}
          />
        </div>
      </div>

      <div className={styles.lockHeader} aria-label="Layer lock controls">
        <span className={styles.lockLabel}>Lock:</span>
        {lockControls.map(({ flag, label, icon: Icon }) => (
          <button
            key={flag}
            type="button"
            className={`${styles.lockButton}${
              activeLayer?.lockFlags[flag] ? ` ${styles.lockButtonActive}` : ''
            }`}
            disabled={!activeLayer}
            title={label}
            aria-label={label}
            aria-pressed={activeLayer?.lockFlags[flag] ?? false}
            onClick={() => {
              if (activeLayer) {
                setLayerLockFlag(
                  activeLayer.id,
                  flag,
                  !activeLayer.lockFlags[flag],
                )
              }
            }}
          >
            <Icon size={14} />
          </button>
        ))}
        <button
          type="button"
          className={`${styles.lockButton}${
            activeLayer?.locked ? ` ${styles.lockButtonActive}` : ''
          }`}
          disabled={!activeLayer}
          title="Lock all layer properties"
          aria-label="Lock all layer properties"
          aria-pressed={activeLayer?.locked ?? false}
          onClick={() => {
            if (activeLayer) toggleLocked(activeLayer.id)
          }}
        >
          <LockSimple size={14} />
        </button>
      </div>

      <div
        className={styles.list}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ kind: 'empty', x: e.clientX, y: e.clientY })
        }}
      >
        {rows.length === 0 && <div className={styles.empty}>No layers</div>}
        {rows.map((layer, index) => {
          const selected = selectedLayerIds.includes(layer.id)
          const isRenaming = renamingId === layer.id
          const isGroup = layer.kind === 'group'
          const isCollapsed = collapsed.has(layer.id)
          const fxExpanded = expandedFx.has(layer.id)
          return (
            <div key={layer.id}>
              <div
                className={`${styles.row}${selected ? ` ${styles.selected}` : ''}${
                  dragOverIndex === index ? ` ${styles.dragOver}` : ''
                }`}
                style={{ paddingLeft: `${0.35 + layer.depth * 0.85}rem` }}
                draggable
                onDragStart={(e) => onDragStart(e, layer.id)}
                onDragOver={(e) => onDragOver(e, index)}
                onDrop={(e) => onDrop(e, index)}
                onDragEnd={onDragEnd}
                onClick={(e) => selectLayer(layer.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                onDoubleClick={() => {
                  if (hasTextLayerBadge(layer)) beginTextEditSession(layer.id as LayerId)
                  else beginRename(layer)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (!selectedLayerIds.includes(layer.id)) {
                    selectLayer(layer.id)
                  }
                  setMenu({ kind: 'layer', x: e.clientX, y: e.clientY })
                }}
              >
                {isGroup ? (
                  <button
                    type="button"
                    className={styles.iconToggle}
                    title={isCollapsed ? 'Expand group' : 'Collapse group'}
                    aria-expanded={!isCollapsed}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleCollapsed(layer.id)
                    }}
                  >
                    {isCollapsed ? <CaretRight size={12} /> : <CaretDown size={12} />}
                  </button>
                ) : (
                  <span className={styles.depthSpacer} aria-hidden="true" />
                )}
                <button
                  type="button"
                  className={styles.iconToggle}
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleVisibility(layer.id)
                  }}
                >
                  {layer.visible ? <Eye size={14} /> : <EyeSlash size={14} />}
                </button>
                <button
                  type="button"
                  className={styles.iconToggle}
                  title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleLocked(layer.id)
                  }}
                >
                  {layer.locked ? <LockSimple size={14} /> : <LockSimpleOpen size={14} />}
                </button>
                {isGroup ? (
                  <span className={`${styles.thumb} ${styles.groupThumb}`}>
                    <FolderSimple size={18} weight="fill" />
                  </span>
                ) : (
                  <LayerThumbnail
                    layerId={layer.id}
                    fallbackSwatch={layerSwatchColor(layer)}
                  />
                )}
                {hasTextLayerBadge(layer) ? (
                  <span
                    className={`${styles.maskBadge} ${styles.textBadge}`}
                    title="Text layer"
                    aria-label="Text layer"
                  >
                    <TextT size={12} weight="bold" />
                  </span>
                ) : null}
                {layer.hasMask ? (
                  <span
                    className={`${styles.maskBadge}${
                      layer.maskEnabled ? '' : ` ${styles.maskBadgeDisabled}`
                    }`}
                    title={layer.maskEnabled ? 'Layer mask' : 'Layer mask (disabled)'}
                    aria-label={layer.maskEnabled ? 'Layer mask' : 'Layer mask disabled'}
                  >
                    <SquareHalf size={12} />
                  </span>
                ) : null}
                {layer.hasEffects ? (
                  <button
                    type="button"
                    className={styles.iconToggle}
                    title={fxExpanded ? 'Collapse effects' : 'Expand effects'}
                    aria-expanded={fxExpanded}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFxExpanded(layer.id)
                    }}
                  >
                    {fxExpanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
                  </button>
                ) : (
                  <span className={styles.depthSpacer} aria-hidden="true" />
                )}
                <button
                  type="button"
                  className={`${styles.fxBtn}${layer.hasEffects ? ` ${styles.fxActive}` : ''}`}
                  title="Layer Style"
                  aria-label="Layer Style"
                  onClick={(e) => {
                    e.stopPropagation()
                    selectLayer(layer.id)
                    onOpenFx?.(layer.id)
                  }}
                >
                  <Sparkle size={12} />
                </button>
                {isRenaming ? (
                  <input
                    autoFocus
                    className={styles.renameInput}
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={onRenameKeyDown}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className={styles.name}>{layer.name}</span>
                )}
              </div>
              {layer.hasEffects && fxExpanded
                ? layer.effects.map((effect, effectIndex) => (
                    <div
                      key={effect.id}
                      className={`${styles.fxRow}${
                        !effect.enabled ? ` ${styles.fxRowDisabled}` : ''
                      }${
                        dragOverFxIndex?.layerId === layer.id &&
                        dragOverFxIndex.index === effectIndex
                          ? ` ${styles.fxRowDragOver}`
                          : ''
                      }`}
                      style={{ paddingLeft: `${1.2 + layer.depth * 0.85}rem` }}
                      draggable
                      onDragStart={(e) => onFxDragStart(e, layer.id, effect.id)}
                      onDragOver={(e) => {
                        if (!dragFxRef.current || dragFxRef.current.layerId !== layer.id) return
                        e.preventDefault()
                        e.stopPropagation()
                        e.dataTransfer.dropEffect = 'move'
                        setDragOverFxIndex({ layerId: layer.id, index: effectIndex })
                      }}
                      onDrop={(e) => onFxDrop(e, layer, effectIndex)}
                      onDragEnd={() => {
                        dragFxRef.current = null
                        setDragOverFxIndex(null)
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        selectLayer(layer.id)
                      }}
                    >
                      <span className={styles.fxHandle} aria-hidden="true">
                        ⠿
                      </span>
                      <button
                        type="button"
                        className={styles.iconToggle}
                        title={effect.enabled ? 'Disable effect' : 'Enable effect'}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleLayerEffect(layer.id, effect.id)
                        }}
                      >
                        {effect.enabled ? <Eye size={13} /> : <EyeSlash size={13} />}
                      </button>
                      <span className={styles.fxName}>{effect.label}</span>
                      {effect.blendSummary ? (
                        <span className={styles.fxBlend}>{effect.blendSummary}</span>
                      ) : null}
                    </div>
                  ))
                : null}
            </div>
          )
        })}
      </div>

      <LayersActionBar commands={commands} />

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.kind === 'layer' ? layerMenuItems() : emptyMenuItems()}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  )
}
