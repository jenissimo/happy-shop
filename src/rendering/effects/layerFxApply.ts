/**
 * GPU Layer FX cache: structural rebuild vs param-only uniform sync (§5.3).
 */
import type { Filter } from 'pixi.js'
import type { RenderLayerEffect, RenderLayerTransform } from '../contracts/RenderDocumentView'
import type { RenderLayerMask } from '../contracts/RenderDocumentView'
import {
  buildLayerFilters,
  type BuildLayerFiltersOptions,
} from './filters/buildLayerFilters'
import { syncLayerFilters } from './filters/syncLayerFilters'
import {
  describeEffectsParams,
  describeEffectsStructure,
  describeMask,
} from '../pixi/layerViewDescribe'

function describeFxStructureKey(layer: LayerFxSource): string {
  const maskPart = layer.mask
    ? `${layer.maskHidesEffects ? 'post' : 'pre'}:${describeMask(layer.mask)}`
    : 'none'
  return `${describeEffectsStructure(layer.effects)}|${maskPart}`
}

export type LayerFxCacheState = {
  fxStructureKey: string
  fxParamsKey: string
  filterTransformKey: string
}

export type LayerFxSource = {
  effects?: RenderLayerEffect[]
  fillOpacity: number
  transform: RenderLayerTransform
  mask?: RenderLayerMask
  maskHidesEffects?: boolean
}

export function applyLayerFxFilters(
  getFilters: () => Filter[] | null | undefined,
  setFilters: (filters: Filter[] | null) => void,
  cache: LayerFxCacheState,
  layer: LayerFxSource,
  filterTransformKey: string,
  filterOptions: BuildLayerFiltersOptions,
  wrap?: (filters: Filter[] | null) => Filter[] | null,
): void {
  const structureKey = describeFxStructureKey(layer)
  const paramsKey = describeEffectsParams(layer.effects, layer.fillOpacity)
  const structureChanged = structureKey !== cache.fxStructureKey
  const transformChanged = filterTransformKey !== cache.filterTransformKey
  const paramsChanged = paramsKey !== cache.fxParamsKey

  const assign = (built: Filter[] | null) => {
    const next = wrap ? wrap(built) : built
    setFilters(next)
  }

  if (structureChanged || transformChanged) {
    assign(buildLayerFilters(layer.effects, filterOptions))
    cache.fxStructureKey = structureKey
    cache.fxParamsKey = paramsKey
    cache.filterTransformKey = filterTransformKey
    return
  }

  if (!paramsChanged) return

  const current = getFilters()
  if (syncLayerFilters(current, layer.effects, filterOptions)) {
    cache.fxParamsKey = paramsKey
    return
  }

  assign(buildLayerFilters(layer.effects, filterOptions))
  cache.fxStructureKey = structureKey
  cache.fxParamsKey = paramsKey
  cache.filterTransformKey = filterTransformKey
}
