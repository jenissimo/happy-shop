import { describe, expect, test } from 'bun:test'
import type { DockviewApi } from 'dockview-react'
import {
  applyWorkspaceViewPrefs,
  buildWorkspaceLayout,
  DOCK_LAYOUT_VERSION,
  getRightDockStack,
  readWorkspaceLayoutId,
  RIGHT_DOCK_BOTTOM_STACK,
  RIGHT_DOCK_TOP_STACK,
  shouldApplyDefaultLayout,
  WORKSPACE_LAYOUT_ID_KEY,
  WORKSPACE_VIEW_PREFS,
} from './defaultLayout'

describe('shouldApplyDefaultLayout', () => {
  test('applies when layout is missing', () => {
    expect(shouldApplyDefaultLayout(null, {})).toBe(true)
    expect(shouldApplyDefaultLayout(undefined, undefined)).toBe(true)
  })

  test('replaces layouts from older desktop UX versions', () => {
    expect(shouldApplyDefaultLayout({ grid: {} }, {})).toBe(true)
    expect(
      shouldApplyDefaultLayout({ grid: {} }, { dockLayoutVersion: 1 }),
    ).toBe(true)
    expect(
      shouldApplyDefaultLayout({ grid: {} }, { dockLayoutVersion: 2 }),
    ).toBe(true)
    expect(
      shouldApplyDefaultLayout({ grid: {} }, { dockLayoutVersion: 3 }),
    ).toBe(true)
    expect(
      shouldApplyDefaultLayout({ grid: {} }, { dockLayoutVersion: 4 }),
    ).toBe(true)
  })

  test('keeps layout when version matches current default', () => {
    expect(DOCK_LAYOUT_VERSION).toBe(12)
    expect(
      shouldApplyDefaultLayout(
        { grid: {} },
        { dockLayoutVersion: DOCK_LAYOUT_VERSION },
      ),
    ).toBe(false)
  })

  test('maps legacy and invalid preset ids to Essentials', () => {
    expect(readWorkspaceLayoutId({})).toBe('essentials')
    expect(readWorkspaceLayoutId({ [WORKSPACE_LAYOUT_ID_KEY]: 'invalid' })).toBe(
      'essentials',
    )
    expect(readWorkspaceLayoutId({ [WORKSPACE_LAYOUT_ID_KEY]: 'painting' })).toBe(
      'painting',
    )
    expect(readWorkspaceLayoutId({ [WORKSPACE_LAYOUT_ID_KEY]: 'pixelArt' })).toBe(
      'pixelArt',
    )
  })

  test('assigns every right-dock panel to a stack', () => {
    for (const panelId of [...RIGHT_DOCK_TOP_STACK, ...RIGHT_DOCK_BOTTOM_STACK]) {
      expect(getRightDockStack(panelId)).toBeTruthy()
    }
    expect(getRightDockStack('viewport')).toBeNull()
    expect(getRightDockStack('info')).toBe('top')
    expect(getRightDockStack('paths')).toBe('top')
    expect(getRightDockStack('swatches')).toBe('bottom')
    expect(getRightDockStack('brushes')).toBe('bottom')
  })

  test('applies pixel-art view prefs when switching preset', () => {
    const applied = { pixelatedPreview: false, showPixelGrid: false, actualPixels: 0 }
    applyWorkspaceViewPrefs('pixelArt', {
      setPixelatedPreview: (enabled) => {
        applied.pixelatedPreview = enabled
      },
      setShowPixelGrid: (enabled) => {
        applied.showPixelGrid = enabled
      },
      setActualPixels: () => {
        applied.actualPixels += 1
      },
    })
    expect(applied).toEqual({
      pixelatedPreview: true,
      showPixelGrid: true,
      actualPixels: 1,
    })
    expect(WORKSPACE_VIEW_PREFS.essentials).toBeUndefined()
  })

  test('does not force actual pixels for presets without view prefs', () => {
    let actualPixelsCalls = 0
    applyWorkspaceViewPrefs('essentials', {
      setPixelatedPreview: () => {},
      setShowPixelGrid: () => {},
      setActualPixels: () => {
        actualPixelsCalls += 1
      },
    })
    expect(actualPixelsCalls).toBe(0)
  })

  test('skips actual pixels when zoom command hook is absent', () => {
    let actualPixelsCalls = 0
    applyWorkspaceViewPrefs('pixelArt', {
      setPixelatedPreview: () => {},
      setShowPixelGrid: () => {},
    })
    expect(actualPixelsCalls).toBe(0)
    expect(WORKSPACE_VIEW_PREFS.pixelArt?.actualPixels).toBe(true)
  })

  test('applies each preset with dual-stack right dock and focus', () => {
    for (const [preset, expectedFocus, expectedOrder, bottomAnchorId, topSplit, bottomSplit] of [
      [
        'essentials',
        'hierarchy',
        [
          'viewport',
          'navigator',
          'info',
          'paths',
          'effects',
          'character',
          'paragraph',
          'inspector',
          'hierarchy',
          'history',
          'swatches',
          'brushes',
        ],
        'inspector',
        { direction: 'right', initialWidth: 300 },
        { direction: 'below', initialHeight: 440 },
      ],
      [
        'painting',
        'navigator',
        [
          'viewport',
          'navigator',
          'info',
          'paths',
          'effects',
          'character',
          'paragraph',
          'swatches',
          'brushes',
          'hierarchy',
          'history',
          'inspector',
        ],
        'swatches',
        { direction: 'right', initialWidth: 280 },
        { direction: 'below', initialHeight: 420 },
      ],
      [
        'typography',
        'character',
        [
          'viewport',
          'character',
          'paragraph',
          'paths',
          'navigator',
          'info',
          'effects',
          'inspector',
          'hierarchy',
          'history',
          'swatches',
          'brushes',
        ],
        'inspector',
        { direction: 'right', initialWidth: 320 },
        { direction: 'below', initialHeight: 410 },
      ],
      [
        'pixelArt',
        'hierarchy',
        [
          'viewport',
          'navigator',
          'info',
          'paths',
          'effects',
          'paragraph',
          'character',
          'hierarchy',
          'swatches',
          'brushes',
          'history',
          'inspector',
        ],
        'hierarchy',
        { direction: 'right', initialWidth: 280 },
        { direction: 'below', initialHeight: 420 },
      ],
    ] as const) {
      const panels: string[] = []
      const focused: string[] = []
      const addCalls: Array<{
        id: string
        direction?: string
        initialWidth?: number
        initialHeight?: number
      }> = []
      const panelById = new Map<string, {
        group: { header: { hidden: boolean }; api: { locked: boolean } }
        focus: () => void
      }>()
      const api = {
        clear() {},
        addPanel(options: {
          id: string
          position?: { direction?: string }
          initialWidth?: number
          initialHeight?: number
        }) {
          panels.push(options.id)
          addCalls.push({
            id: options.id,
            direction: options.position?.direction,
            initialWidth: options.initialWidth,
            initialHeight: options.initialHeight,
          })
          const panel = {
            group: { header: { hidden: false }, api: { locked: false } },
            focus: () => focused.push(options.id),
          }
          panelById.set(options.id, panel)
          return panel
        },
        getPanel(id: string) {
          return panelById.get(id)
        },
      } as unknown as DockviewApi

      buildWorkspaceLayout(api, preset)

      expect(panels).toEqual(expectedOrder)
      expect(focused).toEqual([expectedFocus])

      const topAnchorCall = addCalls.find((call) => call.id === expectedOrder[1])
      expect(topAnchorCall?.direction).toBe(topSplit.direction)
      expect(topAnchorCall?.initialWidth).toBe(topSplit.initialWidth)
      expect(topAnchorCall?.initialHeight).toBeUndefined()

      const bottomAnchorCall = addCalls.find((call) => call.id === bottomAnchorId)
      expect(bottomAnchorCall?.direction).toBe(bottomSplit.direction)
      expect(bottomAnchorCall?.initialHeight).toBe(bottomSplit.initialHeight)
    }
  })
})
