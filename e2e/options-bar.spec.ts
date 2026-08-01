import { expect, test } from '@playwright/test'

async function chooseTool(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name }).click()
}

test.describe('tool options hierarchy', () => {
  test('keeps primary controls visible and opens secondary details', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('toolbar', { name: 'Tool options' })).toBeVisible()

    await chooseTool(page, 'Brush Tool (B)')
    await expect(page.getByLabel('Brush details')).toBeVisible()
    await page.getByLabel('Brush details').click()
    await expect(page.getByRole('dialog', { name: 'Brush details' })).toBeVisible()
    await expect(page.getByText('Roundness')).toBeVisible()
    await page.keyboard.press('Escape')

    await chooseTool(page, 'Shape Tool (U)')
    await expect(page.getByLabel('Shape details')).toBeVisible()

    await chooseTool(page, 'Pen Tool (P)')
    await expect(page.getByLabel('Pen path details')).toBeVisible()

    await chooseTool(page, 'Type Tool (T)')
    await expect(page.getByLabel('Text details')).toBeVisible()

    await chooseTool(page, 'Paint Bucket Tool (G)')
    await expect(page.getByLabel('Paint Bucket details')).toBeVisible()
  })
})
