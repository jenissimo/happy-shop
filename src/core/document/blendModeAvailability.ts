import { BLEND_MODES, type BlendMode } from './schemaPrimitives'

/**
 * `pass-through` is not a blend equation — it is a group's way of saying "do not
 * composite through a buffer, let my children blend straight into the backdrop"
 * (see `groupNeedsOwnBuffer`). It is meaningless on a leaf layer, where it used
 * to be selectable and then silently rendered as `normal`.
 */
export const GROUP_ONLY_BLEND_MODES: readonly BlendMode[] = ['pass-through']

const LEAF_BLEND_MODES: readonly BlendMode[] = BLEND_MODES.filter(
  (mode) => !GROUP_ONLY_BLEND_MODES.includes(mode),
)

/** Blend modes a user may pick for a layer of this type. */
export function selectableBlendModes(layerType: string): readonly BlendMode[] {
  return layerType === 'group' ? BLEND_MODES : LEAF_BLEND_MODES
}

/** Default blend mode for a layer type: groups start pass-through (Photoshop). */
export function defaultBlendMode(layerType: string): BlendMode {
  return layerType === 'group' ? 'pass-through' : 'normal'
}

/** Coerces a blend mode that is invalid for `layerType` back to a legal one. */
export function coerceBlendMode(mode: BlendMode, layerType: string): BlendMode {
  return selectableBlendModes(layerType).includes(mode) ? mode : 'normal'
}
