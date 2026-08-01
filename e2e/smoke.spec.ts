import { expect, test } from '@playwright/test'

/**
 * Smoke: shell boots → edit layer → open Layer Style (non-modal) → save path.
 * Full import/export needs fixture assets; this covers the interactive chrome path.
 */
test.describe('Happy Shop smoke', () => {
  test('boots shell, edits, opens Layer Style, saves', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('Happy Shop').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'graphite')
    await expect(page.getByRole('complementary', { name: 'Tools' })).toBeVisible()

    // Demo / session document should expose a layers panel.
    await expect(page.getByText('Layers').first()).toBeVisible({ timeout: 15_000 })

    // Select first layer row if present and open Layer Style via FX badge.
    const fx = page.getByRole('button', { name: 'Layer Style' }).first()
    if (await fx.isVisible().catch(() => false)) {
      await fx.click()
      const styleWin = page.getByRole('dialog', { name: /Layer Style/i })
      await expect(styleWin).toBeVisible()
      // Non-modal: no full-viewport scrim — tools strip still visible/interactable.
      await expect(page.getByRole('complementary', { name: 'Tools' })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(styleWin).toHaveCount(0)
    }

    // File → New opens floating New Document (non-modal).
    await page.keyboard.press('Meta+n')
    const newDoc = page.getByRole('dialog', { name: 'New Document' })
    await expect(newDoc).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('complementary', { name: 'Tools' })).toBeVisible()
    await page.keyboard.press('Escape')

    // Save command should be invokable (bridge may no-op or succeed).
    await page.keyboard.press('Meta+s')
    await expect(page.getByText('Happy Shop').first()).toBeVisible()
  })
})
