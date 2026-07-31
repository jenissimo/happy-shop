import {
  addEffect,
  getLayer,
  isLayerImageLocked,
  type Adjustment,
  type AdjustmentEffect,
  type LayerEffect,
} from '../../core/document'
import { createMetadataEntry } from '../../core/history'
import {
  addContentEffectInstance,
  adjustmentTypeLabel,
  createDefaultContentEffect,
  type ContentEffectKey,
} from '../../ui/features/content-filters/defaults'
import { documentHistory } from '../session/documentHistory'
import { useEditorSessionStore } from '../session/EditorSessionStore'

export function canAddContentFilter(): boolean {
  const state = useEditorSessionStore.getState()
  const id = state.selectedLayerIds[0]
  const layer = id && getLayer(state.document, id)
  if (!layer) return false
  if (layer.type === 'adjustment') return false
  return !isLayerImageLocked(layer)
}

function contentFilterHistoryLabel(
  type: ContentEffectKey,
  overrides: Partial<LayerEffect> = {},
): string {
  if (type === 'gaussian-blur') return 'Add Gaussian Blur'
  if (type === 'sharpen') return 'Add Sharpen'
  if (type === 'noise') return 'Add Noise'
  if (type === 'adjustment') {
    const adjustment = (overrides as Partial<AdjustmentEffect>).adjustment
    return adjustment ? `Add ${adjustmentTypeLabel(adjustment)}` : 'Add Adjustment'
  }
  return 'Add Effect'
}

export function addContentFilterEffect(
  type: ContentEffectKey,
  overrides: Partial<LayerEffect> = {},
): boolean {
  if (!canAddContentFilter()) return false
  const state = useEditorSessionStore.getState()
  const layerId = state.selectedLayerIds[0]!
  const layer = getLayer(state.document, layerId)
  if (!layer) return false

  const created = createDefaultContentEffect(type, overrides)
  const before = state.document
  const after = addEffect(before, layerId, created)
  if (after === before) return false

  documentHistory.push(
    createMetadataEntry({
      label: contentFilterHistoryLabel(type, overrides),
      before,
      after,
      apply: (doc) => {
        useEditorSessionStore.setState({
          document: doc,
          dirty: true,
          historyVersion: documentHistory.version,
        })
      },
    }),
  )
  useEditorSessionStore.setState({
    document: after,
    dirty: true,
    historyVersion: documentHistory.version,
  })
  return true
}

/** Preview helper for the Gaussian Blur dialog — inserts with a chosen radius. */
export function addGaussianBlurNode(radius: number): boolean {
  const normalized = Math.max(0, Math.min(100, radius))
  if (normalized === 0) return false
  return addContentFilterEffect('gaussian-blur', { radius: normalized })
}

/** Sharpen dialog helper — inserts with chosen amount/radius. */
export function addSharpenNode(amount: number, radius: number): boolean {
  const normalizedAmount = Math.max(0, Math.min(2, amount))
  const normalizedRadius = Math.max(0, Math.min(20, radius))
  if (normalizedAmount === 0 || normalizedRadius === 0) return false
  return addContentFilterEffect('sharpen', {
    amount: normalizedAmount,
    radius: normalizedRadius,
  })
}

/** Noise dialog helper — inserts with chosen params. */
export function addNoiseNode(
  amount: number,
  distribution: 'uniform' | 'gaussian',
  monochromatic: boolean,
): boolean {
  const normalizedAmount = Math.max(0, Math.min(4, amount))
  if (normalizedAmount === 0) return false
  return addContentFilterEffect('noise', {
    amount: normalizedAmount,
    distribution,
    monochromatic,
  })
}

/** Filter menu helper — inserts a content-phase adjustment node. */
export function addAdjustmentFilterNode(adjustment: Adjustment): boolean {
  return addContentFilterEffect('adjustment', { adjustment })
}

/** Merge draft content nodes for Effects panel add menu. */
export function appendContentEffectDraft(
  effects: LayerEffect[],
  type: ContentEffectKey,
): LayerEffect[] | null {
  return addContentEffectInstance(effects, type)?.next ?? null
}
