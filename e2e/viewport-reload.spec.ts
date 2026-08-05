import { expect, test, type Page } from '@playwright/test'

/**
 * "Reload graphics" tears the Pixi Application down, and Pixi's
 * `GlContextSystem.destroy()` calls `WEBGL_lose_context.loseContext()`. Reusing
 * the same `<canvas>` afterwards hands the next `Application.init` that same,
 * permanently lost context, which spins the main thread — the tab stops
 * responding to any input at all. So these tests assert on *pixels and
 * interaction*, not on the absence of an exception: a viewport that renders the
 * checkerboard paints two greys at its centre, a dead one paints one flat
 * colour, and a hung tab cannot answer a click.
 */

/** Distinct colours in a 160x160 patch at the viewport centre. */
async function centreColours(page: Page): Promise<number> {
  const box = await page.getByTestId('viewport-host').boundingBox()
  if (!box) return 0
  // A shot taken right after a real click composites far more reliably than one
  // after an idle wait; full-page shots are far more reliable than clipped ones.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(250)
  const shot = (await page.screenshot({ fullPage: true })).toString('base64')
  return page.evaluate(
    async ({ shot, cx, cy }) => {
      const image = new Image()
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = reject
        image.src = `data:image/png;base64,${shot}`
      })
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, 0, 0)
      const { data } = ctx.getImageData(cx - 80, cy - 80, 160, 160)
      const seen = new Set<number>()
      for (let i = 0; i < data.length; i += 4) {
        seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
      }
      return seen.size
    },
    {
      shot,
      cx: Math.round(box.x + box.width / 2),
      cy: Math.round(box.y + box.height / 2),
    },
  )
}

async function bootViewport(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('viewport-host')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2500)
}

test('the viewport keeps rendering and responding after a hard graphics reload', async ({
  page,
}) => {
  await bootViewport(page)
  expect(await centreColours(page)).toBeGreaterThan(1)

  await page.evaluate(() => window.__happyShopViewport!.reloadGraphics())
  await page.waitForTimeout(2000)
  expect(await centreColours(page)).toBeGreaterThan(1)

  // Every later locator call also proves the main thread is not spinning.
  const host = page.getByTestId('viewport-host')
  const box = (await host.boundingBox())!
  const x = box.x + box.width / 2 - 120
  const y = box.y + box.height / 2

  await page.getByRole('button', { name: /Type Tool/i }).first().click()
  await page.mouse.click(x, y)
  const editor = page.locator('div[aria-label="Edit text"]')
  await expect(editor).toBeVisible({ timeout: 10_000 })
  await page.keyboard.type('Reload')
  await page.getByRole('button', { name: /Move Tool/i }).first().click()
  await expect(editor).toHaveCount(0, { timeout: 10_000 })

  await page.getByRole('button', { name: 'Layer Style' }).first().click()
  const dialog = page.locator('[role="dialog"]').last()
  const stroke = dialog.getByRole('button', { name: /Stroke/i }).first()
  await stroke.click()
  await stroke.locator('input[type="checkbox"]').check()
  // Default position is `inside`, which an unfilled glyph edge can hide.
  await dialog.locator('select').nth(1).selectOption('outside')
  await dialog.getByRole('button', { name: 'OK' }).last().click()

  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let step = 0; step < 10; step += 1) {
    await page.mouse.move(x + step * 6, y + step * 4)
  }
  await page.mouse.up()
  await page.waitForTimeout(300)
  expect(await centreColours(page)).toBeGreaterThan(1)
})

test('context loss surfaces a banner whose recovery button restores the viewport', async ({
  page,
}) => {
  await bootViewport(page)

  await page.evaluate(() => window.__happyShopViewport!.simulateContextLoss())
  const banner = page.getByTestId('webgl-context-banner')
  await expect(banner).toBeVisible({ timeout: 10_000 })

  await banner.getByRole('button', { name: 'Reload graphics' }).click()
  await expect(banner).toHaveCount(0, { timeout: 20_000 })
  expect(await centreColours(page)).toBeGreaterThan(1)
})
