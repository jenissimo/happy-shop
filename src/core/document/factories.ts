import {
  asRasterAssetRef,
  createAssetId,
  createLayerId,
  EMPTY_INITIAL_RASTER_ASSET_ID,
} from './ids'
import { EMPTY_PATH_STORE } from './pathSchema'
import { CURRENT_SCHEMA_VERSION } from './schema'
import type {
  Adjustment,
  AdjustmentLayer,
  BlendMode,
  Canvas,
  CanvasBackground,
  CssColor,
  GroupLayer,
  HappyDocument,
  LayerEffect,
  LayerId,
  LayerLockFlags,
  RasterAssetRef,
  RasterLayer,
  RasterMaskRef,
  ShapeLayer,
  TextAlign,
  TextBounds,
  TextLayer,
  TextMode,
  Transform,
} from './schema'

const DEFAULT_DOCUMENT_WIDTH = 1024
const DEFAULT_DOCUMENT_HEIGHT = 768

export function createIdentityTransform(): Transform {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotationDeg: 0,
    skewXDeg: 0,
    skewYDeg: 0,
    pivotX: 0,
    pivotY: 0,
  }
}

type LayerBaseOptions = {
  id?: LayerId
  name?: string
  parentId?: LayerId | null
  visible?: boolean
  locked?: boolean
  lockFlags?: Partial<LayerLockFlags>
  opacity?: number
  fillOpacity?: number
  blendMode?: BlendMode
  transform?: Partial<Transform>
  mask?: RasterMaskRef
  clipping?: boolean
  effects?: LayerEffect[]
}

function createLayerBase(options: LayerBaseOptions, defaultName: string) {
  return {
    id: options.id ?? createLayerId(),
    name: options.name ?? defaultName,
    parentId: options.parentId ?? null,
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    lockFlags: {
      transparentPixels: options.lockFlags?.transparentPixels ?? false,
      imagePixels: options.lockFlags?.imagePixels ?? false,
      position: options.lockFlags?.position ?? false,
    },
    opacity: options.opacity ?? 1,
    fillOpacity: options.fillOpacity ?? 1,
    blendMode: options.blendMode ?? ('normal' as const),
    transform: { ...createIdentityTransform(), ...options.transform },
    mask: options.mask,
    clipping: options.clipping,
    effects: options.effects ?? [],
  }
}

export type CreateRasterLayerOptions = LayerBaseOptions & {
  pixels: RasterAssetRef
}

export function createRasterLayer(
  options: CreateRasterLayerOptions,
): RasterLayer {
  return {
    ...createLayerBase(options, 'Layer'),
    type: 'raster',
    pixels: options.pixels,
  }
}

export type CreateGroupLayerOptions = LayerBaseOptions & {
  children?: LayerId[]
  isolated?: boolean
}

export function createGroupLayer(
  options: CreateGroupLayerOptions = {},
): GroupLayer {
  return {
    ...createLayerBase(options, 'Group'),
    type: 'group',
    children: options.children ?? [],
    isolated: options.isolated ?? false,
  }
}

export type CreateAdjustmentLayerOptions = LayerBaseOptions & {
  adjustment: Adjustment
}

export function createAdjustmentLayer(
  options: CreateAdjustmentLayerOptions,
): AdjustmentLayer {
  return {
    ...createLayerBase(options, 'Adjustment'),
    type: 'adjustment',
    adjustment: options.adjustment,
  }
}

export const DEFAULT_TEXT_FONT_FAMILY =
  'Segoe UI, system-ui, -apple-system, sans-serif'
export const DEFAULT_TEXT_FONT_SIZE = 48
export const DEFAULT_TEXT_COLOR = '#000000' as CssColor

export type CreateTextLayerOptions = LayerBaseOptions & {
  textMode?: TextMode
  content?: string
  fontFamily?: string
  fontSource?: TextLayer['fontSource']
  fontSize?: number
  fontWeight?: number
  italic?: boolean
  underline?: boolean
  color?: CssColor
  tracking?: number
  leading?: number
  baselineShift?: number
  horizontalScale?: number
  verticalScale?: number
  fauxBold?: boolean
  fauxItalic?: boolean
  allCaps?: boolean
  smallCaps?: boolean
  align?: TextAlign
  bounds?: Partial<TextBounds>
  runs?: TextLayer['runs']
}

