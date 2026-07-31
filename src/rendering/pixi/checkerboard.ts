import { Texture } from 'pixi.js'

/** Cell size in checker-texture pixels (before Pixi tiling scale). */
const CELL = 8

/**
 * Builds a small repeating checker tile as a plain 2D canvas — cheaper and
 * simpler than a Graphics + `generateTexture` round trip for a static pattern,
 * and it doesn't need a live renderer to construct.
 */
export function createCheckerboardTexture(
  light = '#30343d',
  dark = '#22252b',
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
