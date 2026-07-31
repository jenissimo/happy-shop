/** RGB tuple sampled at document pixel coordinates. */
export type RgbSample = (x: number, y: number) => [number, number, number]

function boxBlur3x3(
  grid: Float32Array,
  w: number,
  h: number,
  channelOffset: number,
): Float32Array {
  const out = new Float32Array(w * h)
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let sum = 0
      let count = 0
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = px + ox
          const ny = py + oy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          sum += grid[(ny * w + nx) * 3 + channelOffset]!
          count++
        }
      }
      out[py * w + px] = sum / count
    }
  }
  return out
}

function laplacianScalar(
  grid: Float32Array,
  w: number,
  h: number,
  px: number,
  py: number,
  fallback: number,
): number {
  const center = px >= 0 && px < w && py >= 0 && py < h ? grid[py * w + px]! : fallback
  const left = px > 0 ? grid[py * w + (px - 1)]! : fallback
  const right = px < w - 1 ? grid[py * w + (px + 1)]! : fallback
  const up = py > 0 ? grid[(py - 1) * w + px]! : fallback
  const down = py < h - 1 ? grid[(py + 1) * w + px]! : fallback
  return 4 * center - left - right - up - down
}

function laplacianFromGrid(
  grid: Float32Array,
  channel: number,
  w: number,
  h: number,
  px: number,
  py: number,
  fallback: number,
): number {
  const center = px >= 0 && px < w && py >= 0 && py < h
    ? grid[(py * w + px) * 3 + channel]!
    : fallback
  const left = px > 0 ? grid[(py * w + (px - 1)) * 3 + channel]! : fallback
  const right = px < w - 1 ? grid[(py * w + (px + 1)) * 3 + channel]! : fallback
  const up = py > 0 ? grid[((py - 1) * w + px) * 3 + channel]! : fallback
  const down = py < h - 1 ? grid[((py + 1) * w + px) * 3 + channel]! : fallback
  return 4 * center - left - right - up - down
}

/**
 * Local Poisson-lite heal: start from the compact gradient-domain blend, then
 * refine boundary seamlessness by solving a small Laplacian residual correction
 * under the brush mask (Gauss-Seidel; tile-local only).
 */
