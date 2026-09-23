import { expect, test } from '@playwright/test'
import { importBackup, injuriesBackup } from './helpers'

test('log pain in two taps, undo it, and logs persist across reloads', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/')

  await page.getByRole('button', { name: 'Quick log' }).click()
  const sheet = page.getByRole('dialog', { name: 'Quick log' })
  await expect(sheet.getByRole('button', { name: 'Tennis elbow' })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('radio', { name: '6', exact: true }).click()

  await expect(page.getByText('Pain 6 · Moderate — Tennis elbow')).toBeVisible()
  await expect(sheet).toBeHidden()
  const row = page.getByRole('link', { name: /^6 Pain Tennis elbow/ })
  await expect(row).toBeVisible()
  await expect(page.getByTestId('pain-avg')).toHaveText('6.0')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(row).toHaveCount(0)
  await expect(page.getByTestId('pain-avg')).toHaveText('—')

  await page.getByRole('button', { name: 'Quick log' }).click()
  await sheet.getByRole('radio', { name: '3', exact: true }).click()
  await expect(page.getByRole('link', { name: /^3 Pain Tennis elbow/ })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('link', { name: /^3 Pain Tennis elbow/ })).toBeVisible()
  await expect(page.getByTestId('pain-avg')).toHaveText('3.0')
  await expect(page.getByTestId('pain-latest')).toHaveText('3')
})

test('remembers the injury you logged against last', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow', 'Knee'))
  await page.goto('/')
  const sheet = page.getByRole('dialog', { name: 'Quick log' })

  await page.getByRole('button', { name: 'Quick log' }).click()
  await sheet.getByRole('button', { name: 'Knee' }).click()
  await sheet.getByRole('radio', { name: '4', exact: true }).click()
  await expect(page.getByText('Pain 4 · Moderate — Knee')).toBeVisible()

  await page.getByRole('button', { name: 'Quick log' }).click()
  await expect(sheet.getByRole('button', { name: 'Knee' })).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByRole('button', { name: 'Tennis elbow' })).toHaveAttribute('aria-pressed', 'false')
})

test('general pain without an injury', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/')
  await page.getByRole('button', { name: 'Quick log' }).click()
  const sheet = page.getByRole('dialog', { name: 'Quick log' })
  await sheet.getByRole('button', { name: 'General' }).click()
  await sheet.getByRole('radio', { name: '2', exact: true }).click()
  await expect(page.getByText(/^Pain 2 · Mild$/)).toBeVisible()
  await expect(page.getByRole('link', { name: /^2 Pain General/ })).toBeVisible()
})

test('the sheet closes with the close button and the backdrop', async ({ page }) => {
  await page.goto('/')
  const sheet = page.getByRole('dialog', { name: 'Quick log' })

  await page.getByRole('button', { name: 'Quick log' }).click()
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toBeHidden()

  await page.getByRole('button', { name: 'Quick log' }).click()
  await sheet.locator('> div').first().click({ position: { x: 200, y: 40 } }) // backdrop above the sheet
  await expect(sheet).toBeHidden()
})

test('sheet shortcuts open the right forms', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/')
  const sheet = page.getByRole('dialog', { name: 'Quick log' })
  for (const [row, heading] of [
    ['Symptom Details', 'Log Symptom'],
    ['Measurement', 'Measurement'],
    ['Note', 'Note'],
    ['Meal', 'Meal'],
    ['Rehab Session', 'Rehab Session'],
  ]) {
    await page.goto('/')
    await page.getByRole('button', { name: 'Quick log' }).click()
    await sheet.getByRole('button', { name: new RegExp(`^${row}`) }).click()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
})
