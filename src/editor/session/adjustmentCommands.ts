import type { CommandRegistry } from '../../core/commands/registry'
import {
  addLayer,
  createAdjustmentLayer,
  type Adjustment,
} from '../../core/document'
import { commitDocumentMutation } from './documentTransaction'

function addAdjustment(label: string, adjustment: Adjustment): void {
  const layer = createAdjustmentLayer({
    name: label,
    adjustment,
  })
  commitDocumentMutation(`Add ${label}`, (doc) => addLayer(doc, layer), {
    selectedLayerIds: [layer.id],
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

  // Curves documents remain readable, but creation stays unavailable until the
  // same curve evaluator exists in both GPU preview and CPU export paths.
}
