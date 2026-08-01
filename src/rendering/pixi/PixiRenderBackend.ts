import {
  Application,
  Assets,
  Container,
  Graphics,
  HTMLText,
  Matrix,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture,
  TilingSprite,
  type BLEND_MODES,
  type ContainerChild,
  type Filter,
} from 'pixi.js'
import { cssQuoteFontFamily } from '../../editor/tools/text/cssQuoteFontFamily'
import { trackingToLetterSpacingPx, underlineMetrics } from '../../editor/tools/text/textLayout'
import { shapePath } from '../../editor/tools/shape/shapeGeometry'
import type {
  ExportRegionRequest,
  RenderBackend,
  RuntimeCapabilities,
} from '../contracts/RenderBackend'
import type {
  RenderDocumentView,
  RenderLayerView,
  RenderGroupLayerView,
  RenderRasterLayerView,
  RenderShapeLayerView,
  RenderTextLayerView,
} from '../contracts/RenderDocumentView'
import type { ViewportFrame } from '../contracts/ViewportFrame'
import {
  effectsPadding,
} from '../effects/filters/buildLayerFilters'
import { applyLayerFxFilters } from '../effects/layerFxApply'
import { documentTextureTransformForLayer } from '../effects/filters/BevelEmbossFilter'
import type { RenderLayerMask } from '../contracts/RenderDocumentView'
import {
  checkerColorsEqual,
  createCheckerboardTexture,
  readCheckerboardColors,
  type CheckerboardColors,
} from './checkerboard'
import { attachWebGlContextLossListeners } from './contextLossRecovery'
import {
  applyPreviewSampling,
  createColorLayerTexture,
  LAYER_EDGE_PAD,
  type LayerScaleMode,
} from './layerTextures'
import { buildGroupLayerSourceKey } from './groupLayerKeys'
import {
  describeMask,
  describeShape,
  describeSource,
  describeText,
  describeTransform,
} from './layerViewDescribe'
import { OverlayPass } from './OverlayPass'
import { withShapeEdgeAntialias } from './shapeEdgeAntialias'

interface RasterLayerEntry {
  kind: 'raster'
  sprite: Sprite
  sourceKey: string
  fxStructureKey: string
  fxParamsKey: string
  filterTransformKey: string
  ownsTexture: boolean
  edgePad: number
  maskSprite: Sprite | null
  maskKey: string
  ownsMaskTexture: boolean
}

interface TextLayerEntry {
  kind: 'text'
  text: HTMLText
  sourceKey: string
  fxStructureKey: string
  fxParamsKey: string
  filterTransformKey: string
  maskSprite: Sprite | null
  maskKey: string
  ownsMaskTexture: boolean
}

interface ShapeLayerEntry {
  kind: 'shape'
  graphics: Graphics
  sourceKey: string
  fxStructureKey: string
  fxParamsKey: string
  filterTransformKey: string
  maskSprite: Sprite | null
  maskKey: string
  ownsMaskTexture: boolean
}

interface GroupLayerEntry {
  kind: 'group'
  /** Child scene, rendered into `renderTexture` before its wrapper sprite composites. */
  container: Container
  renderTexture: RenderTexture
  sprite: Sprite
  childEntries: Map<string, LayerEntry>
  sourceKey: string
  fxStructureKey: string
  fxParamsKey: string
  filterTransformKey: string
  maskSprite: Sprite | null
  maskKey: string
  ownsMaskTexture: boolean
}

type LayerEntry = RasterLayerEntry | TextLayerEntry | ShapeLayerEntry | GroupLayerEntry

function emptyFxCache() {
  return { fxStructureKey: '', fxParamsKey: '', filterTransformKey: '' }
}

function layerFxCache(entry: LayerEntry) {
  return {
    fxStructureKey: entry.fxStructureKey,
    fxParamsKey: entry.fxParamsKey,
    filterTransformKey: entry.filterTransformKey,
  }
}

function commitFxCache(entry: LayerEntry, cache: ReturnType<typeof layerFxCache>): void {
  entry.fxStructureKey = cache.fxStructureKey
  entry.fxParamsKey = cache.fxParamsKey
  entry.filterTransformKey = cache.filterTransformKey
}

