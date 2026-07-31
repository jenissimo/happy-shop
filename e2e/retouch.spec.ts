import { expect, test, type Page } from '@playwright/test'

async function waitForShell(page: Page) {
  await page.goto('/')
  await expect(page.getByText('Happy Shop').first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(
    page.getByRole('toolbar', { name: 'Tools' }).or(page.getByLabel('Tools')),
  ).toBeVisible()
  await expect
    .poll(async () => page.evaluate(() => !!window.__happyShopE2E), {
      timeout: 15_000,
    })
    .toBe(true)
}

async function ensurePaintTarget(page: Page) {
  const background = page.getByText('Background', { exact: true }).first()
  if (await background.isVisible().catch(() => false)) {
    await background.click()
    await expect
      .poll(async () =>
        page.evaluate(
          (n) => window.__happyShopE2E!.selectedLayerNames().includes(n),
          'Background',
        ),
      )
      .toBe(true)
    return
  }

  await page.getByRole('button', { name: /^New Layer$/i }).click()
  await expect
    .poll(async () =>
      page.evaluate(() => window.__happyShopE2E!.selectedLayerNames().length > 0),
    )
    .toBe(true)

  await page
    .getByRole('button', { name: /Rectangular Marquee Tool/i })
    .click()
  const { box } = await viewportBox(page)
  const x0 = box.x + box.width * 0.3
  const y0 = box.y + box.height * 0.3
  const x1 = box.x + box.width * 0.55
  const y1 = box.y + box.height * 0.55
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x1, y1, { steps: 6 })
  await page.mouse.up()
  await expect
    .poll(async () => page.evaluate(() => window.__happyShopE2E!.hasSelection()))
    .toBe(true)
  const filled = await page.evaluate(() =>
    window.__happyShopE2E!.fillSelection(),
  )
  expect(filled).toBe(true)
}

/** Default flyout prefs so strip slots match Photoshop-first variants. */
async function resetFlyoutPrefs(page: Page) {
  await page.evaluate(() => localStorage.removeItem('happy-shop.tool-flyouts'))
  await page.reload()
  await expect(
    page.getByRole('toolbar', { name: 'Tools' }).or(page.getByLabel('Tools')),
  ).toBeVisible({ timeout: 15_000 })
  await expect
    .poll(async () => page.evaluate(() => !!window.__happyShopE2E), {
      timeout: 15_000,
    })
    .toBe(true)
}

async function viewportBox(page: Page) {
  const host = page.getByTestId('viewport-host')
  await expect(host).toBeVisible()
  const box = await host.boundingBox()
  expect(box).toBeTruthy()
  return { host, box: box! }
}

async function expectActiveTool(page: Page, toolId: string) {
  await expect
    .poll(async () =>
      page.evaluate(() => window.__happyShopE2E!.activeToolId()),
    )
    .toBe(toolId)
}

test.describe('retouch tools', () => {
  test('stamp flyout click selects History Brush variant', async ({ page }) => {
    await waitForShell(page)
    await resetFlyoutPrefs(page)

    await page
      .getByRole('button', { name: /Clone Stamp Tool \(S\)/i })
      .click()
    await expectActiveTool(page, 'cloneStamp')

    await page
      .getByRole('button', { name: /Choose Clone Stamp Tool variant/i })
      .click()
    await page
      .getByRole('menuitem', { name: /History Brush Tool/i })
      .click()

    await expectActiveTool(page, 'historyBrush')
    await expect(
      page.getByText(/Captures this layer on first use/i),
    ).toBeVisible()
  })

  test('healing flyout click selects Healing Brush variant', async ({ page }) => {
    await waitForShell(page)
    await resetFlyoutPrefs(page)

    await page
      .getByRole('button', { name: /Choose Spot Healing Brush Tool variant/i })
      .click()
    await page
      .getByRole('menuitem', { name: 'Healing Brush Tool', exact: true })
      .click()

    await expectActiveTool(page, 'healingBrush')
    await expect(page.getByText(/Alt-click source/i)).toBeVisible()
  })

  test('Clone Stamp Alt-click assigns source then paint creates undo', async ({
    page,
  }) => {
    await waitForShell(page)
    await ensurePaintTarget(page)

    await page
      .getByRole('button', { name: /Clone Stamp Tool \(S\)/i })
      .click()
    await expectActiveTool(page, 'cloneStamp')

    const undoBefore = await page.evaluate(() =>
      window.__happyShopE2E!.canUndo(),
    )

    const { box } = await viewportBox(page)
    const sourceX = box.x + box.width * 0.2
    const sourceY = box.y + box.height * 0.2
    const destX = box.x + box.width * 0.35
    const destY = box.y + box.height * 0.35

    await page.mouse.move(sourceX, sourceY)
    await page.keyboard.down('Alt')
    await page.mouse.down()
    await page.mouse.up()
    await page.keyboard.up('Alt')
    await expect
      .poll(async () => page.evaluate(() => window.__happyShopE2E!.canUndo()))
      .toBe(undoBefore)

    await page.mouse.move(destX, destY)
    await page.mouse.down()
    await page.mouse.move(destX + 48, destY + 32, { steps: 6 })
    await page.mouse.up()

    await expect
      .poll(async () =>
        page.evaluate(() => window.__happyShopE2E!.undoLabel()),
      )
      .toBe('Clone Stamp')
  })
})