export function createTextLayer(options: CreateTextLayerOptions = {}): TextLayer {
  const bounds: TextBounds = {
    x: options.bounds?.x ?? 0,
    y: options.bounds?.y ?? 0,
    w: options.bounds?.w ?? 0,
    h: options.bounds?.h ?? 0,
  }
  const content = options.content ?? 'Text'
  const fontFamily = options.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY
  const fontSize = options.fontSize ?? DEFAULT_TEXT_FONT_SIZE
  const fontWeight = options.fontWeight ?? 400
  const italic = options.italic ?? false
  const color = options.color ?? DEFAULT_TEXT_COLOR
  return {
    ...createLayerBase(options, 'Text'),
    type: 'text',
    textMode: options.textMode ?? 'point',
    content,
    fontFamily,
    fontSource: options.fontSource,
    fontSize,
    fontWeight,
    italic,
    underline: options.underline ?? false,
    color,
    tracking: options.tracking ?? 0,
    leading: options.leading ?? 0,
    baselineShift: options.baselineShift ?? 0,
    horizontalScale: options.horizontalScale ?? 100,
    verticalScale: options.verticalScale ?? 100,
    fauxBold: options.fauxBold ?? false,
    fauxItalic: options.fauxItalic ?? false,
    allCaps: options.allCaps ?? false,
    smallCaps: options.smallCaps ?? false,
    align: options.align ?? 'left',
    bounds,
    runs: options.runs ?? (content.length
      ? [{
          start: 0,
          end: content.length,
          fontFamily,
          fontSource: options.fontSource,
          fontSize,
          fontWeight,
          italic,
          color,
        }]
      : []),
  }
}

export type CreateShapeLayerOptions = LayerBaseOptions & {
  primitive?: ShapeLayer['primitive']
  bounds?: { x?: number; y?: number; w?: number; h?: number }
  fill?: Partial<ShapeLayer['fill']>
  stroke?: Partial<ShapeLayer['stroke']>
  cornerRadius?: number
  sides?: number
  starPoints?: number
  starInset?: number
  pathData?: string
}

export function createShapeLayer(
  options: CreateShapeLayerOptions = {},
): ShapeLayer {
  return {
    ...createLayerBase(options, 'Shape'),
    type: 'shape',
    primitive: options.primitive ?? 'rect',
    bounds: {
      x: options.bounds?.x ?? 0,
      y: options.bounds?.y ?? 0,
      w: options.bounds?.w ?? 200,
      h: options.bounds?.h ?? 120,
    },
    fill: {
      enabled: options.fill?.enabled ?? true,
      color: options.fill?.color ?? ('#4a90d9' as CssColor),
      opacity: options.fill?.opacity ?? 1,
    },
    stroke: {
      enabled: options.stroke?.enabled ?? true,
      color: options.stroke?.color ?? ('#1a1a1a' as CssColor),
      opacity: options.stroke?.opacity ?? 1,
      width: options.stroke?.width ?? 2,
    },
    cornerRadius: options.cornerRadius,
    sides: options.sides,
    starPoints: options.starPoints,
    starInset: options.starInset,
    pathData: options.pathData,
  }
}

export type CreateEmptyDocumentOptions = {
  id?: string
  name?: string
  width?: number
  height?: number
  background?: CanvasBackground
}

/** Creates the minimum, immediately paintable document layer. */
export function createInitialLayer(): RasterLayer {
  return createRasterLayer({
    name: 'Layer 1',
    pixels: asRasterAssetRef(EMPTY_INITIAL_RASTER_ASSET_ID),
  })
}

/** Returns `doc` unchanged unless it has no layer nodes. */
export function ensureDocumentHasLayer(doc: HappyDocument): HappyDocument {
  if (Object.keys(doc.layers).length > 0) return doc
  const layer = createInitialLayer()
  return {
    ...doc,
    rootChildren: [layer.id],
    layers: { [layer.id]: layer },
  }
}

/**
 * Upgrades the former one-node `Layer 1` group repair to a blank raster.
 * Deliberately narrow so ordinary empty groups remain valid document content.
 */
export function ensureDocumentHasPaintableLayer(doc: HappyDocument): HappyDocument {
  const repaired = ensureDocumentHasLayer(doc)
  const ids = Object.keys(repaired.layers)
  if (ids.length !== 1 || repaired.rootChildren.length !== 1) return repaired

  const id = repaired.rootChildren[0]!
  const layer = repaired.layers[id]
  if (
    !layer ||
    layer.type !== 'group' ||
    layer.name !== 'Layer 1' ||
    layer.parentId !== null ||
    layer.children.length !== 0
  ) {
    return repaired
  }

  const raster = createRasterLayer({
    id: layer.id,
    name: layer.name,
    pixels: asRasterAssetRef(createAssetId()),
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    fillOpacity: layer.fillOpacity,
    blendMode: layer.blendMode,
    transform: layer.transform,
    mask: layer.mask,
    effects: layer.effects,
  })
  return { ...repaired, layers: { [raster.id]: raster } }
}

export function createEmptyDocument(
  options: CreateEmptyDocumentOptions = {},
): HappyDocument {
  const canvas: Canvas = {
    width: options.width ?? DEFAULT_DOCUMENT_WIDTH,
    height: options.height ?? DEFAULT_DOCUMENT_HEIGHT,
    colorSpace: 'srgb',
    pixelFormat: 'rgba8',
    background: options.background ?? 'transparent',
  }
  const initialLayer = createInitialLayer()
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: options.id ?? crypto.randomUUID(),
    name: options.name ?? 'Untitled',
    canvas,
    rootChildren: [initialLayer.id],
    layers: { [initialLayer.id]: initialLayer },
    paths: { ...EMPTY_PATH_STORE },
  }
}
