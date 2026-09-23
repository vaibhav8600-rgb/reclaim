import { expect, test, type Page } from '@playwright/test'
import { seedDemo, tab, weekAdherence, importBackup, injuriesBackup } from './helpers'

async function addEccentricToPlan(page: Page) {
  await tab(page, 'Rehab').click()
  await expect(page.getByText('Add your physio exercises')).toBeVisible()
  await page.getByRole('link', { name: 'Browse Exercises' }).click()
  await expect(page.getByRole('heading', { name: 'Exercise Library', level: 1 })).toBeVisible()

  await page.getByLabel('Search exercises').fill('eccentric')
  await expect(page.getByRole('link', { name: /Grip squeeze/ })).toHaveCount(0)
  await page.getByRole('link', { name: /Eccentric wrist extension/ }).click()
  await expect(page.getByRole('heading', { name: 'Eccentric wrist extension', level: 1 })).toBeVisible()
  await expect(page.getByText('Complete a session to see progress')).toBeVisible()

  await page.getByRole('link', { name: 'Add to Plan' }).click()
  await expect(page.getByRole('heading', { name: 'Add to Plan' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tennis elbow' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Increase Reps' }).click()
  await page.getByRole('button', { name: 'Increase Reps' }).click() // 10 → 12
  await page.getByLabel('Load (kg)').fill('2')
  await page.getByPlaceholder('Optional — e.g. slow on the way down, stop at pain 4').fill('Lower over 4 seconds')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Eccentric wrist extension added to your plan')).toBeVisible()
  await expect(page.getByText('3 × 12 @ 2 kg')).toBeVisible()
  await expect(page.getByText('Once a day')).toBeVisible()
}

test('build a plan, do a session (with a mid-session reload), see adherence and progress', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await addEccentricToPlan(page)

  await tab(page, 'Rehab').click()
  await expect(page.getByTestId('week-adherence')).toHaveText('0 of 7 exercises')
  await page.getByRole('link', { name: 'Start Session' }).click()
  await expect(page.getByRole('heading', { name: 'Rehab Session' })).toBeVisible()

  const finish = page.getByRole('button', { name: 'Save' })
  await expect(finish).toBeDisabled()
  await page.getByRole('radio', { name: 'Pain Before 3' }).click()
  await page.getByRole('button', { name: 'Eccentric wrist extension set 1 done' }).click()
  await page.getByRole('button', { name: 'Eccentric wrist extension set 2 done' }).click()
  await expect(page.getByText('2 of 3 sets')).toBeVisible()

  // Close the app mid-session: the draft survives.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Eccentric wrist extension set 2 done' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('radio', { name: 'Pain Before 3' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('link', { name: 'Resume Session' })).toBeVisible()
  await page.getByRole('link', { name: 'Resume Session' }).click()

  await page.getByLabel('Eccentric wrist extension set 3 load').fill('2.5')
  await page.getByRole('button', { name: 'Eccentric wrist extension set 3 done' }).click()
  await page.getByLabel('Eccentric wrist extension pain during').selectOption('4')
  await page.getByRole('radio', { name: 'Pain After 2' }).click()
  await expect(finish).toBeEnabled()
  await finish.click()

  await expect(page.getByText('Session saved · 1 exercise')).toBeVisible()
  await expect(page.getByTestId('week-adherence')).toHaveText('1 of 7 exercises')
  await expect(page.getByTestId('today-adherence')).toHaveText('Today: 1 of 1')
  await expect(page.getByRole('link', { name: 'Start Session' })).toBeVisible() // draft cleared
  await expect(page.getByRole('link', { name: /Rehab Session.*1 exercise · pain 3 → 2/ })).toBeVisible()

  // Progress uses the heaviest completed load.
  await page.getByRole('link', { name: /Eccentric wrist extension.*3 × 12/ }).click()
  await expect(page.getByTestId('progress-latest')).toHaveText('2.5')

  // The session is on the timeline and on Today.
  await tab(page, 'Timeline').click()
  await expect(page.getByRole('link', { name: /Rehab Session.*pain 3 → 2/ })).toBeVisible()
  await tab(page, 'Today').click()
  await expect(page.getByTestId('today-adherence')).toHaveText('Today: 1 of 1')
})

