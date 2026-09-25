import { expect, test } from '@playwright/test'
import type { CheckIn } from '../src/db/db'
import { checkInDue, checkInTrend, direction, pegScore, psfsScore } from '../src/lib/checkin'
import { jointLoad, stepRamp } from '../src/lib/joints'
import { dumpDb, importBackup } from './helpers'

const DAY = 86_400_000
const stamp = { createdAt: 0, updatedAt: 0 }
const backup = (data: object) => ({ app: 'reclaim', schemaVersion: 1, exportedAt: new Date().toISOString(), data })
const knee = { id: 'knee', name: 'Right knee sprain', bodyRegion: 'Knee', side: 'right', startDate: '2026-09-01', status: 'active', ...stamp }
const checkIn = (c: Partial<CheckIn>) => ({ id: 'c', recordedAt: 0, source: 'user', ...stamp, ...c }) as CheckIn

test('check-in scores, when it’s due, and first-vs-latest; knee load from weight lost; a gentle steps target', () => {
  expect(pegScore(checkIn({ pain: 6, enjoyment: 5, generalActivity: 4 }))).toBe(5)
  expect(pegScore(checkIn({}))).toBeUndefined()
  expect(psfsScore(checkIn({ activities: [{ name: 'a', score: 3 }, { name: 'b', score: 6 }] }))).toBe(4.5)
  const now = Date.UTC(2026, 8, 25)
  expect(checkInDue(true, undefined, now)).toBe(true)
  expect(checkInDue(true, now - 3 * DAY, now)).toBe(false)
  expect(checkInDue(true, now - 8 * DAY, now)).toBe(true)
  expect(checkInDue(false, undefined, now)).toBe(false) // nothing open, nothing to check in about

  const t = checkInTrend([checkIn({ id: 'b', recordedAt: 2, pain: 5, enjoyment: 5, generalActivity: 5, sitMinutes: 45 }), checkIn({ id: 'a', recordedAt: 1, pain: 8, enjoyment: 8, generalActivity: 8, sitMinutes: 10 })])
  expect(t.peg).toMatchObject({ first: 8, latest: 5, count: 2 })
  expect(t.sit).toMatchObject({ first: 10, latest: 45 })
  expect(t.psfs).toBeUndefined()
  expect(direction(8, 5, 'down', 2)).toBe('better')
  expect(direction(8, 7, 'down', 2)).toBe('same') // under the 2-point threshold
  expect(direction(3, 1, 'up', 2)).toBe('worse')

  expect(jointLoad([{ at: now - 60 * DAY, kg: 100 }, { at: now - 30 * DAY, kg: 98 }, { at: now, kg: 94.5 }], now)).toEqual({ lost: 5.5, since: now - 60 * DAY, kneeKg: 22 })
  expect(jointLoad([{ at: now - 60 * DAY, kg: 95.4 }, { at: now, kg: 94.5 }], now)).toBeUndefined() // under 1 kg
  expect(jointLoad([{ at: now - 300 * DAY, kg: 110 }, { at: now - 10 * DAY, kg: 95 }, { at: now, kg: 94.5 }], now)).toBeUndefined() // the peak is older than 6 months

  expect(stepRamp(4000, 8000)).toBe(4500) // +10%, at least +500
  expect(stepRamp(6000, 8000)).toBe(6500)
  expect(stepRamp(7500, 8000)).toBeUndefined() // close enough: aim at the goal itself
  expect(stepRamp(undefined, 8000)).toBeUndefined()
})

test('weekly check-in: asked on Today, compared with last week, and in the report', async ({ page }) => {
  const lastWeek = { id: 'c0', recordedAt: Date.now() - 8 * DAY, pain: 8, enjoyment: 8, generalActivity: 8, sitMinutes: 10, activities: [{ name: 'Sitting at work', score: 1 }], source: 'user', ...stamp }
  await importBackup(page, backup({ injuries: [knee], checkins: [lastWeek] }))
  await page.goto('/')
  await page.getByRole('link', { name: /Weekly check-in/ }).click()

  await page.getByRole('radio', { name: 'Pain on average this week 6' }).click()
  await page.getByRole('radio', { name: 'How much it got in the way of enjoying life 5' }).click()
  await page.getByRole('radio', { name: 'How much it got in the way of your usual activities 4' }).click()
  await page.getByRole('button', { name: '30–60 min' }).first().click() // sitting
  await page.getByRole('radio', { name: 'Nights woken by pain this week 3' }).click()
  await expect(page.getByLabel('Activity 1')).toHaveValue('Sitting at work') // same activities as last time
  await page.getByRole('radio', { name: 'Sitting at work ability 3' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Check-in saved')).toBeVisible()
  await expect(page.getByRole('link', { name: /Weekly check-in/ })).toHaveCount(0)

  const saved = (await dumpDb(page)).checkins.find((c: CheckIn) => c.id !== 'c0')
  expect(saved).toMatchObject({ pain: 6, enjoyment: 5, generalActivity: 4, sitMinutes: 45, nightsWoken: 3, activities: [{ name: 'Sitting at work', score: 3 }] })

  await page.goto('/progress')
  await expect(page.getByTestId('trend-Pain and life')).toHaveText('Better') // 8 → 5
  await expect(page.getByTestId('trend-Your activities')).toHaveText('Better') // 1 → 3
  await expect(page.getByTestId('trend-Sitting')).toHaveText('Better')

  await page.goto('/report?injury=knee')
  await expect(page.getByText('Everyday Function (2 weekly check-ins)')).toBeVisible()
  await expect(page.getByText('8/10 → 5/10')).toBeVisible()
})

test('weight: what it takes off the knees; steps: a gentle target for this week', async ({ page }) => {
  const weight = (id: string, daysAgo: number, value: number) => ({ id, kind: 'weight', value, unit: 'kg', recordedAt: Date.now() - daysAgo * DAY, source: 'user', ...stamp })
  const day = (n: number) => { const d = new Date(Date.now() - n * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  await importBackup(page, backup({
    profile: [{ id: 'me', name: '', weightGoal: 85, stepsTarget: 8000, ...stamp }],
    measurements: [weight('w1', 60, 100), weight('w2', 0, 94.5)],
    activity: [1, 2, 3].map((n) => ({ id: `activity-${day(n)}`, date: day(n), steps: 4000, source: 'user', ...stamp })),
  }))
  await page.goto('/weight')
  await expect(page.getByTestId('knee-load')).toContainText('5.5 kg lighter')
  await expect(page.getByTestId('knee-load')).toContainText('about 22 kg less on each knee')
  await expect(page.getByTestId('knee-goal')).toContainText('Reaching 85 kg would take about 38 kg more off each knee')

  await page.goto('/log/steps')
  await expect(page.getByTestId('step-ramp')).toContainText('aim for about 4,500 a day')
})
