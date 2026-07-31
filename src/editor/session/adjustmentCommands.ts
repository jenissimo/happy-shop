import type { CommandRegistry } from '../../core/commands/registry'
import {
  addLayer,
  createAdjustmentLayer,
  type Adjustment,
} from '../../core/document'
import { createMetadataEntry } from '../../core/history'
import { documentHistory } from './documentHistory'
import { useEditorSessionStore } from './EditorSessionStore'

function applyDoc(
  doc: ReturnType<typeof useEditorSessionStore.getState>['document'],
) {
  useEditorSessionStore.setState({ document: doc, dirty: true })
}

function addAdjustment(label: string, adjustment: Adjustment): void {
  const before = useEditorSessionStore.getState().document
  const layer = createAdjustmentLayer({
    name: label,
    adjustment,
  })
  const after = addLayer(before, layer)
  documentHistory.push(
    createMetadataEntry({ label: `Add ${label}`, before, after, apply: applyDoc }),
  )
  useEditorSessionStore.setState({
    document: after,
    dirty: true,
    selectedLayerIds: [layer.id],
    historyVersion: documentHistory.version,
  })
}

export function registerAdjustmentCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'image.adjust.brightnessContrast',
    title: 'Brightness/Contrast…',
    enabled: () => true,
    run: () =>
      addAdjustment('Brightness/Contrast', {
        type: 'brightness-contrast',
        brightness: 0,
        contrast: 0,
      }),
  })

  registry.register({
    id: 'image.adjust.hueSaturation',
    title: 'Hue/Saturation…',
    enabled: () => true,
    run: () =>
      addAdjustment('Hue/Saturation', {
        type: 'hue-saturation',
        hueDeg: 0,
        saturation: 0,
        lightness: 0,
      }),
  })

  registry.register({
    id: 'image.adjust.levels',
    title: 'Levels…',
    enabled: () => true,
    run: () =>
      addAdjustment('Levels', {
        type: 'levels',
        black: 0,
        white: 255,
        gamma: 1,
      }),
  })
}