export function solvePoissonHealLite(options: {
  region: { x: number; y: number; width: number; height: number }
  centerX: number
  centerY: number
  radius: number
  destSample: RgbSample
  sourceSample: RgbSample
  /** Residual Gauss-Seidel iterations; defaults scale with dab radius. */
  iterations?: number
}): Float32Array {
  const { region, centerX, centerY, radius, destSample, sourceSample } = options
  const w = region.width
  const h = region.height
  const count = w * h
  const mask = new Uint8Array(count)
  const dest = new Float32Array(count * 3)
  const source = new Float32Array(count * 3)
  const initR = new Float32Array(count)
  const initG = new Float32Array(count)
  const initB = new Float32Array(count)
  const corrR = new Float32Array(count)
  const corrG = new Float32Array(count)
  const corrB = new Float32Array(count)
  const rhsR = new Float32Array(count)
  const rhsG = new Float32Array(count)
  const rhsB = new Float32Array(count)

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = py * w + px
      const lx = region.x + px + 0.5
      const ly = region.y + py + 0.5
      const distance = Math.hypot(lx - centerX, ly - centerY) / radius
      mask[i] = distance <= 1 ? 1 : 0
      const d = destSample(lx, ly)
      const s = sourceSample(lx, ly)
      const o = i * 3
      dest[o] = d[0]; dest[o + 1] = d[1]; dest[o + 2] = d[2]
      source[o] = s[0]; source[o + 1] = s[1]; source[o + 2] = s[2]
    }
  }

  const destBlurR = boxBlur3x3(dest, w, h, 0)
  const destBlurG = boxBlur3x3(dest, w, h, 1)
  const destBlurB = boxBlur3x3(dest, w, h, 2)
  const sourceBlurR = boxBlur3x3(source, w, h, 0)
  const sourceBlurG = boxBlur3x3(source, w, h, 1)
  const sourceBlurB = boxBlur3x3(source, w, h, 2)

  const idx = (px: number, py: number) => py * w + px

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = idx(px, py)
      const o = i * 3
      initR[i] = destBlurR[i]! + source[o]! - sourceBlurR[i]!
      initG[i] = destBlurG[i]! + source[o + 1]! - sourceBlurG[i]!
      initB[i] = destBlurB[i]! + source[o + 2]! - sourceBlurB[i]!
    }
  }

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = idx(px, py)
      const o = i * 3
      const sourceLapR = laplacianFromGrid(source, 0, w, h, px, py, source[o]!)
      const sourceLapG = laplacianFromGrid(source, 1, w, h, px, py, source[o + 1]!)
      const sourceLapB = laplacianFromGrid(source, 2, w, h, px, py, source[o + 2]!)
      const initLapR = laplacianScalar(initR, w, h, px, py, initR[i]!)
      const initLapG = laplacianScalar(initG, w, h, px, py, initG[i]!)
      const initLapB = laplacianScalar(initB, w, h, px, py, initB[i]!)
      rhsR[i] = sourceLapR - initLapR
      rhsG[i] = sourceLapG - initLapG
      rhsB[i] = sourceLapB - initLapB
    }
  }

  const iterations = options.iterations ?? Math.min(64, Math.max(16, Math.ceil(radius * 6)))

  for (let iter = 0; iter < iterations; iter++) {
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const i = idx(px, py)
        if (!mask[i]) {
          corrR[i] = 0
          corrG[i] = 0
          corrB[i] = 0
          continue
        }
        const leftR = px > 0 ? corrR[idx(px - 1, py)]! : 0
        const rightR = px < w - 1 ? corrR[idx(px + 1, py)]! : 0
        const upR = py > 0 ? corrR[idx(px, py - 1)]! : 0
        const downR = py < h - 1 ? corrR[idx(px, py + 1)]! : 0
        corrR[i] = (leftR + rightR + upR + downR - rhsR[i]!) * 0.25

        const leftG = px > 0 ? corrG[idx(px - 1, py)]! : 0
        const rightG = px < w - 1 ? corrG[idx(px + 1, py)]! : 0
        const upG = py > 0 ? corrG[idx(px, py - 1)]! : 0
        const downG = py < h - 1 ? corrG[idx(px, py + 1)]! : 0
        corrG[i] = (leftG + rightG + upG + downG - rhsG[i]!) * 0.25

        const leftB = px > 0 ? corrB[idx(px - 1, py)]! : 0
        const rightB = px < w - 1 ? corrB[idx(px + 1, py)]! : 0
        const upB = py > 0 ? corrB[idx(px, py - 1)]! : 0
        const downB = py < h - 1 ? corrB[idx(px, py + 1)]! : 0
        corrB[i] = (leftB + rightB + upB + downB - rhsB[i]!) * 0.25
      }
    }
  }

  const rgb = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const o = i * 3
    let r = initR[i]! + corrR[i]!
    let g = initG[i]! + corrG[i]!
    let b = initB[i]! + corrB[i]!
    // Residual Poisson can collapse isolated detail to black on some seeds;
    // keep the compact gradient-domain blend when correction goes degenerate.
    if (mask[i]! && isDegenerateHeal(r, g, b, initR[i]!, initG[i]!, initB[i]!)) {
      r = initR[i]!
      g = initG[i]!
      b = initB[i]!
    }
    rgb[o] = Math.max(0, Math.min(255, r))
    rgb[o + 1] = Math.max(0, Math.min(255, g))
    rgb[o + 2] = Math.max(0, Math.min(255, b))
  }
  return rgb
}

/** True when Poisson residual correction wiped a non-trivial gradient-domain seed. */
function isDegenerateHeal(
  r: number,
  g: number,
  b: number,
  initR: number,
  initG: number,
  initB: number,
): boolean {
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return true
  const initMag = Math.abs(initR) + Math.abs(initG) + Math.abs(initB)
  const outMag = Math.abs(r) + Math.abs(g) + Math.abs(b)
  return initMag > 30 && outMag < 5
}