type MaskedLayerView = Pick<
  RenderRasterLayerView,
  'effects' | 'fillOpacity' | 'transform' | 'mask' | 'maskHidesEffects'
>

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function applyFxToEntry(
  entry: LayerEntry,
  target: { filters: Filter[] | null | readonly Filter[] | undefined },
  layer: MaskedLayerView,
  filterTransformKey: string,
  localOriginX = 0,
  localOriginY = 0,
  wrap?: (filters: Filter[] | null) => Filter[] | null,
): void {
  const cache = layerFxCache(entry)
  applyLayerFxFilters(
    () => (target.filters as Filter[] | null | undefined),
    (filters) => {
      ;(target as { filters: Filter[] | null }).filters = filters
    },
    cache,
    layer,
    filterTransformKey,
    layerFilterOptions(layer, localOriginX, localOriginY),
    wrap,
  )
  commitFxCache(entry, cache)
}

function layerFilterOptions(layer: MaskedLayerView, localOriginX = 0, localOriginY = 0) {
  const textureDocumentTransform = documentTextureTransformForLayer(
    layer.transform,
    localOriginX,
    localOriginY,
  )
  const preMask = layer.mask && !layer.maskHidesEffects ? layer.mask : undefined
  return {
    fillOpacity: layer.fillOpacity,
    textureDocumentTransform,
    preMask,
  }
}

function maskCacheKey(layer: { mask?: RenderLayerMask; maskHidesEffects?: boolean }): string {
  if (!layer.mask) return 'none'
  const mode = layer.maskHidesEffects ? 'post' : 'pre'
  return `${mode}:${describeMask(layer.mask)}`
}

function escapeTextHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!)
}

function richTextHtml(layer: RenderTextLayerView): string {
  const runs = layer.runs.length
    ? layer.runs
    : [{
        start: 0, end: layer.content.length, fontFamily: layer.fontFamily,
        fontSize: layer.fontSize, fontWeight: layer.fontWeight,
        italic: layer.italic, color: layer.color,
      }]
  return runs.map((run) => {
    const underline = run.underline ?? layer.underline
    const tracking = run.tracking ?? layer.tracking
    const baselineShift = run.baselineShift ?? layer.baselineShift
    const letterSpacing = trackingToLetterSpacingPx(tracking, run.fontSize)
    const underlineCss = underline
      ? `text-decoration:underline;text-underline-offset:${underlineMetrics(run.fontSize).offsetY - run.fontSize}px;text-decoration-thickness:${underlineMetrics(run.fontSize).thickness}px`
      : ''
    const style = [
      `font-family:${escapeTextHtml(cssQuoteFontFamily(run.fontFamily))}`,
      `font-size:${run.fontSize}px`,
      `font-weight:${run.fontWeight}`,
      `font-style:${run.italic ? 'italic' : 'normal'}`,
      `color:${run.color}`,
      underlineCss,
      letterSpacing ? `letter-spacing:${letterSpacing}px` : '',
      baselineShift ? `position:relative;top:${-baselineShift}px` : '',
    ].filter(Boolean).join(';')
    return `<span style="${style}">${escapeTextHtml(layer.content.slice(run.start, run.end)).replace(/\n/g, '<br>')}</span>`
  }).join('') || ' '
}

function entryNode(entry: LayerEntry): ContainerChild {
  if (entry.kind === 'raster') return entry.sprite
  if (entry.kind === 'text') return entry.text
  if (entry.kind === 'shape') return entry.graphics
  return entry.sprite
}

/**
 * PixiJS 8 implementation of `RenderBackend` (SPEC §3, §4.1). Scene layout:
 *
 * ```
 * app.stage
 *   documentLayer   (camera pan/zoom applied here)
 *     checkerboard
 *     contentLayer  (Sprite / Text / Graphics per layer, bottom -> top)
 *   overlayLayer    (camera pan/zoom applied here; selection/handles later)
 * ```
 */
export type PixiContextEvent = 'lost' | 'restored'

