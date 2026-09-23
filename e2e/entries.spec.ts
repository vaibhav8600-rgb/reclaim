import { expect, test } from '@playwright/test'
import { importBackup, injuriesBackup, tab } from './helpers'

test.beforeEach(async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
})

test('symptom with details: create, edit from the timeline, delete and undo', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Quick log' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^Symptom Details/ }).click()

  await expect(page.getByRole('button', { name: 'Tennis elbow' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Stiffness' }).click()
  const save = page.getByRole('button', { name: 'Save' })
  await expect(save).toBeDisabled() // no intensity yet
  await page.getByRole('radio', { name: '5', exact: true }).click()
  await expect(page.getByText('5 · Moderate')).toBeVisible()
  await page.getByRole('button', { name: 'After work' }).click()
  await page.getByPlaceholder('Optional — what it felt like, what helped').fill('Ice helped')
  await save.click()

  await expect(page.getByText('Stiffness 5 logged')).toBeVisible()
  await tab(page, 'Timeline').click()
  const row = page.getByRole('link', { name: /Stiffness.*Tennis elbow · After work · Ice helped/ })
  await expect(row).toBeVisible()

  await row.click()
  await expect(page.getByRole('heading', { name: 'Edit Symptom' })).toBeVisible()
  await page.getByRole('radio', { name: '3', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Stiffness 3 updated')).toBeVisible()
  await expect(page.getByRole('link', { name: /^3 Stiffness/ })).toBeVisible()

  await page.getByRole('link', { name: /^3 Stiffness/ }).click()
  await page.getByRole('button', { name: 'Delete Entry' }).click()
  await expect(page.getByText('Entry deleted')).toBeVisible()
  await expect(page.getByRole('link', { name: /Stiffness/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('link', { name: /^3 Stiffness/ })).toBeVisible()
})

test('measurement: grip strength per side shows on Today', async ({ page }) => {
  await page.goto('/log/measurement')
  await page.getByRole('button', { name: 'Grip strength' }).click()
  const save = page.getByRole('button', { name: 'Save' })
  await expect(save).toBeDisabled()
  await page.getByLabel('Value').fill('28.5')
  await page.getByRole('radio', { name: 'Right' }).click()
  await page.getByRole('button', { name: 'Tennis elbow' }).click()
  await page.getByPlaceholder('Dynamometer, standing').fill('Dynamometer')
  await save.click()

  await expect(page.getByText('Grip strength 28.5 kg saved')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Measurements' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Grip strength · R\s*28.5\s*kg/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Grip strength 28.5 kg.*Right.*Tennis elbow/ })).toBeVisible()
})

test('custom measurement needs a name and unit', async ({ page }) => {
  await page.goto('/log/measurement')
  await page.getByRole('button', { name: 'Other' }).click()
  await page.getByLabel('Value').fill('45')
  const save = page.getByRole('button', { name: 'Save' })
  await expect(save).toBeDisabled()
  await page.getByPlaceholder('Balance').fill('Single-leg balance')
  await page.getByPlaceholder('sec').fill('s')
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByText('Single-leg balance 45 s saved')).toBeVisible()
})

test('note: write, edit and delete', async ({ page }) => {
  await page.goto('/log/note')
  const save = page.getByRole('button', { name: 'Save' })
  await expect(save).toBeDisabled()
  await page.getByLabel('Note').fill('Elbow fine in the morning, sore after 8 hours at the laptop.')
  await save.click()
  await expect(page.getByText('Note saved')).toBeVisible()

  const row = page.getByRole('link', { name: /Note Elbow fine in the morning/ })
  await expect(row).toBeVisible()
  await row.click()
  await page.getByLabel('Note').fill('Elbow sore after work.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('link', { name: /Note Elbow sore after work/ })).toBeVisible()

  await page.getByRole('link', { name: /Note Elbow sore after work/ }).click()
  await page.getByRole('button', { name: 'Delete Note' }).click()
  await expect(page.getByText('Note deleted')).toBeVisible()
  await expect(page.getByRole('link', { name: /Note Elbow/ })).toHaveCount(0)
})

test('backdating an entry moves it to the right day', async ({ page }) => {
  await page.goto('/log/symptom')
  await page.getByRole('radio', { name: '4', exact: true }).click()
  const y = new Date(Date.now() - 86_400_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  await page.getByLabel('Time').fill(`${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}T09:30`)
  await page.getByRole('button', { name: 'Save' }).click()
  await page.goto('/timeline')
  await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Today' , level: 2 })).toHaveCount(0)
})
