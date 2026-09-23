import { expect, test } from '@playwright/test'
import { IDS } from './fixtures/demo-data'
import { latestPain, rangeAverage, seedDemo, sevenDayAverage, tab } from './helpers'

/**
 * With ~75 days of realistic data, every number on screen must match what we compute
 * independently from the same data.
 */
test('Today: 7-day pain average and latest log match the data', async ({ page }) => {
  const now = Date.now()
  const demo = await seedDemo(page, now)
  await page.goto('/')

  await expect(page.getByRole('link', { name: 'Profile and settings' })).toHaveText('A') // Alex
  // Two open injuries → "All" is selected; pick the elbow.
  await page.getByRole('button', { name: 'Tennis elbow', exact: true }).click()
  await expect(page.getByTestId('pain-avg')).toHaveText(sevenDayAverage(demo, IDS.elbow, now).toFixed(1))
  await expect(page.getByTestId('pain-latest')).toHaveText(String(latestPain(demo, IDS.elbow).severity))

  // Improving over time: this week should be lower than the first week of the injury.
  const firstWeek = demo.data.symptoms.filter((s) => s.injuryId === IDS.elbow && s.type === 'pain' && s.recordedAt < now - 63 * 86_400_000)
  const earlyAvg = firstWeek.reduce((a, s) => a + s.severity, 0) / firstWeek.length
  expect(sevenDayAverage(demo, IDS.elbow, now)).toBeLessThan(earlyAvg)

  // Latest measurements: weight shows the most recent live weigh-in (the deleted typo is ignored).
  const weight = demo.data.measurements.filter((m) => m.kind === 'weight' && !m.deletedAt).sort((a, b) => b.recordedAt - a.recordedAt)[0]
  await expect(page.getByRole('link', { name: new RegExp(`^Weight\\s*${weight.value}\\s*kg`) }).first()).toBeVisible()
})

test('Injury detail: 14/30/90-day averages and counts', async ({ page }) => {
  const now = Date.now()
  const demo = await seedDemo(page, now)
  await page.goto('/injuries')
  await page.getByRole('link', { name: /Tennis elbow/ }).click()
  await expect(page.getByRole('heading', { name: 'Tennis elbow', level: 1 })).toBeVisible()

  for (const days of [30, 14, 90]) {
    await page.getByRole('radio', { name: `${days}D` }).click()
    const { avg, count } = rangeAverage(demo, IDS.elbow, days, now)
    await expect(page.getByTestId('range-avg')).toHaveText(avg.toFixed(1))
    await expect(page.getByTestId('range-count')).toHaveText(`${count} logs in ${days} days`)
  }

  // The injury's rehab plan is listed with its active exercises.
  await expect(page.getByRole('heading', { name: 'Rehab Plan' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Eccentric wrist extension.*3 × 15 @ 3 kg/ })).toBeVisible()
})

test('Injuries: current vs resolved', async ({ page }) => {
  await seedDemo(page)
  await tab(page, 'Injuries').click()
  await expect(page.getByRole('link', { name: /Tennis elbow.*Improving/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Lower back stiffness.*Monitoring/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Left ankle sprain/ })).toHaveCount(0)
  await page.getByRole('radio', { name: 'Resolved' }).click()
  await expect(page.getByRole('link', { name: /Left ankle sprain.*Resolved/ })).toBeVisible()
})

test('Timeline: filters, day grouping, paging', async ({ page }) => {
  const demo = await seedDemo(page)
  await tab(page, 'Timeline').click()
  await expect(page.getByRole('heading', { name: 'Timeline', level: 1 })).toBeVisible()

  // More than one page of history → older entries load on demand.
  await expect(page.getByRole('button', { name: 'Show Older Entries' })).toBeVisible()

  await page.getByRole('button', { name: 'Notes', exact: true }).click()
  const notes = demo.data.journal.filter((n) => !n.deletedAt)
  await expect(page.getByRole('link', { name: /^Note / })).toHaveCount(notes.length)

  await page.getByRole('button', { name: 'Rehab', exact: true }).click()
  const rows = page.getByRole('link', { name: /^Rehab Session/ })
  await expect(rows.first()).toBeVisible()
  await expect(page.locator('a.cell').filter({ hasNotText: 'Rehab Session' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Injuries', exact: true }).click()
  await expect(page.getByRole('link', { name: /Started: Tennis elbow/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Started: Left ankle sprain/ })).toBeVisible()
})
