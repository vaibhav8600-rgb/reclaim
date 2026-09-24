import { expect, test } from '@playwright/test'
import { importBackup, injuriesBackup, PNG } from './helpers'

const theme = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.dataset.theme)

test('appearance: follow the system, or always light or dark — kept across reloads, no flash', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/settings')
  expect(await theme(page)).toBe('dark') // System, following the (emulated) system
  await expect(page.getByRole('radio', { name: 'System' })).toBeChecked()

  await page.getByRole('radio', { name: 'Light' }).click()
  expect(await theme(page)).toBe('light')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(242, 242, 247)')
  await page.reload()
  expect(await theme(page)).toBe('light') // set before the app loads, from public/theme.js

  await page.getByRole('radio', { name: 'Dark' }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  expect(await theme(page)).toBe('dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)')

  await page.getByRole('radio', { name: 'System' }).click()
  expect(await theme(page)).toBe('light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => theme(page)).toBe('dark') // follows the system switching live
})

test('a profile photo: add it, see it on Today, remove it', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/settings')
  await page.getByLabel('Profile photo').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByText('Photo updated')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change photo' }).locator('img')).toHaveAttribute('src', /^data:image\/jpeg/)
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Profile and settings' }).locator('img')).toBeVisible()
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Remove Photo' }).click()
  await expect(page.getByRole('button', { name: 'Add photo' })).toBeVisible()
})
