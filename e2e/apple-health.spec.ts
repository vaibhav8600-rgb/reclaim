import { expect, test } from '@playwright/test'
import { parseHealthExport } from '../src/lib/healthImport'
import { dumpDb, importBackup, injuriesBackup } from './helpers'

const t = (s: string) => new Date(s).getTime()
const NOW = t('2026-09-24T12:00')

test('the Shortcut’s lines are read carefully: sleep segments become nights, pounds become kg, junk is skipped', () => {
  const h = parseHealthExport(
    [
      'steps,2026-09-23,4000',
      'steps,2026-09-23,2420', // two lines for a day add up
      'steps;2026-09-24;812',
      'exercise,2026-09-24,35',
      'weight,2026-09-24 07:30,187.6,lb',
      'weight,2026-09-23T07:31,85.4',
      'sleep,2026-09-23 23:05,2026-09-24 00:10,Core',
      'sleep,2026-09-24 00:40,2026-09-24 03:00,Deep', // a 30-minute gap: same night
      'sleep,2026-09-24 03:20,2026-09-24 06:50,REM',
      'sleep,2026-09-23 22:40,2026-09-24 07:00,In Bed', // time in bed isn’t sleep
      'sleep,2026-09-24 03:05,2026-09-24 03:15,Awake',
      'nonsense line',
      'steps,yesterday,5000',
    ].join('\n'),
    NOW,
  )
  expect([...h.steps]).toEqual([['2026-09-23', 6420], ['2026-09-24', 812]])
  expect([...h.exercise]).toEqual([['2026-09-24', 35]])
  expect(h.weights).toEqual([{ at: t('2026-09-24T07:30'), kg: 85.1 }, { at: t('2026-09-23T07:31'), kg: 85.4 }])
  expect(h.nights).toEqual([{ bedAt: t('2026-09-23T23:05'), wakeAt: t('2026-09-24T06:50') }])
  expect(h.skipped).toBe(2)
})

test('Shortcut lines with semicolons keep thousands and decimal commas', () => {
  const h = parseHealthExport(['steps;2026-09-23;6,420', 'weight;2026-09-24 07:30;85,4;kg', 'weight;2026-09-23 07:30;187.6 lb'].join('\n'), NOW)
  expect([...h.steps]).toEqual([['2026-09-23', 6420]])
  expect(h.weights.map((w) => w.kg)).toEqual([85.4, 85.1])
})

test('paste what the Shortcut copied: it imports, and the same data twice changes nothing', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  const day = new Date(Date.now() - 86_400_000)
  const d = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
  const lines = [`steps;${d};6420`, `weight;${d} 07:30;85.4;kg`, `sleep;${d} 00:30;${d} 07:10;Core`].join('\n')

  await page.goto('/settings/health')
  await expect(page.getByRole('link', { name: '1. Run the Shortcut' })).toHaveAttribute('href', 'shortcuts://run-shortcut?name=Reclaim%20Health')
  for (let i = 0; i < 2; i++) {
    await page.getByLabel('Apple Health data').fill(lines)
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(page.getByText('Imported from Apple Health: 1 day of steps · 1 weight · 1 night of sleep').last()).toBeVisible()
    await expect(page.getByLabel('Apple Health data')).toHaveValue('')
  }
  const db = await dumpDb(page)
  expect(db.activity).toMatchObject([{ date: d, steps: 6420, source: 'device' }])
  expect(db.measurements).toMatchObject([{ kind: 'weight', value: 85.4, unit: 'kg', method: 'Apple Health', source: 'device' }])
  expect(db.sleep).toHaveLength(1)

  await page.getByLabel('Apple Health data').fill('hello')
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page.getByText(/No Apple Health data there/)).toBeVisible()
})