export class PixiRenderBackend implements RenderBackend {
  private app: Application | null = null
  private readonly documentLayer = new Container({ label: 'document' })
  private readonly contentLayer = new Container({ label: 'content' })
  private readonly overlayLayer = new Container({ label: 'overlay' })
  private overlay: OverlayPass | null = null

  private checkerSprite: TilingSprite | null = null
  private checkerColors: CheckerboardColors | null = null
  private readonly layerEntries = new Map<string, LayerEntry>()
  private readonly urlTextureCache = new Map<string, Texture>()

  private lastViewportWidth = 0
  private lastViewportHeight = 0
  private lastView: RenderDocumentView | null = null
  private contextLost = false
  private detachContextListeners: (() => void) | null = null
  private contextListener: ((event: PixiContextEvent) => void) | null = null

  /** When true, use NEAREST sampling (pixelated preview). Default: smooth. */
  private pixelatedPreview = false

  /**
   * Optional UI hook for WebGL context loss/restore. Listener is notified after
   * internal bookkeeping; rebuild is the caller's responsibility via
   * {@link rebuildGpuResources} (soft) or host remount (hard).
   */
  setContextListener(listener: ((event: PixiContextEvent) => void) | null): void {
    this.contextListener = listener
  }

  isContextLost(): boolean {
    return this.contextLost
  }

  async init(target: HTMLCanvasElement, capabilities: RuntimeCapabilities): Promise<void> {
    const app = new Application()
    const preference = capabilities.preference === 'webgpu-experimental'
      ? (['webgpu', 'webgl'] as const)
      : (['webgl'] as const)

    await app.init({
      canvas: target,
      preference: [...preference],
      antialias: capabilities.antialias,
      backgroundAlpha: capabilities.backgroundAlpha,
      powerPreference:
        capabilities.powerPreference === 'default'
          ? undefined
          : capabilities.powerPreference,
      autoStart: false,
      sharedTicker: false,
      roundPixels: false,
      width: Math.max(1, target.clientWidth),
      height: Math.max(1, target.clientHeight),
      resolution: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      autoDensity: true,
    })

    this.app = app
    this.documentLayer.addChild(this.contentLayer)
    app.stage.addChild(this.documentLayer)
    app.stage.addChild(this.overlayLayer)
    this.overlay = new OverlayPass(this.overlayLayer)
    this.lastViewportWidth = Math.max(1, target.clientWidth)
    this.lastViewportHeight = Math.max(1, target.clientHeight)
    this.contextLost = false
    this.attachContextListeners(target)
  }

  private attachContextListeners(canvas: HTMLCanvasElement): void {
    this.detachContextListeners?.()
    this.detachContextListeners = attachWebGlContextLossListeners(canvas, {
      onLost: () => {
        this.contextLost = true
        this.contextListener?.('lost')
      },
      onRestored: () => {
        this.contextLost = false
        this.contextListener?.('restored')
      },
    })
  }

  /**
   * Drop owned GPU textures / caches and re-sync the last document view after
   * a WebGL context restore. Safe to call when `lastView` is null (no-op sync).
   */
  rebuildGpuResources(): void {
    for (const entry of this.layerEntries.values()) {
      this.invalidateEntryGpu(entry)
    }
    this.urlTextureCache.clear()
    if (this.checkerSprite) {
      this.checkerSprite.destroy(true)
      this.checkerSprite = null
    }
    this.checkerColors = null
    if (this.lastView) {
      this.syncDocument(this.lastView)
    }
  }

  /** Rebuild the transparency grid after theme tokens change. */
  invalidateCheckerboard(): void {
    if (this.checkerSprite) {
      this.checkerSprite.destroy(true)
      this.checkerSprite = null
    }
    this.checkerColors = null
    if (this.lastView && this.app && !this.contextLost) {
      this.syncCheckerboard(this.lastView)
    }
  }

