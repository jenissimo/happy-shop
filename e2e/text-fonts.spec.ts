import { expect, test } from '@playwright/test'

/**
 * Picking a font has to reach the glyphs: the runs carry the face (the layer
 * default alone changes nothing), and the viewport needs the face handed to it
 * explicitly, because Pixi rasterizes text through an SVG image that cannot see
 * the page's `@font-face` rules.
 */
test('a bundled font reaches the runs and the viewport renderer', async ({
  page,
}) => {
  await page.goto('/')
  const host = page.getByTestId('viewport-host')
  await expect(host).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(3000)

  const box = (await host.boundingBox())!
  const px = box.x + box.width / 2 - 250
  const py = box.y + box.height / 2

  await page.getByRole('button', { name: /Type Tool/i }).first().click()
  await page.mouse.click(px, py)
  const editor = page.locator('div[aria-label="Edit text"]')
  await expect(editor).toBeVisible({ timeout: 10_000 })
  await page.keyboard.type('Hamburgefons')
  await page.getByRole('button', { name: /Move Tool/i }).first().click()
  await expect(editor).toHaveCount(0)

  await page.locator('button').filter({ hasText: /^Segoe UI$/ }).first().click()
  await page.getByRole('dialog').getByText('Inter', { exact: true }).first().click()
  await page.waitForTimeout(1500)

  // Re-open the layer: both the layer default and every run must be on Inter.
  await page.getByRole('button', { name: /Type Tool/i }).first().click()
  await page.mouse.click(px + 60, py + 5)
  await expect(editor).toBeVisible({ timeout: 10_000 })
  const applied = await editor.evaluate((el) => ({
    layer: getComputedStyle(el).fontFamily,
    run: el.querySelector('span')
      ? getComputedStyle(el.querySelector('span')!).fontFamily
      : null,
  }))
  expect(applied.layer).toContain('Inter')
  expect(applied.run).toContain('Inter')
})
