import { beforeEach, describe, expect, test } from 'bun:test'
import { useBrushSettingsStore } from '../tools/brush/brushSettingsStore'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import {
  DEFAULT_BACKGROUND,
  DEFAULT_FOREGROUND,
  useColorStore,
} from './colorStore'
import { usePaletteStore } from './paletteStore'
import {
  shouldSnapForegroundForActiveTool,
  snapToActivePalette,
} from './snapToActivePalette'

const DB16 = [
  '#140C1C',
  '#442434',
  '#30346D',
  '#4E4A4E',
  '#854C30',
  '#346524',
  '#D04648',
  '#757161',
  '#597DCE',
  '#D27D2C',
  '#8595A1',
  '#6DAA2C',
  '#D2AA99',
  '#6DC2CA',
  '#DAD45E',
  '#DEEED6',
] as const

describe('snapToActivePalette', () => {
  beforeEach(() => {
    usePaletteStore.setState({
      activePaletteId: 'db16',
      activeColors: DB16,
      snapToPalette: false,
    })
    useEditorSessionStore.setState({ activeToolId: 'brush' })
  })

  test('shouldSnapForegroundForActiveTool respects tool and toggle', () => {
    usePaletteStore.setState({ snapToPalette: true })
    expect(shouldSnapForegroundForActiveTool()).toBe(true)

    useEditorSessionStore.setState({ activeToolId: 'pencil' })
    expect(shouldSnapForegroundForActiveTool()).toBe(true)

    useEditorSessionStore.setState({ activeToolId: 'eraser' })
    expect(shouldSnapForegroundForActiveTool()).toBe(false)

    useEditorSessionStore.setState({ activeToolId: 'move' })
    expect(shouldSnapForegroundForActiveTool()).toBe(false)

    usePaletteStore.setState({ snapToPalette: false })
    useEditorSessionStore.setState({ activeToolId: 'brush' })
    expect(shouldSnapForegroundForActiveTool()).toBe(false)
  })

  test('snapToActivePalette quantizes off-palette colors for brush/pencil', () => {
    usePaletteStore.setState({ snapToPalette: true })
    expect(snapToActivePalette('#000000')).toBe('#140c1c')
    expect(snapToActivePalette('#ffffff')).toBe('#deeed6')
  })

  test('snapToActivePalette passes through when disabled', () => {
    expect(snapToActivePalette('#123456')).toBe('#123456')
  })
})

describe('useColorStore palette snap', () => {
  beforeEach(() => {
    useColorStore.getState().resetDefaults()
    useBrushSettingsStore.getState().setPrefs({ color: DEFAULT_FOREGROUND })
    usePaletteStore.setState({
      activePaletteId: 'db16',
      activeColors: DB16,
      snapToPalette: true,
    })
    useEditorSessionStore.setState({ activeToolId: 'brush' })
  })

  test('setForeground snaps for brush when snap is enabled', () => {
    useColorStore.getState().setForeground('#000000')
    expect(useColorStore.getState().foreground).toBe('#140c1c')
    expect(useBrushSettingsStore.getState().color).toBe('#140c1c')
  })

  test('setForeground does not snap for non-paint tools', () => {
    useEditorSessionStore.setState({ activeToolId: 'move' })
    useColorStore.getState().setForeground('#000000')
    expect(useColorStore.getState().foreground).toBe('#000000')
  })

  test('swap and resetDefaults remain unaffected by snap toggle', () => {
    usePaletteStore.setState({ snapToPalette: false })
    useColorStore.getState().setForeground('#112233')
    useColorStore.getState().setBackground('#aabbcc')
    useColorStore.getState().swap()
    expect(useColorStore.getState().foreground).toBe('#aabbcc')
    expect(useColorStore.getState().background).toBe('#112233')

    useColorStore.getState().resetDefaults()
    expect(useColorStore.getState().foreground).toBe(DEFAULT_FOREGROUND)
    expect(useColorStore.getState().background).toBe(DEFAULT_BACKGROUND)
  })
})
