/**
 * Pure pixel-scan kernels for trim / chroma (SPEC §16 — run in imaging worker).
 * Safe to import from main-thread tests without a Worker.
 */

export type OpaqueBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Scan RGBA for non-zero alpha; returns null if fully transparent. */
export function scanOpaqueBounds(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): OpaqueBounds | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3]!
      if (a === 0) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX || maxY < minY) return null
  return { minX, minY, maxX, maxY }
}

export type ChromaKeyParams = {
  keyR: number
  keyG: number
  keyB: number
  tolerance: number
  softness: number
  /** 0–1 unmix strength for pixels whose alpha was reduced. */
  despill?: number
  /** Integer alpha erosion radius in pixels. */
  choke?: number
  /** Default `global`. Flood = 4-connected from floodOrigins (Lab ≤ outer). */
  mode?: 'global' | 'flood'
  /** Layer-local integer seeds; ignored when mode === 'global'. */
  floodOrigins?: ReadonlyArray<{ x: number; y: number }>
  width?: number
  height?: number
}

/** A8 (255 = flood-connected) mask returned to the GPU preview path. */
export type ChromaFloodMask = {
  width: number
  height: number
  data: Uint8Array
}

function labDist(
  lab: { L: number; a: number; b: number },
  keyLab: { L: number; a: number; b: number },
): number {
  return Math.hypot(lab.L - keyLab.L, lab.a - keyLab.a, lab.b - keyLab.b)
}

function keyedAlpha(
  dist: number,
  srcA: number,
  inner: number,
  outer: number,
): number {
  if (dist <= inner) return 0
  if (dist < outer) {
    const t = (dist - inner) / Math.max(1e-6, outer - inner)
    const s = t * t * (3 - 2 * t)
    return srcA * s
  }
  return srcA
}

/**
 * In-place CIE Lab chroma key (SPECS/CHROMA-KEY-AND-TRIM.md).
 * Global: every pixel. Flood: BFS from seeds through pixels with dist ≤ outer.
 */
export function applyChromaKeyBuffer(
  data: Uint8ClampedArray | Uint8Array,
  params: ChromaKeyParams,
): void {
  const originalAlpha = new Uint8Array(data.length / 4)
  for (let p = 0; p < originalAlpha.length; p++) originalAlpha[p] = data[p * 4 + 3]!
  const keyLab = srgbToLab(params.keyR, params.keyG, params.keyB)
  const inner = params.tolerance
  const outer = params.tolerance + params.softness
  const mode = params.mode ?? 'global'

  if (mode === 'flood') {
    const width = params.width
    const height = params.height
    if (
      width == null ||
      height == null ||
      width <= 0 ||
      height <= 0 ||
      data.length < width * height * 4
    ) {
      // Missing dimensions — fall back to global so callers never no-op silently.
      applyChromaKeyGlobalLoop(data, keyLab, inner, outer)
      applyChokeAndDespill(data, originalAlpha, params)
      return
    }
    applyChromaKeyFlood(data, width, height, keyLab, inner, outer, params.floodOrigins ?? [])
    applyChokeAndDespill(data, originalAlpha, params, width, height)
    return
  }

  applyChromaKeyGlobalLoop(data, keyLab, inner, outer)
  applyChokeAndDespill(data, originalAlpha, params, params.width, params.height)
}

/**
 * Builds the exact connectivity predicate used by CPU flood chroma keying.
 * Keep this separate from alpha/despill/choke: the GPU owns those post-mask
 * passes, while this worker kernel remains authoritative for 4-connected BFS.
 */
export function buildChromaFloodMask(
  data: Uint8ClampedArray | Uint8Array,
  params: ChromaKeyParams & { width: number; height: number },
): ChromaFloodMask {
  const { width, height } = params
  const empty = new Uint8Array(Math.max(0, width * height))
  if (
    width <= 0 ||
    height <= 0 ||
    data.length < width * height * 4
  ) {
    return { width, height, data: empty }
  }

  const keyLab = srgbToLab(params.keyR, params.keyG, params.keyB)
  return {
    width,
    height,
    data: buildFloodConnectivity(
      data,
      width,
      height,
      keyLab,
      params.tolerance + params.softness,
      params.floodOrigins ?? [],
    ),
  }
}

