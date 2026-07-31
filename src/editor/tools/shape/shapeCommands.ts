import type { CommandRegistry } from '../../../core/commands/registry'
import {
  addLayer,
  asRasterAssetRef,
  createAssetId,
  createRasterLayer,
  createShapeLayer,
  replaceLayer,
  type HappyDocument,
  type LayerId,
  type ShapeLayer,
} from '../../../core/document'
import { createMetadataEntry } from '../../../core/history'
import { registerRasterSurface } from '../../../imaging'
import { documentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { rasterizeShapeLayerToBitmap } from './shapeRasterize'
import { useShapeToolStore } from './shapeToolStore'

function applyDoc(doc: HappyDocument): void {
  useEditorSessionStore.setState({ document: doc, dirty: true })
}

function pushMetadata(
  label: string,
  before: HappyDocument,
  after: HappyDocument,
): void {
  if (before === after) return
  documentHistory.push(
    createMetadataEntry({
      label,
      before,
      after,
      apply: applyDoc,
    }),
  )
  useEditorSessionStore.setState({
    document: after,
    dirty: true,
    historyVersion: documentHistory.version,
  })
}

export async function rasterizeShapeLayer(layerId: LayerId): Promise<boolean> {
  const before = useEditorSessionStore.getState().document
  const layer = before.layers[layerId]
  if (!layer || layer.type !== 'shape') return false

  const { bitmap, baked } = await rasterizeShapeLayerToBitmap(layer)
  const assetId = createAssetId()
  registerRasterSurface({
    assetId,
    width: baked.width,
    height: baked.height,
    bitmap,
  })

  const raster = createRasterLayer({
    id: layer.id,
    name: layer.name,
    parentId: layer.parentId,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    transform: {
      ...layer.transform,
      x: layer.transform.x + baked.offsetX,
      y: layer.transform.y + baked.offsetY,
    },
    mask: layer.mask,
    effects: layer.effects,
    pixels: asRasterAssetRef(assetId),
  })
  const after = replaceLayer(before, raster)
  pushMetadata('Rasterize Layer', before, after)
  useEditorSessionStore.getState().bumpRasterEpoch()
  return true
}

export function createAndSelectShapeLayer(
  options: {
    primitive?: ShapeLayer['primitive']
    x?: number
    y?: number
    w?: number
    h?: number
    fill?: Partial<ShapeLayer['fill']>
    stroke?: Partial<ShapeLayer['stroke']>
    cornerRadius?: number
    sides?: number
    starPoints?: number
    starInset?: number
    pathData?: string
  } = {},
): ShapeLayer {
  const before = useEditorSessionStore.getState().document
  const w = options.w ?? 200
  const h = options.h ?? 120
  const layer = createShapeLayer({
    primitive: options.primitive ?? 'rect',
    bounds: {
      x: 0,
      y: 0,
      w,
      h,
    },
    transform: {
      x: options.x ?? Math.round(before.canvas.width / 2 - w / 2),
      y: options.y ?? Math.round(before.canvas.height / 2 - h / 2),
    },
    fill: options.fill,
    stroke: options.stroke,
    cornerRadius: options.cornerRadius,
    sides: options.sides,
    starPoints: options.starPoints,
    starInset: options.starInset,
    pathData: options.pathData,
  })
  const after = addLayer(before, layer)
  useEditorSessionStore.setState({
    document: after,
    dirty: true,
    selectedLayerIds: [layer.id],
  })
  documentHistory.push(
    createMetadataEntry({
      label: 'Add Shape Layer',
      before,
      after,
      apply: applyDoc,
    }),
  )
  useEditorSessionStore.setState({ historyVersion: documentHistory.version })
  return layer
}

/** Registers shape tool + new-shape; `layer.rasterize` is owned by session registrar. */
export function registerShapeCommands(registry: CommandRegistry): void {
  // Merge with `registerToolCommands` — do not drop the `U` shortcut.
  const existing = registry.get('tool.shape')
  registry.register({
    id: 'tool.shape',
    title: existing?.title ?? 'Shape Tool',
    shortcut: existing?.shortcut ?? 'U',
    enabled: existing?.enabled ?? (() => true),
    run: () => {
      useEditorSessionStore.getState().setActiveToolId('shape')
    },
  })

  registry.register({
    id: 'layer.newShape',
    title: 'New Shape Layer',
    enabled: () => true,
    run: () => {
      const opts = useShapeToolStore.getState().options
      createAndSelectShapeLayer({
        primitive: opts.primitive,
        fill: {
          enabled: opts.fillEnabled,
          color: opts.fillColor,
          opacity: opts.fillOpacity,
        },
        stroke: {
          enabled: opts.strokeEnabled,
          color: opts.strokeColor,
          opacity: opts.strokeOpacity,
          width: opts.strokeWidth,
        },
        cornerRadius: opts.cornerRadius,
        sides: opts.sides,
        starPoints: opts.starPoints,
        starInset: opts.starInset,
      })
    },
  })
}