  private invalidateEntryGpu(entry: LayerEntry): void {
    if (entry.kind === 'raster') {
      if (entry.ownsTexture) {
        try {
          entry.sprite.texture.destroy(true)
        } catch {
          /* context may already be gone */
        }
        entry.ownsTexture = false
      }
      entry.sourceKey = ''
    } else if (entry.kind === 'group') {
      for (const child of entry.childEntries.values()) this.invalidateEntryGpu(child)
      entry.sourceKey = ''
    } else if (entry.kind === 'text') {
      entry.sourceKey = ''
    } else {
      entry.sourceKey = ''
    }
    entry.filterTransformKey = ''
    entry.fxStructureKey = ''
    entry.fxParamsKey = ''
    if (entry.maskSprite && entry.ownsMaskTexture) {
      try {
        entry.maskSprite.texture.destroy(true)
      } catch {
        /* ignore */
      }
      entry.ownsMaskTexture = false
    }
    entry.maskKey = ''
  }

  setPixelatedPreview(enabled: boolean): void {
    if (this.pixelatedPreview === enabled) return
    this.pixelatedPreview = enabled
    for (const entry of this.layerEntries.values()) {
      if (entry.kind === 'raster') entry.sourceKey = ''
    }
  }

  getPixelatedPreview(): boolean {
    return this.pixelatedPreview
  }

  private scaleMode(): LayerScaleMode {
    return this.pixelatedPreview ? 'nearest' : 'linear'
  }

  syncDocument(view: RenderDocumentView): void {
    this.lastView = view
    if (!this.app || this.contextLost) return
    this.syncCheckerboard(view)
    this.syncLayers(view)
    this.overlay?.sync()
  }

  private syncCheckerboard(view: RenderDocumentView): void {
    const colors = readCheckerboardColors()
    const needsRebuild =
      !this.checkerSprite ||
      !this.checkerColors ||
      !checkerColorsEqual(this.checkerColors, colors)

    if (needsRebuild) {
      if (this.checkerSprite) {
        this.checkerSprite.destroy(true)
        this.checkerSprite = null
      }
      const texture = createCheckerboardTexture(colors.light, colors.dark)
      const sprite = new TilingSprite({ texture, width: view.width, height: view.height })
      sprite.label = 'checkerboard'
      sprite.roundPixels = false
      this.documentLayer.addChildAt(sprite, 0)
      this.checkerSprite = sprite
      this.checkerColors = colors
    }

    const sprite = this.checkerSprite
    if (!sprite) return
    sprite.width = view.width
    sprite.height = view.height
  }

  private clearEntryMask(entry: LayerEntry, target: Container): void {
    if (!entry.maskSprite) return
    target.setMask({ mask: null })
    if (entry.maskSprite.parent === target) {
      target.removeChild(entry.maskSprite)
    }
    if (entry.ownsMaskTexture) entry.maskSprite.texture.destroy(true)
    entry.maskSprite.destroy()
    entry.maskSprite = null
    entry.ownsMaskTexture = false
    entry.maskKey = 'none'
  }

  private destroyEntry(entry: LayerEntry): void {
    const target = entryNode(entry) as Container
    this.clearEntryMask(entry, target)
    if (entry.kind === 'raster') {
      if (entry.ownsTexture) entry.sprite.texture.destroy(true)
      entry.sprite.destroy()
    } else if (entry.kind === 'group') {
      for (const child of entry.childEntries.values()) this.destroyEntry(child)
      entry.childEntries.clear()
      entry.container.destroy({ children: false })
      entry.renderTexture.destroy(true)
      entry.sprite.destroy()
    } else if (entry.kind === 'text') {
      entry.text.destroy()
    } else {
      entry.graphics.destroy()
    }
  }

  /**
   * Document-space grayscale mask as a child sprite (red channel = coverage).
   * Mask follows the layer transform with the content node.
   */
  private applyLayerMask(
    entry: LayerEntry,
    target: Container,
    layer: { id: string; mask?: RenderLayerMask; maskHidesEffects?: boolean },
  ): void {
    const key = maskCacheKey(layer)
    if (key === entry.maskKey) return

    this.clearEntryMask(entry, target)
    entry.maskKey = key
    if (!layer.mask || !layer.maskHidesEffects) return

    const texture = Texture.from(
      {
        resource: layer.mask.bitmap,
        scaleMode: 'nearest',
        autoGenerateMipmaps: false,
        addressMode: 'clamp-to-edge',
      },
      true,
    )
    const maskSprite = new Sprite(texture)
    maskSprite.label = `${layer.id}:mask`
    maskSprite.roundPixels = false
    maskSprite.width = layer.mask.width
    maskSprite.height = layer.mask.height
    maskSprite.position.set(0, 0)
    target.addChild(maskSprite)
    target.setMask({ mask: maskSprite, channel: 'red' })
    entry.maskSprite = maskSprite
    entry.ownsMaskTexture = true
  }

