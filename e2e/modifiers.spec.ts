import { expect, test, type Page } from '@playwright/test'

async function openMarquee(page: Page) {
  await page.goto('/')
  await expect(page.getByText('Happy Shop').first()).toBeVisible({ timeout: 30_000 })
  // A recovered session may be an empty Untitled document, so create a
  // deterministic selected raster target instead of relying on demo layers.
  await page.getByRole('button', { name: /^New Layer$/i }).click()
  await page.getByRole('button', { name: /Rectangular Marquee Tool/i }).click()
  const host = page.getByTestId('viewport-host')
  await expect(host).toBeVisible()
  const box = await host.boundingBox()
  expect(box).toBeTruthy()
  return { host, box: box! }
}

test.describe('tool modifiers', () => {
  test('Shift constrains a marquee drag to a square', async ({ page }) => {
    const { box } = await openMarquee(page)
    const x0 = box.x + box.width * 0.35
    const y0 = box.y + box.height * 0.35
    const x1 = x0 + 140
    const y1 = y0 + 55

    await page.mouse.move(x0, y0)
    await page.mouse.down()
    await page.keyboard.down('Shift')
    await page.mouse.move(x1, y1, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.up('Shift')

    await expect
      .poll(() => page.evaluate(() => window.__happyShopE2E!.selectionSize()))
      .toMatchObject({ width: expect.any(Number), height: expect.any(Number) })
    const size = await page.evaluate(() => window.__happyShopE2E!.selectionSize())
    expect(size).not.toBeNull()
    expect(Math.abs(size!.width - size!.height)).toBeLessThanOrEqual(1)
  })

  test('Alt makes a marquee drag expand from its start point', async ({ page }) => {
    const { box } = await openMarquee(page)
    const x0 = box.x + box.width * 0.45
    const y0 = box.y + box.height * 0.45
    const x1 = x0 + 70
    const y1 = y0 + 45

    await page.mouse.move(x0, y0)
    await page.mouse.down()
    await page.mouse.move(x1, y1, { steps: 5 })
    await page.mouse.up()
    const ordinary = await page.evaluate(() => window.__happyShopE2E!.selectionSize())
    expect(ordinary).not.toBeNull()

    await page.mouse.move(x0, y0)
    await page.mouse.down()
    await page.keyboard.down('Alt')
    await page.mouse.move(x1, y1, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.up('Alt')
    const centered = await page.evaluate(() => window.__happyShopE2E!.selectionSize())
    expect(centered).not.toBeNull()
    // DOM/client-to-document coordinate rounding can lose up to two document
    // pixels across the mirrored edges.
    expect(centered!.width).toBeGreaterThanOrEqual(ordinary!.width * 2 - 3)
    expect(centered!.height).toBeGreaterThanOrEqual(ordinary!.height * 2 - 3)
  })
})
