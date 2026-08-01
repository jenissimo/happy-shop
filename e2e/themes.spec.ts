import { expect, test } from '@playwright/test'

const themes = [
  'graphite',
  'midnight',
  'paper',
  'ember',
  'abyss',
  'moss',
  'ink',
  'frost',
  'dusk',
  'mist',
  'vapor',
  'crystal',
]

test.describe('editor themes', () => {
  for (const theme of themes) {
    test(`${theme} keeps the editing field themed and usable`, async ({ page }) => {
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem('happy-shop.theme', selectedTheme)
      }, theme)
      await page.goto('/')

      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.getByTestId('viewport-host')).toBeVisible()
      await expect
        .poll(() =>
          page.evaluate(() => {
            const style = getComputedStyle(document.documentElement)
            return [
              style.getPropertyValue('--he-workspace').trim(),
              style.getPropertyValue('--he-checker-a').trim(),
              style.getPropertyValue('--he-checker-b').trim(),
            ].every(Boolean)
          }),
        )
        .toBe(true)
    })
  }
})