  private syncLayers(view: RenderDocumentView): void {
    this.syncLayerList(this.contentLayer, this.layerEntries, view.layers)
  }

  /** Recursively projects a document layer list into one Pixi container. */
  private syncLayerList(
    target: Container,
    entries: Map<string, LayerEntry>,
    layers: readonly RenderLayerView[],
  ): void {
    const seen = new Set<string>()

    layers.forEach((layer, index) => {
      seen.add(layer.id)
      let entry = entries.get(layer.id)

      if (entry && entry.kind !== layer.kind) {
        target.removeChild(entryNode(entry))
        this.destroyEntry(entry)
        entries.delete(layer.id)
        entry = undefined
      }

      if (!entry) {
        if (layer.kind === 'text') {
          const text = new HTMLText({ text: '', style: { fontSize: 12 } })
          text.label = layer.id
          text.roundPixels = false
          entry = {
            kind: 'text',
            text,
            sourceKey: '',
            ...emptyFxCache(),
            maskSprite: null,
            maskKey: 'none',
            ownsMaskTexture: false,
          }
        } else if (layer.kind === 'shape') {
          const graphics = new Graphics()
          graphics.label = layer.id
          graphics.roundPixels = false
          entry = {
            kind: 'shape',
            graphics,
            sourceKey: '',
            ...emptyFxCache(),
            maskSprite: null,
            maskKey: 'none',
            ownsMaskTexture: false,
          }
        } else if (layer.kind === 'group') {
          const renderTexture = RenderTexture.create({ width: 1, height: 1 })
          const sprite = new Sprite(renderTexture)
          sprite.label = layer.id
          sprite.roundPixels = false
          entry = {
            kind: 'group',
            container: new Container({ label: `${layer.id}:isolated-content` }),
            renderTexture,
            sprite,
            childEntries: new Map(),
            sourceKey: '',
            ...emptyFxCache(),
            maskSprite: null,
            maskKey: 'none',
            ownsMaskTexture: false,
          }
        } else {
          const sprite = new Sprite(Texture.EMPTY)
          sprite.label = layer.id
          sprite.roundPixels = false
          entry = {
            kind: 'raster',
            sprite,
            sourceKey: '',
            ...emptyFxCache(),
            ownsTexture: false,
            edgePad: 0,
            maskSprite: null,
            maskKey: 'none',
            ownsMaskTexture: false,
          }
        }
        entries.set(layer.id, entry)
      }

      if (entry.kind === 'text' && layer.kind === 'text') {
        this.applyTextLayer(entry, layer)
        this.applyLayerMask(entry, entry.text, layer)
      } else if (entry.kind === 'shape' && layer.kind === 'shape') {
        this.applyShapeLayer(entry, layer)
        this.applyLayerMask(entry, entry.graphics, layer)
      } else if (entry.kind === 'raster' && layer.kind === 'raster') {
        this.applyRasterLayer(entry, layer)
        this.applyLayerMask(entry, entry.sprite, layer)
      } else if (entry.kind === 'group' && layer.kind === 'group') {
        this.applyGroupLayer(entry, layer)
        this.applyLayerMask(entry, entry.sprite, layer)
      }

      const node = entryNode(entry)
      if (target.children[index] !== node) {
        target.addChildAt(node, index)
      }
    })

    for (const [id, entry] of entries) {
      if (seen.has(id)) continue
      target.removeChild(entryNode(entry))
      this.destroyEntry(entry)
      entries.delete(id)
    }
  }

