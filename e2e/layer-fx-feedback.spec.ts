import { expect, test } from '@playwright/test'

/**
 * Several layer FX render a helper texture before their composite pass — Stroke,
 * Outer Glow and Inner Glow a jump-flood distance field; Drop Shadow, Inner
 * Shadow, Satin and Bevel & Emboss a separable Gaussian. Both override
 * `Filter.apply`, ping-pong textures out of Pixi's `TexturePool`, and then
 * sample the surviving one from a second sampler while the filter's own input is
 * sampled from the first.
 *
 * That is only safe because of one Pixi invariant: `GlRenderTargetAdaptor`
 * detaches every colour texture of a render target from *all* texture units at
 * the start of each pass (`startRenderPass` → `renderer.texture.unbind`). Without
 * it a pooled texture handed back and immediately re-acquired as a render target
 * would still be bound to a sampler, and every draw into it would be dropped by
 * the driver with `GL_INVALID_OPERATION: Feedback loop formed between Framebuffer
 * and active Texture`.
 *
 * The invariant lives in `node_modules`, so this guard pins it from the outside:
 * it shadows the real WebGL binding state — active unit, unit → texture, FBO →
 * colour attachments — and fails if any draw call ever targets a framebuffer
 * whose attachment is simultaneously bound to a sampler unit. Driver validation
 * messages are collected too, so both the model and the driver have to agree on
 * zero. The check is browser- and GPU-independent: it does not rely on ANGLE
 * emitting a warning.
 */

/** Shadows WebGL binding state and flags every draw that forms a feedback loop. */
const WATCH_FEEDBACK_LOOPS = () => {
  const stats = { draws: 0, loops: 0, units: [] as number[] }
  ;(window as unknown as { __glFeedback: typeof stats }).__glFeedback = stats

  const protos = [
    (window as unknown as { WebGL2RenderingContext?: { prototype: any } })
      .WebGL2RenderingContext?.prototype,
    (window as unknown as { WebGLRenderingContext?: { prototype: any } })
      .WebGLRenderingContext?.prototype,
  ].filter(Boolean)

  const TEXTURE0 = 0x84c0
  const COLOR_ATTACHMENT0 = 0x8ce0
  const FRAMEBUFFER = 0x8d40
  const DRAW_FRAMEBUFFER = 0x8ca9
  const READ_FRAMEBUFFER = 0x8ca8

  for (const proto of protos) {
    const states = new WeakMap<object, any>()
    const stateOf = (gl: object) => {
      let state = states.get(gl)
      if (!state) {
        state = {
          activeUnit: 0,
          units: [] as unknown[],
          draw: null as unknown,
          read: null as unknown,
          attachments: new WeakMap<object, unknown[]>(),
        }
        states.set(gl, state)
      }
      return state
    }

    const activeTexture = proto.activeTexture
    proto.activeTexture = function (unit: number) {
      stateOf(this).activeUnit = unit - TEXTURE0
      return activeTexture.call(this, unit)
    }

    const bindTexture = proto.bindTexture
    proto.bindTexture = function (target: number, texture: unknown) {
      const state = stateOf(this)
      state.units[state.activeUnit] = texture
      return bindTexture.call(this, target, texture)
    }

    const bindFramebuffer = proto.bindFramebuffer
    proto.bindFramebuffer = function (target: number, fb: unknown) {
      const state = stateOf(this)
      if (target === FRAMEBUFFER) {
        state.draw = fb
        state.read = fb
      } else if (target === DRAW_FRAMEBUFFER) {
        state.draw = fb
      } else if (target === READ_FRAMEBUFFER) {
        state.read = fb
      }
      return bindFramebuffer.call(this, target, fb)
    }

    const record = (gl: any, target: number, attachment: number, texture: unknown) => {
      const state = stateOf(gl)
      const fb = target === READ_FRAMEBUFFER ? state.read : state.draw
      if (!fb) return
      let list = state.attachments.get(fb)
      if (!list) {
        list = []
        state.attachments.set(fb, list)
      }
      list[attachment - COLOR_ATTACHMENT0] = texture
    }

    const framebufferTexture2D = proto.framebufferTexture2D
    proto.framebufferTexture2D = function (
      target: number,
      attachment: number,
      texTarget: number,
      texture: unknown,
      level: number,
    ) {
      record(this, target, attachment, texture)
      return framebufferTexture2D.call(this, target, attachment, texTarget, texture, level)
    }

    const framebufferTextureLayer = proto.framebufferTextureLayer
    if (framebufferTextureLayer) {
      proto.framebufferTextureLayer = function (
        target: number,
        attachment: number,
        texture: unknown,
        level: number,
        layer: number,
      ) {
        record(this, target, attachment, texture)
        return framebufferTextureLayer.call(this, target, attachment, texture, level, layer)
      }
    }

    const inspect = (gl: any) => {
      stats.draws += 1
      const state = stateOf(gl)
      if (!state.draw) return
      const attached = state.attachments.get(state.draw)
      if (!attached) return
      for (let unit = 0; unit < state.units.length; unit += 1) {
        const texture = state.units[unit]
        if (texture && attached.indexOf(texture) !== -1) {
          stats.loops += 1
          if (!stats.units.includes(unit)) stats.units.push(unit)
          return
        }
      }
    }

    for (const name of [
      'drawElements',
      'drawArrays',
      'drawElementsInstanced',
      'drawArraysInstanced',
    ]) {
      const draw = proto[name]
      if (!draw) continue
      proto[name] = function (...args: unknown[]) {
        inspect(this)
        return draw.apply(this, args)
      }
    }
  }
}

