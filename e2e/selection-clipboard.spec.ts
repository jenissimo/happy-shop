import { expect, test, type Page } from '@playwright/test'

async function waitForDemo(page: Page) {
  await page.goto('/')
  await expect(page.getByText('Happy Shop').first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText('Background').first()).toBeVisible({
    timeout: 15_000,
  })
  await expect
    .poll(async () => page.evaluate(() => !!window.__happyShopE2E), {
      timeout: 15_000,
    })
    .toBe(true)
}

async function selectLayerByName(page: Page, name: string) {
  await page.getByText(name, { exact: true }).first().click()
  await expect
    .poll(async () =>
      page.evaluate(
        (n) => window.__happyShopE2E!.selectedLayerNames().includes(n),
        name,
      ),
    )
    .toBe(true)
}

test.describe('JTBD Wave F — selection / clipboard / layers', () => {
  test('marquee → fill → undo', async ({ page }) => {
    await waitForDemo(page)
    await selectLayerByName(page, 'Background')

    await page
      .getByRole('button', { name: /Rectangular Marquee Tool/i })
      .click()

    const host = page.getByTestId('viewport-host')
    await expect(host).toBeVisible()
    const box = await host.boundingBox()
    expect(box).toBeTruthy()
    const x0 = box!.x + box!.width * 0.35
    const y0 = box!.y + box!.height * 0.35
    const x1 = box!.x + box!.width * 0.65
    const y1 = box!.y + box!.height * 0.65

    await page.mouse.move(x0, y0)
    await page.mouse.down()
    await page.mouse.move(x1, y1, { steps: 8 })
    await page.mouse.up()

    await expect(page.getByTestId('status-selection-size')).toBeVisible({
      timeout: 5_000,
    })
    await expect
      .poll(async () =>
        page.evaluate(() => window.__happyShopE2E!.hasSelection()),
      )
      .toBe(true)

    // Await the async fill path (menu/command `run` is fire-and-forget).
    const filled = await page.evaluate(() =>
      window.__happyShopE2E!.fillSelection(),
    )
    expect(filled).toBe(true)
    await expect
      .poll(async () =>
        page.evaluate(() => window.__happyShopE2E!.undoLabel()),
      )
      .toBe('Fill')

    await page.keyboard.press('Control+z')
    await expect
      .poll(async () => page.evaluate(() => window.__happyShopE2E!.canUndo()))
      .toBe(false)
  })

  test('paste image → new Pasted Layer (mocked clipboard)', async ({
    page,
  }) => {
    await waitForDemo(page)
    await selectLayerByName(page, 'Background')

    const before = await page.evaluate(() =>
      window.__happyShopE2E!.layerNames(),
    )
    expect(before).not.toContain('Pasted Layer')

    await page.evaluate(() => {
      const w = 16
      const h = 16
      const rgba = new Uint8ClampedArray(w * h * 4)
      for (let i = 0; i < w * h; i++) {
        rgba[i * 4] = 255
        rgba[i * 4 + 1] = 64
        rgba[i * 4 + 2] = 128
        rgba[i * 4 + 3] = 255
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.putImageData(new ImageData(rgba, w, h), 0, 0)
      // HappyClipboard accepts rgba without needing a real Blob decode path.
      window.__happyShopE2E!.setHappyClipboard({
        blob: new Blob(),
        width: w,
        height: h,
        mimeType: 'image/png',
        originX: 0,
        originY: 0,
        rgba,
      })
    })

    await page.keyboard.press('Control+v')
    await expect(page.getByText('Pasted Layer').first()).toBeVisible({
      timeout: 10_000,
    })
    await expect
      .poll(async () =>
        page.evaluate(() =>
          window.__happyShopE2E!.layerNames().includes('Pasted Layer'),
        ),
      )
      .toBe(true)
  })

  test('layers action-bar delete removes selected layer', async ({ page }) => {
    await waitForDemo(page)
    await expect(page.getByText('Panel', { exact: true }).first()).toBeVisible()
    await selectLayerByName(page, 'Panel')

    await page.getByRole('button', { name: /^Delete Layer/i }).click()

    await expect(page.getByText('Panel', { exact: true })).toHaveCount(0, {
      timeout: 5_000,
    })
    await expect(page.getByText('Background').first()).toBeVisible()
  })

  test('Help → Keyboard Shortcuts lists clipboard shortcuts', async ({
    page,
  }) => {
    await waitForDemo(page)
    await page.getByRole('button', { name: 'Help' }).click()
    await page.getByRole('button', { name: /Keyboard Shortcuts/i }).click()
    const dialog = page.getByRole('dialog', { name: /Keyboard Shortcuts/i })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Edit' })).toBeVisible()
    await expect(dialog.getByText('Cut / Copy / Paste')).toBeVisible()
    await expect(dialog.getByText('Paste in Place')).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Select' })).toBeVisible()
    await expect(dialog.getByText('Inverse')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })
})