  /**
   * Flatten an isolated group's children into a texture, then use the same
   * sprite-level opacity, blend, filter, and mask path as a raster layer.
   * Pass-through groups never reach this method: the view mapper inlines them.
   */
  private applyGroupLayer(entry: GroupLayerEntry, layer: RenderGroupLayerView): void {
    const app = this.app
    if (!app) return

    this.syncLayerList(entry.container, entry.childEntries, layer.children)
    const sourceKey = buildGroupLayerSourceKey(layer, this.scaleMode())
    const bounds = entry.container.getBounds()
    const pad = effectsPadding(layer.effects)
    const x = Math.floor(bounds.x - pad)
    const y = Math.floor(bounds.y - pad)
    const width = Math.max(1, Math.ceil(bounds.width + pad * 2))
    const height = Math.max(1, Math.ceil(bounds.height + pad * 2))
    const sourceChanged = sourceKey !== entry.sourceKey

    if (
      sourceChanged ||
      entry.renderTexture.width !== width ||
      entry.renderTexture.height !== height
    ) {
      entry.renderTexture.resize(width, height)
      app.renderer.render({
        container: entry.container,
        target: entry.renderTexture,
        clear: true,
        transform: new Matrix().translate(-x, -y),
      })
      entry.sourceKey = sourceKey
    }

    const sprite = entry.sprite
    sprite.visible = layer.visible
    sprite.alpha = layer.opacity
    sprite.blendMode = layer.blendMode as BLEND_MODES
    const filterTransformKey = `${describeTransform(layer.transform)}|${x},${y}`
    applyFxToEntry(
      entry,
      sprite,
      layer,
      filterTransformKey,
      pad,
      pad,
    )

    const t = layer.transform
    sprite.position.set(x + t.x, y + t.y)
    sprite.pivot.set(t.pivotX, t.pivotY)
    sprite.angle = t.rotationDeg
    sprite.skew.set(degToRad(t.skewXDeg), degToRad(t.skewYDeg))
    sprite.scale.set(t.scaleX, t.scaleY)
  }

  private applyRasterLayer(entry: RasterLayerEntry, layer: RenderRasterLayerView): void {
    const sprite = entry.sprite
    sprite.visible = layer.visible
    sprite.alpha = layer.opacity
    sprite.blendMode = layer.blendMode as BLEND_MODES

    const mode = this.scaleMode()
    const sourceKey =
      describeSource(layer.source, layer.width, layer.height, mode) +
      `|${maskCacheKey(layer)}`
    const sourceChanged = sourceKey !== entry.sourceKey
    const filterTransformKey = describeTransform(layer.transform)
    if (sourceChanged) {
      this.assignTexture(entry, layer, mode)
      entry.sourceKey = sourceKey
    }
    applyFxToEntry(entry, sprite, layer, filterTransformKey, entry.edgePad, entry.edgePad)

    const t = layer.transform
    const pad = entry.edgePad
    sprite.position.set(t.x, t.y)
    sprite.pivot.set(t.pivotX + pad, t.pivotY + pad)
    sprite.angle = t.rotationDeg
    sprite.skew.set(degToRad(t.skewXDeg), degToRad(t.skewYDeg))

    const displayW = layer.width + pad * 2
    const displayH = layer.height + pad * 2
    const tw = Math.max(1, sprite.texture.frame.width)
    const th = Math.max(1, sprite.texture.frame.height)
    sprite.scale.set((displayW / tw) * t.scaleX, (displayH / th) * t.scaleY)
  }