test('edit a finished session and delete it with undo', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await addEccentricToPlan(page)
  await page.goto('/rehab/session')
  await page.getByRole('button', { name: 'Eccentric wrist extension set 1 done' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await page.goto('/timeline')

  await page.getByRole('link', { name: /Rehab Session/ }).click()
  await expect(page.getByRole('heading', { name: 'Edit Session' })).toBeVisible()
  await page.getByRole('button', { name: 'Eccentric wrist extension set 2 done' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Session updated')).toBeVisible()

  await page.getByRole('link', { name: /Rehab Session/ }).click()
  await page.getByRole('button', { name: 'Delete Session' }).click()
  await expect(page.getByText('Session deleted')).toBeVisible()
  await expect(page.getByRole('link', { name: /Rehab Session/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('link', { name: /Rehab Session/ })).toBeVisible()
})

test('pause and remove plan items', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await addEccentricToPlan(page)
  await page.getByRole('link', { name: 'Edit Plan' }).click()
  await page.getByText('Active', { exact: true }).click()
  await expect(page.getByRole('switch')).not.toBeChecked()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Plan updated')).toBeVisible()

  await tab(page, 'Rehab').click()
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible()
  await expect(page.getByText('Everything in your plan is paused.')).toBeVisible()

  await page.getByRole('link', { name: /Eccentric wrist extension/ }).click()
  await page.getByRole('link', { name: 'Edit Plan' }).click()
  await page.getByRole('button', { name: 'Remove from Plan' }).click()
  await expect(page.getByText('Removed from plan')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add to Plan' })).toBeVisible()
})

test('custom exercise: create, add a session with it, then delete', async ({ page }) => {
  await page.goto('/rehab/library')
  await page.getByRole('link', { name: 'New exercise' }).click()
  await page.getByPlaceholder('Towel wring').fill('Towel wring')
  await page.getByLabel('Body Region').selectOption('Forearm')
  await page.getByRole('radio', { name: 'Timed Hold' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Exercise added')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Towel wring', level: 1 })).toBeVisible()

  // Ad-hoc exercise added during a session (not in the plan)
  await page.goto('/rehab/session')
  await page.getByLabel('Add Exercise').selectOption({ label: 'Towel wring' })
  await expect(page.getByRole('region', { name: 'Towel wring' })).toBeVisible()
  await page.getByRole('button', { name: 'Towel wring set 1 done' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Session saved · 1 exercise')).toBeVisible()

  await page.goto('/rehab/library')
  await page.getByLabel('Search exercises').fill('towel')
  await page.getByRole('link', { name: /Towel wring/ }).click()
  await expect(page.getByTestId('progress-latest')).toHaveText('30')
  await page.getByRole('link', { name: 'Edit exercise' }).click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete Exercise' }).click()
  await expect(page.getByText('Exercise deleted')).toBeVisible()
  await page.getByLabel('Search exercises').fill('towel')
  await expect(page.getByText('No exercises match')).toBeVisible()
})

test('demo data: weekly adherence and progressive loading', async ({ page }) => {
  const now = Date.now()
  const demo = await seedDemo(page, now)
  const { done, planned } = weekAdherence(demo, now)
  await tab(page, 'Rehab').click()
  await expect(page.getByTestId('week-adherence')).toHaveText(`${done} of ${planned} exercises`)
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Wrist flexor stretch/ })).toBeVisible()

  await page.getByRole('link', { name: /Eccentric wrist extension/ }).click()
  await expect(page.getByText('Heaviest Load')).toBeVisible()
  await expect(page.getByTestId('progress-latest')).toHaveText('3')
  await expect(page.getByTestId('progress-summary')).toHaveText(/^[123] → 3 kg over 20 sessions$/)
})
