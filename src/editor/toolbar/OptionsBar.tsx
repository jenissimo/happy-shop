import {
  TextB,
  TextItalic,
  TextUnderline,
  TextAlignLeft,
  TextAlignCenter,
  TextAlignRight,
  TextAlignJustify,
  IntersectSquare,
  MinusSquare,
  PlusSquare,
  Selection,
} from '@phosphor-icons/react'
import { useEffect } from 'react'
import type { CssColor, TextAlign } from '../../core/document'
import { ColorSwatchButton } from '../../ui/base/ColorPicker'
import type { SelectionCombineMode } from '../session/SelectionMask'
import { BrushOptionsControls } from '../tools/brush/BrushOptionsControls'
import { ToolPresetsPopover } from '../tools/ToolPresetsPopover'
import { OptionsMore } from './OptionsMore'
import { useRetouchSettingsStore } from '../tools/retouch/retouchSettingsStore'
import { isLiquifyTool, liquifyHintForTool } from '../tools/liquify/liquifyTools'
import { MoveOptionsControls } from '../tools/move/MoveOptionsControls'
import { useShapeToolStore } from '../tools/shape/shapeToolStore'
import { SvgShapeImportButton } from '../tools/shape/SvgShapeImportButton'
import { usePenToolStore } from '../tools/pen/penToolStore'
import {
  fillPath,
  pathToSelection,
  strokePathWithBrush,
} from '../tools/pen/penPathOps'
import { penPathIsFillable, penPathIsStrokable } from '../tools/pen/penPath'
import { resolvePenPathForOps } from '../tools/paths/pathDocumentSync'
import { FlyoutSliderField } from '../../ui/base/FlyoutSliderField'
import {
  applyTextOptionsToSelected,
  syncTextOptionsFromLayer,
} from '../tools/text/textCommands'
import { FontFamilyControl } from '../tools/text/FontFamilyControl'
import { GradientRamp } from '../../ui/features/layer-style/GradientRamp'
import { PatternGrid } from '../../ui/features/layer-style/PatternGrid'
import { useGradientToolStore } from '../tools/gradient/gradientToolStore'
import { documentHistory } from '../session/documentHistory'
import { detectDocumentScripts } from '../tools/text/googleFonts/scriptDetect'
import { useTextToolStore } from '../tools/text/textToolStore'
import { textEditChromeProps } from '../tools/text/textEditingChrome'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { usePaletteStore } from '../color/paletteStore'
import { useColorStore } from '../color/colorStore'
import { useSelectionToolStore } from '../session/selectionToolStore'
import {
  MAX_CAGE_FEATHER_RADIUS,
  setCageFeatherRadius,
  useCageTransformStore,
} from '../tools/transform/cageTransform'
import { useFillToolStore } from '../tools/fill/fillToolStore'
import {
  getToolDef,
  lassoTitle,
  marqueeTitle,
  pathSelectTitle,
  penTitle,
} from './tools'
import styles from './OptionsBar.module.css'

const COMBINE_MODES: Array<{
  id: SelectionCombineMode
  title: string
  icon: typeof Selection
}> = [
  { id: 'new', title: 'New selection', icon: Selection },
  { id: 'add', title: 'Add to selection', icon: PlusSquare },
  { id: 'subtract', title: 'Subtract from selection', icon: MinusSquare },
  { id: 'intersect', title: 'Intersect with selection', icon: IntersectSquare },
]