  private applyTextLayer(entry: TextLayerEntry, layer: RenderTextLayerView): void {
    const text = entry.text
    text.visible = layer.visible
    text.alpha = layer.opacity
    text.blendMode = layer.blendMode as BLEND_MODES

    const sourceKey = `${describeText(layer)}|${maskCacheKey(layer)}`
    const sourceChanged = sourceKey !== entry.sourceKey
    const filterTransformKey = describeTransform(layer.transform)
    if (sourceChanged) {
      const lineHeight = layer.leading > 0 ? layer.leading : undefined
      text.text = richTextHtml(layer)
      text.style = {
        fontFamily: cssQuoteFontFamily(layer.fontFamily),
        fontSize: layer.fontSize,
        fontWeight: String(Math.round(layer.fontWeight)) as
          | 'normal'
          | 'bold'
          | '100'
          | '200'
          | '300'
          | '400'
          | '500'
          | '600'
          | '700'
          | '800'
          | '900',
        fontStyle: layer.italic ? 'italic' : 'normal',
        fill: layer.color,
        align: layer.align === 'justify' ? 'left' : layer.align,
        letterSpacing: 0,
        lineHeight,
        wordWrap: layer.textMode === 'box' && layer.bounds.w > 0,
        wordWrapWidth:
          layer.textMode === 'box' && layer.bounds.w > 0
            ? layer.bounds.w
            : 100,
        breakWords: true,
      }
      // Underline / baselineShift / tracking live in rich HTML spans (see richTextHtml).
      entry.sourceKey = sourceKey
    }
    applyFxToEntry(entry, text, layer, filterTransformKey)

    const t = layer.transform
    // Point-text transforms are insertion anchors. Pixi's align only offsets
    // lines inside its local bounds, so also anchor the whole text block.
    const pointWidth = text.getLocalBounds().width
    const pointOffsetX =
      layer.textMode === 'point'
        ? layer.align === 'center'
          ? -pointWidth / 2
          : layer.align === 'right'
            ? -pointWidth
            : 0
        : 0
    text.position.set(t.x + pointOffsetX, t.y)
    text.pivot.set(t.pivotX, t.pivotY)
    text.angle = t.rotationDeg
    text.skew.set(degToRad(t.skewXDeg), degToRad(t.skewYDeg))
    text.scale.set(t.scaleX, t.scaleY)
  }

  private applyShapeLayer(entry: ShapeLayerEntry, layer: RenderShapeLayerView): void {
    const graphics = entry.graphics
    graphics.visible = layer.visible
    graphics.alpha = layer.opacity
    graphics.blendMode = layer.blendMode as BLEND_MODES

    const sourceKey = `${describeShape(layer)}|${maskCacheKey(layer)}`
    const sourceChanged = sourceKey !== entry.sourceKey
    const filterTransformKey = describeTransform(layer.transform)
    if (sourceChanged) {
      graphics.clear()
      const { x, y, w, h } = layer.bounds
      if (layer.primitive === 'ellipse') {
        graphics.ellipse(x + w / 2, y + h / 2, Math.max(0, w / 2), Math.max(0, h / 2))
      } else if (layer.primitive === 'rect') {
        const r = Math.min(layer.cornerRadius ?? 0, w / 2, h / 2)
        if (r > 0) graphics.roundRect(x, y, w, h, r)
        else graphics.rect(x, y, w, h)
      } else {
        const path = shapePath(layer)
        if (path) graphics.poly(path.points, path.closed)
      }
      // Chain fill → stroke on the same path so joins share coverage (less fringe).
      if (layer.fill.enabled) {
        graphics.fill({
          color: layer.fill.color,
          alpha: Math.max(0, Math.min(1, layer.fill.opacity)),
        })
      }
      if (layer.stroke.enabled && layer.stroke.width > 0) {
        graphics.stroke({
          width: layer.stroke.width,
          color: layer.stroke.color,
          alpha: Math.max(0, Math.min(1, layer.stroke.opacity)),
          join: 'round',
          cap: 'round',
        })
      }
      // Offscreen MSAA for vector edges; framebuffer antialias stays false.
      // Independent of pixelatedPreview (raster sampler policy only).
      entry.sourceKey = sourceKey
    }
    applyFxToEntry(
      entry,
      graphics,
      layer,
      filterTransformKey,
      0,
      0,
      (filters) => withShapeEdgeAntialias(filters),
    )

    const t = layer.transform
    graphics.position.set(t.x, t.y)
    graphics.pivot.set(t.pivotX, t.pivotY)
    graphics.angle = t.rotationDeg
    graphics.skew.set(degToRad(t.skewXDeg), degToRad(t.skewYDeg))
    graphics.scale.set(t.scaleX, t.scaleY)
  }

