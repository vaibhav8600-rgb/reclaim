import { expect, test } from '@playwright/test'
import type { Sleep } from '../src/db/db'
import { bmi, bmiRange, formatHours, lastNight, sleepHours } from '../src/lib/daily'
import { suggestedGoals } from '../src/lib/plan'
import { dumpDb, importBackup, injuriesBackup, localMidnight, tab } from './helpers'

const H = 3_600_000

test('sleep, BMI and starting goals are worked out correctly', () => {
  const now = localMidnight(Date.now()) + 10 * H
  const night = (wake: number, hours: number) => ({ id: String(wake), bedAt: wake - hours * H, wakeAt: wake, createdAt: 0, updatedAt: 0, source: 'user' }) as Sleep
  expect(sleepHours(night(now, 7.5))).toBe(7.5)
  expect(formatHours(7.5)).toBe('7h 30m')
  expect(formatHours(8)).toBe('8h')
  // Last night is the longest sleep that ended today (not yesterday's, not a nap).
  const today = localMidnight(now)
  expect(lastNight([night(today - 2 * H, 9), night(today + 7 * H, 7), night(today + 9 * H, 1)], now)!.wakeAt).toBe(today + 7 * H)
  expect(lastNight([night(today - 2 * H, 9)], now)).toBeUndefined()

  expect(bmi(80, 178)).toBe(25.2)
  expect(bmiRange(25.2)).toBe('25–29.9 (overweight range)')
  expect(bmiRange(22)).toBe('18.5–24.9 (healthy range)')
  expect(suggestedGoals(80, [])).toEqual({ calorieTarget: undefined, proteinTarget: 130, fiberTarget: 30, waterTarget: 2750, stepsTarget: 8000, sleepTarget: 8 })
  expect(suggestedGoals(undefined, [])).toMatchObject({ proteinTarget: undefined, stepsTarget: 8000 })
})

test('first run: a one-minute setup fills in starting goals for what was picked', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Welcome to Reclaim')).toBeVisible()
  await page.getByRole('link', { name: 'Set Up' }).click()
  await page.getByPlaceholder('What should we call you?').fill('Vaibhav')
  await page.getByLabel('Height (cm)').fill('178')
  await page.getByLabel('Weight today').fill('80')
  for (const aim of ['Eat enough protein', 'Drink enough water', 'Move more', 'Sleep better']) await page.getByRole('button', { name: aim }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('You’re all set — change anything in Goals')).toBeVisible()

  await expect(page.getByText('Welcome to Reclaim')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Protein 0 grams of 130' })).toBeVisible()
  await expect(page.getByText('Weight 80 kg').first()).toBeVisible() // on the glance (and in Logged Today)
  const db = await dumpDb(page)
  expect(db.profile).toMatchObject([{ name: 'Vaibhav', height: 178, proteinTarget: 130, waterTarget: 2750, stepsTarget: 8000, sleepTarget: 8 }])
  expect(db.profile[0].weightGoal).toBeUndefined() // not picked
})

test('sleep and steps: a tap or two, shown on Today and the timeline, one record per day', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/')
  await page.getByRole('button', { name: 'Quick log' }).click()
  await page.getByRole('dialog', { name: 'Quick log' }).getByRole('button', { name: 'Sleep' }).click()
  await expect(page.getByTestId('sleep-duration')).toHaveText('8h') // last night, prefilled
  await page.getByRole('button', { name: 'Good', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Sleep 8h saved')).toBeVisible()
  await expect(page.getByTestId('glance-sleep')).toHaveText('8h')

  await page.getByRole('link', { name: /^Steps 0/ }).click()
  await page.getByLabel('Steps', { exact: true }).fill('6420')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('6,420 steps saved')).toBeVisible()
  await expect(page.getByTestId('glance-steps')).toHaveText('6,420')

  // Logging the same day again edits it
  await page.getByRole('link', { name: /^Steps 6420/ }).click()
  await expect(page.getByLabel('Steps', { exact: true })).toHaveValue('6420')
  await page.getByLabel('Steps', { exact: true }).fill('7000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('glance-steps')).toHaveText('7,000')
  expect((await dumpDb(page)).activity).toHaveLength(1)

  await tab(page, 'Timeline').click()
  await page.getByRole('button', { name: 'Sleep', exact: true }).click()
  await expect(page.getByRole('link', { name: /Sleep 8h.*Good/ })).toBeVisible()
  await page.getByRole('button', { name: 'Activity', exact: true }).click()
  await expect(page.getByRole('link', { name: /7,000 steps/ })).toBeVisible()
})

test('goals in one place, and weight with a trend, a goal and BMI', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/log/measurement?kind=weight')
  await page.getByLabel('Value').fill('84.6')
  await page.getByRole('button', { name: 'Save' }).click()

  await page.goto('/goals')
  await page.getByRole('button', { name: 'Suggest Goals for Me' }).click()
  await expect(page.getByText('Filled in 5 goals')).toBeVisible()
  await expect(page.getByLabel('Protein (g)')).toHaveValue('135')
  await page.getByLabel('Goal Weight (kg)').fill('80')
  await page.getByLabel('Goal Weight (kg)').press('Enter')
  await page.getByLabel('Height (cm)').fill('178')
  await page.getByLabel('Height (cm)').press('Enter')
  await expect(page.getByText('Height: 178 cm')).toBeVisible()

  await page.goto('/weight')
  await expect(page.getByTestId('weight-latest')).toHaveText('84.6')
  await expect(page.getByTestId('weight-goal')).toHaveText('4.6 kg above your goal of 80 kg')
  await expect(page.getByTestId('bmi')).toHaveText('26.7')
  await expect(page.getByText('WHO range 25–29.9 (overweight range)')).toBeVisible()
})

test('Quick Log opens weight straight into the weight form', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Quick log' }).click()
  await page.getByRole('dialog', { name: 'Quick log' }).getByRole('button', { name: 'Weight' }).click()
  await expect(page.getByRole('button', { name: 'Weight', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('radio', { name: 'kg' })).toBeChecked()
})
