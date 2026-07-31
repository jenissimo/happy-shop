import type { LayerId } from '../../../../core/document'
import { GoogleFontUnavailableError } from '../textRasterize'
import { useGoogleFontBakeBlockStore } from './googleFontBakeBlockStore'

export function reportGoogleFontBakeBlock(
  error: unknown,
  layerId: LayerId,
  onRecovered: () => Promise<void>,
): boolean {
  if (!(error instanceof GoogleFontUnavailableError)) return false
  useGoogleFontBakeBlockStore.getState().show({
    layerId,
    resolution: error.resolution,
    onRecovered,
  })
  return true
}