  private assignTexture(
    entry: RasterLayerEntry,
    layer: RenderRasterLayerView,
    mode: LayerScaleMode,
  ): void {
    const { source, width, height } = layer

    if (entry.ownsTexture) {
      entry.sprite.texture.destroy(true)
    }
    entry.ownsTexture = false
    entry.edgePad = 0

    if (source.kind === 'color') {
      const texture = createColorLayerTexture(width, height, mode)
      entry.sprite.texture = texture
      entry.sprite.tint = source.color
      const owns = texture !== Texture.WHITE
      entry.ownsTexture = owns
      entry.edgePad = owns && mode === 'linear' ? LAYER_EDGE_PAD : 0
      return
    }

    entry.sprite.tint = 0xffffff

    if (source.kind === 'image-bitmap') {
      const texture = Texture.from(
        {
          resource: source.bitmap,
          scaleMode: mode,
          autoGenerateMipmaps: mode === 'linear',
          addressMode: 'clamp-to-edge',
        },
        true,
      )
      applyPreviewSampling(texture, mode)
      entry.sprite.texture = texture
      entry.ownsTexture = true
      return
    }

    const cached = this.urlTextureCache.get(source.url)
    if (cached) {
      applyPreviewSampling(cached, mode)
      entry.sprite.texture = cached
      return
    }
    const pendingKey = describeSource(source, width, height, mode)
    Assets.load(source.url)
      .then((texture: Texture) => {
        applyPreviewSampling(texture, mode)
        this.urlTextureCache.set(source.url, texture)
        if (entry.sourceKey.startsWith(pendingKey)) {
          entry.sprite.texture = texture
        }
      })
      .catch(() => {
        /* Decode/network failure: leave the placeholder texture in place. */
      })
  }

  render(frame: ViewportFrame): void {
    const app = this.app
    if (!app || this.contextLost) return

    try {
      const width = Math.max(1, Math.round(frame.viewportWidth))
      const height = Math.max(1, Math.round(frame.viewportHeight))
      if (width !== this.lastViewportWidth || height !== this.lastViewportHeight) {
        app.renderer.resize(width, height)
        this.lastViewportWidth = width
        this.lastViewportHeight = height
      }

      const dpr = frame.devicePixelRatio > 0 ? frame.devicePixelRatio : 1
      if (Math.abs(app.renderer.resolution - dpr) > 1e-3) {
        app.renderer.resolution = dpr
      }

      const { zoom, offsetX, offsetY } = frame.camera
      this.documentLayer.position.set(offsetX, offsetY)
      this.documentLayer.scale.set(zoom, zoom)
      this.overlayLayer.position.set(offsetX, offsetY)
      this.overlayLayer.scale.set(zoom, zoom)
      // Marching ants animate every frame (selectionStore → OverlayPass).
      this.overlay?.sync(frame)

      app.renderer.render(app.stage)
    } catch {
      // Context mid-loss / GPU fault: skip frame instead of crashing the rAF loop.
      this.contextLost = true
      this.contextListener?.('lost')
    }
  }

  async exportRegion(request: ExportRegionRequest): Promise<ImageBitmap> {
    const app = this.app
    if (!app) throw new Error('PixiRenderBackend.exportRegion called before init()')
    if (this.contextLost) {
      throw new Error('PixiRenderBackend.exportRegion: WebGL context lost')
    }

    const frame = new Rectangle(request.x, request.y, request.width, request.height)
    const canvas = app.renderer.extract.canvas({
      target: this.contentLayer,
      frame,
      resolution: request.scale ?? 1,
    })
    return createImageBitmap(canvas as unknown as CanvasImageSource)
  }

  destroy(): void {
    this.detachContextListeners?.()
    this.detachContextListeners = null
    this.contextListener = null
    this.contextLost = false
    this.lastView = null
    for (const entry of this.layerEntries.values()) {
      this.destroyEntry(entry)
    }
    this.layerEntries.clear()
    this.urlTextureCache.clear()
    this.checkerSprite?.destroy(true)
    this.checkerSprite = null
    this.checkerColors = null
    this.overlay?.destroy()
    this.overlay = null
    this.app?.destroy(false, { children: true, texture: false })
    this.app = null
  }
}