/** Context-sensitive options bar under the menu (PS grammar). */
export function OptionsBar() {
  const activeToolId = useEditorSessionStore((s) => s.activeToolId)
  const historyVersion = useEditorSessionStore((s) => s.historyVersion)
  const selectedLayerIds = useEditorSessionStore((s) => s.selectedLayerIds)
  const document = useEditorSessionStore((s) => s.document)
  const tool = getToolDef(activeToolId)
  const options = useTextToolStore((s) => s.options)
  const shapeOptions = useShapeToolStore((s) => s.options)
  const setShapeOptions = useShapeToolStore((s) => s.setOptions)
  const penOptions = usePenToolStore((s) => s.options)
  const setPenOptions = usePenToolStore((s) => s.setOptions)
  const opsPath = resolvePenPathForOps()
  const marqueeShape = useSelectionToolStore((s) => s.marqueeShape)
  const marqueeStyle = useSelectionToolStore((s) => s.marqueeStyle)
  const setMarqueeStyle = useSelectionToolStore((s) => s.setMarqueeStyle)
  const fixedMarqueeWidth = useSelectionToolStore((s) => s.fixedMarqueeWidth)
  const fixedMarqueeHeight = useSelectionToolStore((s) => s.fixedMarqueeHeight)
  const setFixedMarqueeSize = useSelectionToolStore((s) => s.setFixedMarqueeSize)
  const lassoMode = useSelectionToolStore((s) => s.lassoMode)
  const combineMode = useSelectionToolStore((s) => s.combineMode)
  const setCombineMode = useSelectionToolStore((s) => s.setCombineMode)
  const featherRadius = useSelectionToolStore((s) => s.featherRadius)
  const setFeatherRadius = useSelectionToolStore((s) => s.setFeatherRadius)
  const antiAlias = useSelectionToolStore((s) => s.antiAlias)
  const setAntiAlias = useSelectionToolStore((s) => s.setAntiAlias)
  const wandTolerance = useSelectionToolStore((s) => s.wandTolerance)
  const setWandTolerance = useSelectionToolStore((s) => s.setWandTolerance)
  const fillTolerance = useFillToolStore((s) => s.tolerance)
  const fillAntiAlias = useFillToolStore((s) => s.antiAlias)
  const setFillPrefs = useFillToolStore((s) => s.setPrefs)
  const retouchSize = useRetouchSettingsStore((s) => s.size)
  const retouchStrength = useRetouchSettingsStore((s) => s.strength)
  const retouchAligned = useRetouchSettingsStore((s) => s.aligned)
  const retouchSampleAllLayers = useRetouchSettingsStore((s) => s.sampleAllLayers)
  const retouchHistorySourceDepth = useRetouchSettingsStore((s) => s.historySourceDepth)
  const retouchPatternKind = useRetouchSettingsStore((s) => s.patternKind)
  const retouchPatternScale = useRetouchSettingsStore((s) => s.patternScale)
  const retouchPatternAngle = useRetouchSettingsStore((s) => s.patternAngle)
  const retouchPatternInvert = useRetouchSettingsStore((s) => s.patternInvert)
  const retouchRange = useRetouchSettingsStore((s) => s.range)
  const retouchProtectTones = useRetouchSettingsStore((s) => s.protectTones)
  const retouchSpongeMode = useRetouchSettingsStore((s) => s.spongeMode)
  const setRetouchPrefs = useRetouchSettingsStore((s) => s.setPrefs)
  const gradientOptions = useGradientToolStore((s) => s.options)
  const setGradientOptions = useGradientToolStore((s) => s.setOptions)
  const cageSession = useCageTransformStore((s) => s.session)
  const cageFeatherRadius = cageSession?.featherRadius ?? 0
  const snapToPalette = usePaletteStore((s) => s.snapToPalette)
  const setSnapToPalette = usePaletteStore((s) => s.setSnapToPalette)
  const foreground = useColorStore((s) => s.foreground)
  const setForeground = useColorStore((s) => s.setForeground)

  const onToggleSnapToPalette = (enabled: boolean) => {
    setSnapToPalette(enabled)
    setForeground(foreground)
  }

  const selected =
    selectedLayerIds.length === 1
      ? (document.layers[selectedLayerIds[0]!] ?? null)
      : null
  const showTextOptions =
    activeToolId === 'text' || selected?.type === 'text'
  const showShapeOptions = activeToolId === 'shape'
  const showPenOptions =
    activeToolId === 'pen' ||
    activeToolId === 'freeformPen' ||
    activeToolId === 'addAnchor' ||
    activeToolId === 'deleteAnchor' ||
    activeToolId === 'convertPoint' ||
    activeToolId === 'directSelection' ||
    activeToolId === 'pathSelection'
  const showSelectionOptions =
    activeToolId === 'marquee' ||
    activeToolId === 'lasso' ||
    activeToolId === 'magicWand'

  const toolName =
    activeToolId === 'marquee'
      ? marqueeTitle(marqueeShape)
      : activeToolId === 'lasso'
        ? lassoTitle(lassoMode)
        : activeToolId === 'pathSelection' || activeToolId === 'directSelection'
          ? pathSelectTitle(activeToolId)
          : activeToolId === 'pen' ||
              activeToolId === 'freeformPen' ||
              activeToolId === 'addAnchor' ||
              activeToolId === 'deleteAnchor' ||
              activeToolId === 'convertPoint'
            ? penTitle(activeToolId)
            : (tool?.title ?? 'Tool')
  const documentScripts = detectDocumentScripts(
    Object.values(document.layers).filter((layer) => layer.type === 'text'),
  )

  // The options bar is also the shared model for docked Character/Paragraph.
  // Refresh it on layer selection even if Properties is closed.
  useEffect(() => {
    if (selected?.type === 'text') syncTextOptionsFromLayer(selected)
  }, [selected])

  void historyVersion
  const historyUndoLabels = documentHistory.listUndoLabels()

  return (
    <div
      className={styles.bar}
      role="toolbar"
      aria-label="Tool options"
      {...textEditChromeProps}
    >
      <span className={styles.toolName}>{cageSession ? 'Cage Transform' : toolName}</span>
      {cageSession ? (
        <div className={styles.textOpts}>
          <label className={styles.hint} title="Feather radius at the cage boundary">
            Feather
            <input
              className={styles.size}
              type="number"
              min={0}
              max={MAX_CAGE_FEATHER_RADIUS}
              step={0.5}
              value={cageFeatherRadius}
              onChange={(e) => {
                void setCageFeatherRadius(Number(e.target.value))
              }}
            />
            px
          </label>
          <span className={styles.hint}>Drag points · click edge add · Alt+click remove · Enter commit · Esc cancel</span>
        </div>
      ) : null}
      {(activeToolId === 'brush' || activeToolId === 'pencil' || activeToolId === 'eraser') && (
        <>
          <BrushOptionsControls
            layout="bar"
            variant={activeToolId === 'pencil' ? 'pencil' : 'brush'}
          />
          <ToolPresetsPopover layout="bar" />
          {(activeToolId === 'brush' || activeToolId === 'pencil') && (
            <label
              className={styles.hint}
              title="Restrict foreground to nearest color in the active Lospec palette"
            >
              <input
                type="checkbox"
                checked={snapToPalette}
                onChange={(e) => onToggleSnapToPalette(e.target.checked)}
              />{' '}
              Snap to palette
            </label>
          )}
        </>
      )}
      {(activeToolId === 'cloneStamp' || activeToolId === 'historyBrush' || activeToolId === 'patternStamp' || activeToolId === 'spotHealing' || activeToolId === 'healingBrush' || activeToolId === 'smudge' || activeToolId === 'blur' || activeToolId === 'sharpen' || activeToolId === 'dodge' || activeToolId === 'burn' || activeToolId === 'sponge' || isLiquifyTool(activeToolId)) && (
        <div className={styles.textOpts}>
          <FlyoutSliderField
            label="Size"
            value={retouchSize}
            min={1}
            max={500}
            step={1}
            unit="px"
            defaultValue={40}
            onChange={(size) => setRetouchPrefs({ size })}
          />
          <FlyoutSliderField
            label={activeToolId === 'dodge' || activeToolId === 'burn' ? 'Exposure' : activeToolId === 'sponge' ? 'Flow' : 'Strength'}
            value={Math.round(retouchStrength * 100)}
            min={1}
            max={100}
            step={1}
            unit="%"
            defaultValue={50}
            onChange={(strength) => setRetouchPrefs({ strength: strength / 100 })}
          />
          {(activeToolId === 'dodge' || activeToolId === 'burn') && (
            <>
              <select
                className={styles.select}
                value={retouchRange}
                title="Range"
                aria-label="Range"
                onChange={(e) => setRetouchPrefs({ range: e.target.value as 'shadows' | 'midtones' | 'highlights' })}
              >
                <option value="shadows">Shadows</option>
                <option value="midtones">Midtones</option>
                <option value="highlights">Highlights</option>
              </select>
            </>
          )}
          {activeToolId === 'sponge' && (
            <select
              className={styles.select}
              value={retouchSpongeMode}
              title="Sponge mode"
              aria-label="Sponge mode"
              onChange={(e) => setRetouchPrefs({ spongeMode: e.target.value as 'desaturate' | 'saturate' })}
            >
              <option value="desaturate">Desaturate</option>
              <option value="saturate">Saturate</option>
            </select>
          )}
          {activeToolId === 'cloneStamp' || activeToolId === 'healingBrush'
            ? <span className={styles.hint}>Alt-click source · Paint destination</span>
            : activeToolId === 'historyBrush'
              ? <span className={styles.hint}>{retouchHistorySourceDepth === 'capture' ? 'Captures this layer on first use · paints that snapshot' : 'Paints from the selected history state'}</span>
              : activeToolId === 'patternStamp'
                ? <span className={styles.hint}>Paint the selected procedural pattern</span>
                : <span className={styles.hint}>{activeToolId === 'sharpen' ? 'Paint to sharpen local detail' : activeToolId === 'sponge' ? (retouchSpongeMode === 'saturate' ? 'Paint to saturate local color' : 'Paint to desaturate local color') : isLiquifyTool(activeToolId) ? liquifyHintForTool(activeToolId) : activeToolId === 'dodge' || activeToolId === 'burn' ? `Paint ${retouchRange}${retouchProtectTones ? ' · protect tones' : ''}` : `Paint to ${activeToolId === 'spotHealing' ? 'blend local texture' : activeToolId}`}</span>}
          <OptionsMore label={`${toolName} details`}>
            {(activeToolId === 'dodge' || activeToolId === 'burn') && (
              <label className={styles.hint} title="Preserve hue while adjusting exposure">
                <input type="checkbox" checked={retouchProtectTones} onChange={(e) => setRetouchPrefs({ protectTones: e.target.checked })} />
                Protect Tones
              </label>
            )}
            {activeToolId === 'historyBrush' && (
              <select className={styles.select} value={retouchHistorySourceDepth === 'capture' ? 'capture' : String(retouchHistorySourceDepth)} aria-label="History source" onChange={(e) => {
                const value = e.target.value
                setRetouchPrefs({ historySourceDepth: value === 'capture' ? 'capture' : Math.max(0, Number(value) || 0) })
              }}>
                <option value="capture">Capture on first use</option><option value="0">Document Open</option>
                {historyUndoLabels.map((label, index) => <option key={`${index}:${label}`} value={String(index + 1)}>{label}</option>)}
              </select>
            )}
            {activeToolId === 'patternStamp' && (
              <PatternGrid pattern={retouchPatternKind} scale={retouchPatternScale} angle={retouchPatternAngle} invert={retouchPatternInvert} onChange={(patch) => setRetouchPrefs({ ...(patch.pattern !== undefined ? { patternKind: patch.pattern } : {}), ...(patch.scale !== undefined ? { patternScale: patch.scale } : {}), ...(patch.angle !== undefined ? { patternAngle: patch.angle } : {}), ...(patch.invert !== undefined ? { patternInvert: patch.invert } : {}) })} />
            )}
            {(activeToolId === 'cloneStamp' || activeToolId === 'healingBrush') && <>
              <label className={styles.hint}><input type="checkbox" checked={retouchAligned} onChange={(e) => setRetouchPrefs({ aligned: e.target.checked })} /> Aligned</label>
              <label className={styles.hint}><input type="checkbox" checked={retouchSampleAllLayers} onChange={(e) => setRetouchPrefs({ sampleAllLayers: e.target.checked })} /> Sample All Layers</label>
            </>}
          </OptionsMore>
          <ToolPresetsPopover layout="bar" />
        </div>
      )}
      {showSelectionOptions && (
        <div className={styles.textOpts}>
          {COMBINE_MODES.map(({ id, title, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={
                combineMode === id ? styles.toggleOn : styles.toggle
              }
              title={title}
              aria-pressed={combineMode === id}
              onClick={() => setCombineMode(id)}
            >
              <Icon size={14} />
            </button>
          ))}
          {activeToolId === 'marquee' && (
            <>
              <select
                className={styles.select}
                value={marqueeStyle}
                title="Marquee style"
                aria-label="Marquee style"
                onChange={(e) =>
                  setMarqueeStyle(e.target.value as typeof marqueeStyle)
                }
              >
                <option value="normal">Normal</option>
                <option value="fixedSize">Fixed Size</option>
                <option value="singleRow">Single Row</option>
                <option value="singleColumn">Single Column</option>
                <option value="singlePixel">Single Pixel</option>
              </select>
              {marqueeStyle === 'fixedSize' && (
                <>
                  <label className={styles.hint} title="Fixed width">
                    W
                    <input
                      className={styles.size}
                      type="number"
                      min={1}
                      max={10000}
                      value={fixedMarqueeWidth}
                      onChange={(e) =>
                        setFixedMarqueeSize(
                          Number(e.target.value) || 1,
                          fixedMarqueeHeight,
                        )
                      }
                    />
                  </label>
                  <label className={styles.hint} title="Fixed height">
                    H
                    <input
                      className={styles.size}
                      type="number"
                      min={1}
                      max={10000}
                      value={fixedMarqueeHeight}
                      onChange={(e) =>
                        setFixedMarqueeSize(
                          fixedMarqueeWidth,
                          Number(e.target.value) || 1,
                        )
                      }
                    />
                  </label>
                </>
              )}
              <span className={styles.hint}>
                M / Shift+M cycle Rectangular ↔ Elliptical · Shift-before add · Shift-drag 1:1 · Alt-before subtract · Alt-drag center
              </span>
            </>
          )}
          {activeToolId === 'lasso' && (
            <>
              <span className={styles.hint}>
                {lassoMode === 'polygonal'
                  ? 'Click points · Double-click / Enter close · Esc cancel'
                  : lassoMode === 'magnetic'
                    ? 'Drag along edges · L / Shift+L cycle'
                    : 'Drag freehand · L / Shift+L cycle'}
              </span>
            </>
          )}
          {activeToolId === 'magicWand' && (
            <>
              <label className={styles.hint} title="Tolerance">
                Tol
                <input
                  className={styles.size}
                  type="number"
                  min={0}
                  max={255}
                  value={wandTolerance}
                  onChange={(e) =>
                    setWandTolerance(Number(e.target.value) || 0)
                  }
                />
              </label>
              <span className={styles.hint}>Click to select similar</span>
            </>
          )}
          <OptionsMore label="Selection edge details">
            <SelectionEdgeOptions featherRadius={featherRadius} antiAlias={antiAlias} onFeatherChange={setFeatherRadius} onAntiAliasChange={setAntiAlias} />
          </OptionsMore>
        </div>
      )}
      {activeToolId === 'paintBucket' && (
        <div className={styles.textOpts}>
          <label className={styles.hint} title="Color tolerance">
            Tol
            <input
              className={styles.size}
              type="number"
              min={0}
              max={255}
              value={fillTolerance}
              onChange={(e) => setFillPrefs({ tolerance: Number(e.target.value) || 0 })}
            />
          </label>
          <span className={styles.hint}>Click a contiguous region · uses foreground color</span>
          <OptionsMore label="Paint Bucket details">
            <label className={styles.hint} title="Soften the tolerance edge">
              <input type="checkbox" checked={fillAntiAlias} onChange={(e) => setFillPrefs({ antiAlias: e.target.checked })} />
              Anti-alias
            </label>
          </OptionsMore>
        </div>
      )}
      {activeToolId === 'crop' && (
        <span className={styles.hint}>
          Drag crop region · Shift 1:1 · Alt from center · Image → Crop commits
        </span>
      )}
      {activeToolId === 'gradient' && (
        <div className={styles.textOpts}>
          <GradientRamp
            gradient={gradientOptions.gradient}
            onChange={(gradient) => setGradientOptions({ gradient })}
          />
          <select
            className={styles.select}
            value={gradientOptions.style}
            title="Gradient style"
            aria-label="Gradient style"
            onChange={(event) =>
              setGradientOptions({
                style: event.target.value as typeof gradientOptions.style,
              })
            }
          >
            <option value="linear">Linear</option>
            <option value="radial">Radial</option>
          </select>
          <FlyoutSliderField
            label="Opacity"
            value={Math.round(gradientOptions.opacity * 100)}
            min={0}
            max={100}
            step={1}
            unit="%"
            defaultValue={100}
            onChange={(opacity) => setGradientOptions({ opacity: opacity / 100 })}
          />
          <span className={styles.hint}>Drag to fill active layer or selection</span>
          <OptionsMore label="Gradient details">
            <label className={styles.hint}>
              <input type="checkbox" checked={gradientOptions.reverse} onChange={(event) => setGradientOptions({ reverse: event.target.checked })} />
              Reverse
            </label>
          </OptionsMore>
        </div>
      )}
      {activeToolId === 'move' && <MoveOptionsControls />}
      {showShapeOptions && (
        <div className={styles.textOpts}>
          <select
            className={styles.select}
            value={
              shapeOptions.primitive === 'rect' && shapeOptions.cornerRadius > 0
                ? 'rounded-rect'
                : shapeOptions.primitive
            }
            title="Shape"
            onChange={(e) =>
              setShapeOptions({
                primitive:
                  e.target.value === 'rounded-rect'
                    ? 'rect'
                    : (e.target.value as typeof shapeOptions.primitive),
                ...(e.target.value === 'rounded-rect' && shapeOptions.cornerRadius === 0
                  ? { cornerRadius: 16 }
                  : {}),
              })
            }
            onMouseDown={(e) => e.stopPropagation()}
          >
            <option value="rect">Rectangle</option>
            <option value="rounded-rect">Rounded Rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="polygon">Polygon</option>
            <option value="star">Star</option>
            <option value="line">Line</option>
            <option value="arrow">Arrow</option>
          </select>
          <label className={styles.hint} title="Fill">
            <input
              type="checkbox"
              checked={shapeOptions.fillEnabled}
              onChange={(e) => setShapeOptions({ fillEnabled: e.target.checked })}
            />{' '}
            Fill
          </label>
          <ColorSwatchButton
            className={styles.color}
            value={shapeOptions.fillColor}
            title="Fill color"
            disabled={!shapeOptions.fillEnabled}
            size="sm"
            pickerTitle="Fill Color"
            onChange={(c) => setShapeOptions({ fillColor: c as CssColor })}
          />
          <label className={styles.hint} title="Stroke">
            <input
              type="checkbox"
              checked={shapeOptions.strokeEnabled}
              onChange={(e) =>
                setShapeOptions({ strokeEnabled: e.target.checked })
              }
            />{' '}
            Stroke
          </label>
          <ColorSwatchButton
            className={styles.color}
            value={shapeOptions.strokeColor}
            title="Stroke color"
            disabled={!shapeOptions.strokeEnabled}
            size="sm"
            pickerTitle="Stroke Color"
            onChange={(c) => setShapeOptions({ strokeColor: c as CssColor })}
          />
          <span className={styles.hint}>
            Drag · Shift 1:1 · Alt from center · Click for default size
          </span>
          <OptionsMore label="Shape details">
            <SvgShapeImportButton />
            <label className={styles.hint}>Stroke width
              <input className={styles.size} type="number" min={0} max={256} value={shapeOptions.strokeWidth} disabled={!shapeOptions.strokeEnabled} onChange={(e) => setShapeOptions({ strokeWidth: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            {shapeOptions.primitive === 'rect' && <FlyoutSliderField label="Radius" value={shapeOptions.cornerRadius} min={0} max={512} unit="px" defaultValue={0} onChange={(cornerRadius) => setShapeOptions({ cornerRadius })} />}
            {shapeOptions.primitive === 'polygon' && <FlyoutSliderField label="Sides" value={shapeOptions.sides} min={3} max={32} defaultValue={5} onChange={(sides) => setShapeOptions({ sides: Math.round(sides) })} />}
            {shapeOptions.primitive === 'star' && <>
              <FlyoutSliderField label="Points" value={shapeOptions.starPoints} min={3} max={32} defaultValue={5} onChange={(starPoints) => setShapeOptions({ starPoints: Math.round(starPoints) })} />
              <FlyoutSliderField label="Inset" value={Math.round(shapeOptions.starInset * 100)} min={5} max={95} unit="%" defaultValue={50} onChange={(inset) => setShapeOptions({ starInset: inset / 100 })} />
            </>}
          </OptionsMore>
        </div>
      )}
      {showPenOptions && (
        <div className={styles.textOpts}>
          <label className={styles.hint} title="Fill path as shape layer">
            <input
              type="checkbox"
              checked={penOptions.fillEnabled}
              onChange={(e) => setPenOptions({ fillEnabled: e.target.checked })}
            />{' '}
            Fill
          </label>
          <ColorSwatchButton
            className={styles.color}
            value={penOptions.fillColor}
            title="Fill color"
            disabled={!penOptions.fillEnabled}
            size="sm"
            pickerTitle="Fill Color"
            onChange={(c) => setPenOptions({ fillColor: c as CssColor })}
          />
          <label className={styles.hint} title="Stroke on shape layer">
            <input
              type="checkbox"
              checked={penOptions.strokeEnabled}
              onChange={(e) => setPenOptions({ strokeEnabled: e.target.checked })}
            />{' '}
            Stroke
          </label>
          <ColorSwatchButton
            className={styles.color}
            value={penOptions.strokeColor}
            title="Stroke color"
            disabled={!penOptions.strokeEnabled}
            size="sm"
            pickerTitle="Stroke Color"
            onChange={(c) => setPenOptions({ strokeColor: c as CssColor })}
          />
          <span className={styles.hint}>
            Click add · drag handles · Shift 45° · Alt cusp · Cmd select · Enter/dbl-click close · Esc cancel
          </span>
          <OptionsMore label="Pen path details">
            <label className={styles.hint}>Stroke width
              <input className={styles.size} type="number" min={0} max={256} value={penOptions.strokeWidth} disabled={!penOptions.strokeEnabled} onChange={(e) => setPenOptions({ strokeWidth: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            <button type="button" className={styles.hint} disabled={!opsPath || !penPathIsFillable(opsPath)} onClick={() => { const path = resolvePenPathForOps(); if (path) pathToSelection(path) }}>Make Selection</button>
            <button type="button" className={styles.hint} disabled={!opsPath || !penPathIsFillable(opsPath)} onClick={() => { const path = resolvePenPathForOps(); if (path) fillPath(path) }}>Fill Path</button>
            <button type="button" className={styles.hint} disabled={!opsPath || !penPathIsStrokable(opsPath)} onClick={() => { const path = resolvePenPathForOps(); if (path) void strokePathWithBrush(path) }}>Stroke Path</button>
          </OptionsMore>
        </div>
      )}
      {showTextOptions && (
        <div className={styles.textOpts}>
          <FontFamilyControl
            value={options.fontFamily}
            documentScripts={documentScripts}
            buttonClassName={styles.fontButton}
            title="Browse fonts… (Installed and Google Fonts tabs)"
            onFontChange={(fontFamily) =>
              applyTextOptionsToSelected({ fontFamily, fontSource: undefined })
            }
            onGoogleFontSelect={(fontFamily, fontSource) =>
              applyTextOptionsToSelected({ fontFamily, fontSource, fontWeight: fontSource.weight })
            }
          />
          <input
            className={styles.size}
            type="number"
            min={1}
            max={1024}
            value={options.fontSize}
            title="Size"
            onChange={(e) =>
              applyTextOptionsToSelected({
                fontSize: Math.max(1, Number(e.target.value) || 1),
              })
            }
          />
          <ColorSwatchButton
            className={styles.color}
            value={options.color}
            title="Color"
            size="sm"
            pickerTitle="Text Color"
            onChange={(c) =>
              applyTextOptionsToSelected({ color: c as CssColor })
            }
          />
          <button
            type="button"
            className={options.fontWeight >= 700 ? styles.toggleOn : styles.toggle}
            title="Bold"
            onClick={() =>
              applyTextOptionsToSelected({
                fontWeight: options.fontWeight >= 700 ? 400 : 700,
              })
            }
          >
            <TextB size={14} weight="bold" />
          </button>
          <button
            type="button"
            className={options.italic ? styles.toggleOn : styles.toggle}
            title="Italic"
            onClick={() =>
              applyTextOptionsToSelected({ italic: !options.italic })
            }
          >
            <TextItalic size={14} />
          </button>
          {(
            [
              ['left', TextAlignLeft],
              ['center', TextAlignCenter],
              ['right', TextAlignRight],
              ['justify', TextAlignJustify],
            ] as const
          ).map(([align, Icon]) => (
            <button
              key={align}
              type="button"
              className={
                options.align === align ? styles.toggleOn : styles.toggle
              }
              title={`Align ${align}`}
              onClick={() =>
                applyTextOptionsToSelected({ align: align as TextAlign })
              }
            >
              <Icon size={14} />
            </button>
          ))}
          {activeToolId === 'text' && (
            <span className={styles.hint}>Click point · Drag box · Ctrl/Cmd+B/I/U style · Ctrl/Cmd+Shift+L/C/R align · Enter commits</span>
          )}
          <OptionsMore label="Text details">
            <label className={styles.hint}>Tracking
              <input className={styles.characterField} type="number" min={-200} max={500} value={options.tracking} aria-label="Tracking (1/1000 em)" onChange={(e) => applyTextOptionsToSelected({ tracking: Math.max(-200, Math.min(500, Number(e.target.value) || 0)) })} />
            </label>
            <label className={styles.hint}>Baseline
              <input className={styles.characterField} type="number" min={-200} max={200} value={options.baselineShift} aria-label="Baseline shift" onChange={(e) => applyTextOptionsToSelected({ baselineShift: Math.max(-200, Math.min(200, Number(e.target.value) || 0)) })} />
            </label>
            <label className={styles.hint}>Leading
              <input className={styles.characterField} type="number" min={0} max={400} value={options.leading} aria-label="Leading (0 = Auto)" onChange={(e) => applyTextOptionsToSelected({ leading: Math.max(0, Math.min(400, Number(e.target.value) || 0)) })} />
            </label>
            <button type="button" className={options.underline ? styles.toggleOn : styles.toggle} title="Underline" onClick={() => applyTextOptionsToSelected({ underline: !options.underline })}>
              <TextUnderline size={14} /> Underline
            </button>
          </OptionsMore>
        </div>
      )}
      {!showTextOptions &&
        !showShapeOptions &&
        !showSelectionOptions &&
        activeToolId !== 'brush' &&
        activeToolId !== 'eraser' &&
        activeToolId !== 'pencil' &&
        activeToolId !== 'cloneStamp' &&
        activeToolId !== 'spotHealing' &&
        activeToolId !== 'healingBrush' &&
        activeToolId !== 'smudge' &&
        activeToolId !== 'blur' &&
        activeToolId !== 'gradient' &&
        activeToolId !== 'paintBucket' &&
        activeToolId !== 'sharpen' &&
        activeToolId !== 'dodge' &&
        activeToolId !== 'burn' &&
        activeToolId !== 'sponge' &&
        !isLiquifyTool(activeToolId) &&
        activeToolId !== 'crop' &&
        activeToolId !== 'move' && (
          <span className={styles.hint}>{tool ? `${tool.letter}` : ''}</span>
        )}
    </div>
  )
}

function SelectionEdgeOptions({
  featherRadius,
  antiAlias,
  onFeatherChange,
  onAntiAliasChange,
}: {
  featherRadius: number
  antiAlias: boolean
  onFeatherChange: (radius: number) => void
  onAntiAliasChange: (enabled: boolean) => void
}) {
  return (
    <>
      <label className={styles.hint} title="Feather radius">
        Feather
        <input
          className={styles.size}
          type="number"
          min={0}
          max={250}
          step={0.1}
          value={featherRadius}
          onChange={(e) => onFeatherChange(Number(e.target.value))}
        />
        px
      </label>
      <label className={styles.hint} title="Antialias selection edge">
        <input
          type="checkbox"
          checked={antiAlias}
          onChange={(e) => onAntiAliasChange(e.target.checked)}
        />{' '}
        Anti-alias
      </label>
    </>
  )
}