test('multi-pass layer FX never sample the framebuffer they draw into', async ({
  page,
}) => {
  // Seven effects, each swept over its whole radius range, on a live viewport:
  // a long soak by design, and slower again when the suite runs in parallel.
  test.setTimeout(300_000)
  const driverWarnings: string[] = []
  page.on('console', (message) => {
    if (/Feedback loop|INVALID_OPERATION/i.test(message.text())) {
      driverWarnings.push(message.text())
    }
  })
  await page.addInitScript(WATCH_FEEDBACK_LOOPS)
  await page.goto('/')

  const host = page.getByTestId('viewport-host')
  await expect(host).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(3000)

  const box = (await host.boundingBox())!
  const px = box.x + box.width / 2 - 120
  const py = box.y + box.height / 2

  await page.getByRole('button', { name: /Type Tool/i }).first().click()
  await page.mouse.click(px, py)
  const editor = page.locator('div[aria-label="Edit text"]')
  await expect(editor).toBeVisible({ timeout: 10_000 })
  await page.keyboard.type('Hello')
  await page.getByRole('button', { name: /Move Tool/i }).first().click()
  await expect(editor).toHaveCount(0, { timeout: 10_000 })

  await page.getByRole('button', { name: 'Layer Style' }).first().click()
  const dialog = page.locator('[role="dialog"]').last()

  const enable = async (name: RegExp) => {
    const row = dialog.getByRole('button', { name }).first()
    // A heavy stack drops the frame rate far enough that Playwright's stability
    // check never settles; the rows themselves do not move.
    await row.click({ force: true })
    await row.locator('input[type="checkbox"]').check()
    await page.waitForTimeout(300)
  }

  // Every distance-field consumer, across the whole range of flood radii: one
  // jump-flood step at 1px, five at 40px, eight at 166px.
  await enable(/Stroke/i)
  for (const position of ['outside', 'center', 'inside']) {
    await dialog.locator('select').nth(1).selectOption(position)
    for (const size of ['1', '40', '166']) {
      await dialog.locator('input[type="number"]').nth(1).fill(size)
      await page.waitForTimeout(300)
    }
  }
  // Back to a cheap stroke: the 166px pad alone makes the filter texture large
  // enough that the stack below would not stay interactive.
  await dialog.locator('input[type="number"]').nth(1).fill('8')
  await enable(/Outer Glow/i)
  await enable(/Inner Glow/i)

  // Every Gaussian consumer, at both ends of the tap schedule: a one-pair kernel
  // at 1px and a 40-pair one at 120px, then back to a cheap size so the stack
  // stays interactive for the drag below.
  for (const effect of [/Drop Shadow/i, /Inner Shadow/i, /Satin/i, /Bevel & Emboss/i]) {
    await enable(effect)
    for (const size of ['1', '120', '5']) {
      await dialog.getByLabel('Size value').fill(size)
      await page.waitForTimeout(200)
    }
  }

  await dialog.getByRole('button', { name: 'OK' }).last().click({ force: true })
  await page.waitForTimeout(1000)

  // A drag keeps the FX chain re-rendering, so the pooled field textures are
  // acquired and released many times over.
  await page.mouse.move(px, py)
  await page.mouse.down()
  for (let step = 0; step < 20; step += 1) {
    await page.mouse.move(px + Math.sin(step / 3) * 60, py + Math.cos(step / 3) * 40)
  }
  await page.mouse.up()
  await page.waitForTimeout(500)

  const stats = await page.evaluate(
    () => (window as unknown as { __glFeedback: { draws: number; loops: number; units: number[] } }).__glFeedback,
  )

  // A viewport that never drew anything would report zero loops for free.
  expect(stats.draws).toBeGreaterThan(500)
  expect(
    { loops: stats.loops, units: stats.units, driverWarnings },
  ).toEqual({ loops: 0, units: [], driverWarnings: [] })
})
