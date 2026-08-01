import { Texture } from 'pixi.js'

/** Cell size in checker-texture pixels (before Pixi tiling scale). */
const CELL = 8

export type CheckerboardColors = {
  light: string
  dark: string
}

export const DEFAULT_CHECKERBOARD_COLORS: CheckerboardColors = {
  light: '#30343d',
  dark: '#22252b',
}

/**
 * Reads theme checkerboard colors from CSS custom properties on `<html>`.
 * Falls back to dark defaults when vars are missing (e.g. tests without tokens).
 */
export function readCheckerboardColors(
  style: CSSStyleDeclaration = getComputedStyle(document.documentElement),
): CheckerboardColors {
  const light = style.getPropertyValue('--he-checker-a').trim()
  const dark = style.getPropertyValue('--he-checker-b').trim()
  return {
    light: light || DEFAULT_CHECKERBOARD_COLORS.light,
    dark: dark || DEFAULT_CHECKERBOARD_COLORS.dark,
  }
}

export function checkerColorsEqual(a: CheckerboardColors, b: CheckerboardColors): boolean {
  return a.light === b.light && a.dark === b.dark
}

/**
 * Builds a small repeating checker tile as a plain 2D canvas — cheaper and
 * simpler than a Graphics + `generateTexture` round trip for a static pattern,
 * and it doesn't need a live renderer to construct.
 */
export function createCheckerboardTexture(
  light = DEFAULT_CHECKERBOARD_COLORS.light,
  dark = DEFAULT_CHECKERBOARD_COLORS.dark,
): Texture {
  const size = CELL * 2
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return Texture.WHITE

  ctx.fillStyle = light
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = dark
  ctx.fillRect(CELL, 0, CELL, CELL)
  ctx.fillRect(0, CELL, CELL, CELL)

  return Texture.from({
    resource: canvas,
    scaleMode: 'nearest',
    addressMode: 'repeat',
  })
}
