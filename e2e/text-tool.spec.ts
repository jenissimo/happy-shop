import { expect, test } from '@playwright/test'

/**
 * Type tool round trip: create point text, commit it, and click it again to
 * re-enter the edit session. The overlay must project the layer with the same
 * document-pixel metrics the committed HTMLText uses, scaled only by the
 * camera — anything else makes editing look different from the baked layer.
 */
test('type tool re-enters editing and projects text at camera scale', async ({
  page,
}) => {
  await page.goto('/')
  const host = page.getByTestId('viewport-host')
  await expect(host).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(3000)

  const box = (await host.boundingBox())!
  const px = box.x + box.width / 2 - 100
  const py = box.y + box.height / 2

  await page.getByRole('button', { name: /Type Tool/i }).first().click()
  await page.mouse.click(px, py)

  const editor = page.locator('div[aria-label="Edit text"]')
  await expect(editor).toBeVisible({ timeout: 10_000 })
  await page.keyboard.type('Hello World')

  // Switching tools blurs the editor, which commits the layer.
  await page.getByRole('button', { name: /Move Tool/i }).first().click()
  await expect(editor).toHaveCount(0, { timeout: 10_000 })

  // Clicking committed glyphs with the Type tool re-opens the same layer.
  await page.getByRole('button', { name: /Type Tool/i }).first().click()
  await page.mouse.click(px + 60, py + 10)
  await expect(editor).toBeVisible({ timeout: 10_000 })
  await expect(editor).toBeFocused()
  await expect(editor).toHaveText('Hello World')

  // Type options act on the running session: reaching for the options bar
  // must not commit the layer out from under the caret.
  await page.locator('button[title="Align center"]').first().click()
  await page.waitForTimeout(400)
  await expect(editor).toBeVisible()

  const fontSize = Number(
    await page.locator('input[title="Size"]').first().inputValue(),
  )
  const metrics = await editor.evaluate((el) => {
    const style = getComputedStyle(el)
    const span = el.querySelector('span')
    return {
      fontSize: style.fontSize,
      spanFontSize: span ? getComputedStyle(span).fontSize : null,
      scaleX: new DOMMatrix(style.transform).a,
    }
  })
  // Document pixels in the CSS, camera zoom in the matrix.
  expect(metrics.fontSize).toBe(`${fontSize}px`)
  expect(metrics.spanFontSize).toBe(`${fontSize}px`)
  const zoomPercent = Number(
    (await page.getByText(/^\d+%$/).first().innerText()).replace('%', ''),
  )
  expect(metrics.scaleX).toBeCloseTo(zoomPercent / 100, 2)
})