function applyChokeAndDespill(
  data: Uint8ClampedArray | Uint8Array,
  originalAlpha: Uint8Array,
  params: ChromaKeyParams,
  width?: number,
  height?: number,
): void {
  const choke = Math.max(0, Math.min(5, Math.round(params.choke ?? 0)))
  if (choke > 0 && width != null && height != null && width * height * 4 <= data.length) {
    const keyedAlpha = new Uint8Array(originalAlpha.length)
    for (let p = 0; p < keyedAlpha.length; p++) keyedAlpha[p] = data[p * 4 + 3]!
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let minAlpha = 255
        for (let oy = -choke; oy <= choke; oy++) {
          for (let ox = -choke; ox <= choke; ox++) {
            const sx = x + ox
            const sy = y + oy
            if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
              minAlpha = 0
            } else {
              minAlpha = Math.min(minAlpha, keyedAlpha[sy * width + sx]!)
            }
          }
        }
        data[(y * width + x) * 4 + 3] = minAlpha
      }
    }
  }

  const despill = Math.max(0, Math.min(1, params.despill ?? 0))
  if (despill <= 0) return
  for (let p = 0; p < originalAlpha.length; p++) {
    const i = p * 4
    const srcA = originalAlpha[p]! / 255
    const outA = data[i + 3]! / 255
    if (srcA <= 0 || outA >= srcA) continue
    const removed = Math.max(0, Math.min(1, (srcA - outA) / srcA))
    const foreground = Math.max(1e-5, 1 - removed)
    for (let channel = 0; channel < 3; channel++) {
      const src = data[i + channel]! / 255
      const key = channel === 0 ? params.keyR / 255 : channel === 1 ? params.keyG / 255 : params.keyB / 255
      const unspilled = Math.max(0, Math.min(1, (src - key * removed) / foreground))
      data[i + channel] = Math.round((src * (1 - despill) + unspilled * despill) * 255)
    }
  }
}

function applyChromaKeyGlobalLoop(
  data: Uint8ClampedArray | Uint8Array,
  keyLab: { L: number; a: number; b: number },
  inner: number,
  outer: number,
): void {
  for (let i = 0; i < data.length; i += 4) {
    const lab = srgbToLab(data[i]!, data[i + 1]!, data[i + 2]!)
    const dist = labDist(lab, keyLab)
    const srcA = data[i + 3]! / 255
    data[i + 3] = Math.round(keyedAlpha(dist, srcA, inner, outer) * 255)
  }
}

function applyChromaKeyFlood(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  keyLab: { L: number; a: number; b: number },
  inner: number,
  outer: number,
  origins: ReadonlyArray<{ x: number; y: number }>,
): void {
  const { connectivity: visited, distances: distCache } = floodConnectivityAndDistances(
    data, width, height, keyLab, outer, origins,
  )

  for (let p = 0; p < width * height; p++) {
    if (!visited[p]) continue
    const i = p * 4
    const srcA = data[i + 3]! / 255
    data[i + 3] = Math.round(keyedAlpha(distCache[p]!, srcA, inner, outer) * 255)
  }
}

function buildFloodConnectivity(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  keyLab: { L: number; a: number; b: number },
  outer: number,
  origins: ReadonlyArray<{ x: number; y: number }>,
): Uint8Array {
  const { connectivity } = floodConnectivityAndDistances(data, width, height, keyLab, outer, origins)
  for (let i = 0; i < connectivity.length; i++) connectivity[i] *= 255
  return connectivity
}

function floodConnectivityAndDistances(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  keyLab: { L: number; a: number; b: number },
  outer: number,
  origins: ReadonlyArray<{ x: number; y: number }>,
): { connectivity: Uint8Array; distances: Float32Array } {
  const pixelCount = width * height
  const distances = new Float32Array(pixelCount)
  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4
    distances[p] = labDist(srgbToLab(data[i]!, data[i + 1]!, data[i + 2]!), keyLab)
  }
  const connectivity = new Uint8Array(pixelCount)
  const queue = new Int32Array(pixelCount)
  let qh = 0
  let qt = 0
  for (const origin of origins) {
    const x = origin.x | 0
    const y = origin.y | 0
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    const p = y * width + x
    if (connectivity[p] || distances[p]! > outer) continue
    connectivity[p] = 1
    queue[qt++] = p
  }
  while (qh < qt) {
    const p = queue[qh++]!
    const x = p % width
    const y = (p / width) | 0
    const neighbors = [p - 1, p + 1, p - width, p + width]
    const nx = [x - 1, x + 1, x, x]
    const ny = [y, y, y - 1, y + 1]
    for (let k = 0; k < 4; k++) {
      const cx = nx[k]!
      const cy = ny[k]!
      const np = neighbors[k]!
      if (cx < 0 || cy < 0 || cx >= width || cy >= height || connectivity[np]) continue
      if (distances[np]! > outer) continue
      connectivity[np] = 1
      queue[qt++] = np
    }
  }
  return { connectivity, distances }
}

function srgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const R = lin(r)
  const G = lin(g)
  const B = lin(b)
  const x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175
  const z = R * 0.0193339 + G * 0.119192 + B * 0.9503041
  const xr = x / 0.95047
  const yr = y / 1
  const zr = z / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(xr)
  const fy = f(yr)
  const fz = f(zr)
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}
