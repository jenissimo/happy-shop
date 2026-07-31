import type { CommandRegistry } from '../../../core/commands/registry'
import { canApplyGaussianBlur } from '../../filters/gaussianBlur'
import { canApplySharpen } from '../../filters/sharpen'
import { canApplyNoise } from '../../filters/noise'
import {
  addAdjustmentFilterNode,
  canAddContentFilter,
} from '../../filters/contentFilters'
import {
  canRasterizeContentFilters,
  rasterizeContentFilters,
} from '../../filters/rasterizeContentFilters'
import {
  openGaussianBlurDialog,
  openSharpenDialog,
  openNoiseDialog,
} from '../../../ui/features/filters'

export function registerFilterCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'filter.blur.gaussian',
    title: 'Gaussian Blur…',
    enabled: () => canApplyGaussianBlur(),
    run: () => openGaussianBlurDialog(),
  })

  registry.register({
    id: 'filter.sharpen',
    title: 'Sharpen…',
    enabled: () => canApplySharpen(),
    run: () => openSharpenDialog(),
  })

  registry.register({
    id: 'filter.noise',
    title: 'Add Noise…',
    enabled: () => canApplyNoise(),
    run: () => openNoiseDialog(),
  })

  registry.register({
    id: 'filter.adjust.brightnessContrast',
    title: 'Brightness/Contrast…',
    enabled: () => canAddContentFilter(),
    run: () =>
      addAdjustmentFilterNode({
        type: 'brightness-contrast',
        brightness: 0,
        contrast: 0,
      }),
  })

  registry.register({
    id: 'filter.adjust.hueSaturation',
    title: 'Hue/Saturation…',
    enabled: () => canAddContentFilter(),
    run: () =>
      addAdjustmentFilterNode({
        type: 'hue-saturation',
        hueDeg: 0,
        saturation: 0,
        lightness: 0,
      }),
  })

  registry.register({
    id: 'filter.adjust.levels',
    title: 'Levels…',
    enabled: () => canAddContentFilter(),
    run: () =>
      addAdjustmentFilterNode({
        type: 'levels',
        black: 0,
        white: 255,
        gamma: 1,
      }),
  })

  registry.register({
    id: 'filter.rasterize',
    title: 'Rasterize Filters',
    enabled: () => canRasterizeContentFilters(),
    run: async () => {
      await rasterizeContentFilters()
    },
  })
}
