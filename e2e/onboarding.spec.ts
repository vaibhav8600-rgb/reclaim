import { expect, test } from '@playwright/test'
import { tab } from './helpers'

test('first run: empty state, add an injury, see it across the app', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  await expect(page.getByText('What are you recovering from?')).toBeVisible()

  await page.getByRole('link', { name: 'Add Injury', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'New Injury' })).toBeVisible()
  const save = page.getByRole('button', { name: 'Save' })
  await expect(save).toBeDisabled()

  await page.getByPlaceholder('Left elbow pain').fill('Tennis elbow')
  await expect(save).toBeDisabled() // body region still missing
  await page.getByLabel('Body Region').selectOption('Elbow')
  await page.getByRole('radio', { name: 'Right' }).click()
  await page.getByPlaceholder('Lateral epicondylitis').fill('Lateral epicondylitis')
  await page.getByPlaceholder('Gradual onset after long hours at the laptop').fill('Typing all day')
  await expect(save).toBeEnabled()
  await save.click()

  await expect(page.getByText('Injury added')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tennis elbow', level: 1 })).toBeVisible()
  await expect(page.getByText('Right elbow · Day 1')).toBeVisible()
  await expect(page.getByText('Lateral epicondylitis')).toBeVisible()
  await expect(page.getByText('Typing all day')).toBeVisible()

  await tab(page, 'Injuries').click()
  await expect(page.getByRole('link', { name: /Tennis elbow.*Active/ })).toBeVisible()

  await tab(page, 'Today').click()
  await expect(page.getByRole('heading', { name: 'Pain' })).toBeVisible()
  await expect(page.getByTestId('pain-avg')).toHaveText('—')
  await expect(page.getByText('Nothing logged yet')).toBeVisible()
})

test('cancelling the new-injury sheet saves nothing', async ({ page }) => {
  await page.goto('/injuries')
  await page.getByRole('link', { name: 'Add injury', exact: true }).click()
  await page.getByPlaceholder('Left elbow pain').fill('Should not exist')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Injuries', level: 1 })).toBeVisible()
  await expect(page.getByText('No current injuries')).toBeVisible()
})

test('edit an injury and mark it resolved', async ({ page }) => {
  await page.goto('/injuries/new')
  await page.getByPlaceholder('Left elbow pain').fill('Sprained ankle')
  await page.getByLabel('Body Region').selectOption('Ankle')
  await page.getByRole('radio', { name: 'Left' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Sprained ankle', level: 1 })).toBeVisible()

  await page.getByRole('link', { name: 'Edit injury' }).click()
  await expect(page.getByRole('heading', { name: 'Edit Injury' })).toBeVisible()
  await page.getByPlaceholder('Left elbow pain').fill('Left ankle sprain')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Left ankle sprain', level: 1 })).toBeVisible()

  await page.getByLabel('Status').selectOption('resolved')
  await page.goto('/injuries')
  await expect(page.getByText('No current injuries')).toBeVisible()
  await page.getByRole('radio', { name: 'Resolved' }).click()
  await expect(page.getByRole('link', { name: /Left ankle sprain.*Resolved/ })).toBeVisible()
})

test('deleting an injury can be undone', async ({ page }) => {
  await page.goto('/injuries/new')
  await page.getByPlaceholder('Left elbow pain').fill('Shoulder')
  await page.getByLabel('Body Region').selectOption('Shoulder')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Shoulder', level: 1 })).toBeVisible()

  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete Injury' }).click()
  await expect(page.getByText('Injury deleted')).toBeVisible()
  await expect(page.getByText('No current injuries')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('link', { name: /Shoulder/ })).toBeVisible()
})
