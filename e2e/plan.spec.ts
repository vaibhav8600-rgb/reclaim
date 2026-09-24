import { expect, test, type Page } from '@playwright/test'
import type { HealthFact, Prescription, RehabSession } from '../src/db/db'
import { dailyTargets, weeklyCheck } from '../src/lib/plan'
import { mockAi } from './fake-ai'
import { FakeDrive } from './fake-google'
import { dumpDb, newDevice, seedDemo } from './helpers'

async function acceptConsent(page: Page) {
  const sheet = page.getByRole('dialog', { name: 'Use AI in Reclaim?' })
  await sheet.getByRole('button', { name: 'Turn On AI' }).click()
  await expect(sheet).toBeHidden()
}

const fact = (f: Partial<HealthFact>) => ({ id: 'f', createdAt: 0, updatedAt: 0, date: '2026-01-01', source: 'user', kind: 'condition', name: '', ...f }) as HealthFact

test('daily targets come from published ranges, and are held back when the records say so', () => {
  expect(dailyTargets(80, [])).toMatchObject({ protein: { target: 130, low: 110, high: 160 }, water: { target: 2750, low: 2500, high: 2750 } })
  expect(dailyTargets(undefined, [])).not.toHaveProperty('protein')
  const kidney = dailyTargets(80, [fact({ kind: 'lab', name: 'eGFR (CKD-EPI)', value: 48 })])
  expect(kidney.protein).toBeUndefined()
  expect(kidney.water).toBeUndefined()
  expect(kidney.hold.protein).toMatch(/kidney/)
  const heart = dailyTargets(80, [fact({ name: 'Heart failure' })])
  expect(heart.protein).toBeDefined()
  expect(heart.water).toBeUndefined()
  expect(dailyTargets(80, [fact({ kind: 'lab', name: 'eGFR', value: 95 })]).protein).toBeDefined()
})

test('the weekly check follows the pain-monitoring model', () => {
  const now = Date.UTC(2026, 8, 20, 12)
  const p = { id: 'p', exerciseId: 'ex-a', sets: 3, target: 10, timesPerDay: 1, daysPerWeek: 5, active: true, createdAt: 0, updatedAt: 0 } as Prescription
  const session = (daysAgo: number, painDuring: number, before?: number, after?: number) =>
    ({ id: `s${daysAgo}`, startedAt: 0, recordedAt: now - daysAgo * 86_400_000, createdAt: 0, updatedAt: 0, source: 'user', painBefore: before, painAfter: after, items: [{ exerciseId: 'ex-a', sets: [{ amount: 10, done: true }], painDuring }] }) as RehabSession
  expect(weeklyCheck(p, [], now).verdict).toBe('new')
  expect(weeklyCheck(p, [1, 2, 3, 4].map((d) => session(d, 2)), now).verdict).toBe('progress')
  expect(weeklyCheck(p, [1, 2].map((d) => session(d, 2)), now).verdict).toBe('hold') // comfortable, but done 2 of 5
  expect(weeklyCheck(p, [session(1, 6), session(2, 2), session(3, 2), session(4, 2)], now).verdict).toBe('ease') // above 5/10
  expect(weeklyCheck(p, [session(1, 3, 2, 5)], now).verdict).toBe('ease') // flared by 3 afterwards
  expect(weeklyCheck(p, [session(9, 2)], now).verdict).toBe('new') // older than a week
})

test('recovery plan: only vetted exercises in range, targets from formulas, and nothing changes until it’s used', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  const requests = await mockAi(page)
  const demo = await seedDemo(page)
  await page.goto('/')
  await page.getByRole('link', { name: /Draft a plan for your recovery/ }).click()
  await expect(page.getByRole('heading', { name: 'This Week' })).toBeVisible()
  await page.getByRole('button', { name: 'Create My Plan' }).click()
  await acceptConsent(page)
  await expect(page.getByText(/so the plan keeps loading the tendon/)).toBeVisible()

  // The AI was given only exercises that suit the open injuries (elbow, lower back), with their ranges.
  const library = (requests.at(-1)!.input.context as { library: { id: string }[] }).library.map((e) => e.id)
  expect(library).toContain('ex-wrist-ext-ecc')
  expect(library).toContain('ex-cat-cow')
  expect(library).not.toContain('ex-ankle-alphabet') // the ankle sprain is resolved
  expect(JSON.stringify(requests.at(-1)!.input)).not.toContain('Alex')

  // Invented and off-injury exercises are dropped; an over-range dose is capped (sets 10 → 3).
  const cards = page.locator('.card').filter({ has: page.getByText(/^Progress:/) })
  await expect(cards).toHaveCount(3)
  await expect(page.getByText('ex-made-up')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Calf raises' })).toHaveCount(0)
  await expect(cards.filter({ hasText: 'Forearm pronation & supination' })).toContainText('3 × 12 · Once a day, 6 days a week · for Tennis elbow')
  await expect(cards.filter({ hasText: 'Eccentric wrist extension' }).getByText('In Your Plan')).toBeVisible()
  await expect(page.getByText(/Source: Lateral elbow pain guideline \(JOSPT, 2022\)/).first()).toBeVisible()

  // Targets from the latest weight, not from the AI
  const weight = demo.data.measurements.filter((m) => m.kind === 'weight' && !m.deletedAt).sort((a, b) => b.recordedAt - a.recordedAt)[0].value
  const protein = Math.round((weight * 1.6) / 5) * 5
  await expect(page.getByRole('heading', { name: 'Daily Targets' })).toBeVisible()
  await expect(page.getByText(`${protein} g`, { exact: true })).toBeVisible()
  await expect(page.getByText(/Lucado AM, Day JM/)).toBeVisible()

  expect((await dumpDb(page)).prescriptions.filter((p) => p.exerciseId === 'ex-pro-sup')).toHaveLength(0) // a draft changes nothing

  // Leave the glute bridge out, then use the plan
  await page.getByLabel('Add Glute bridge').uncheck()
  await page.getByRole('button', { name: 'Use This Plan' }).click()
  await expect(page.getByText('Added 1 exercise to your rehab plan')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rehab', level: 1 })).toBeVisible()
  const db = await dumpDb(page)
  const added = db.prescriptions.filter((p) => p.exerciseId === 'ex-pro-sup')
  expect(added).toMatchObject([{ sets: 3, target: 12, timesPerDay: 1, daysPerWeek: 6, injuryId: 'demo-injury-elbow', active: true }])
  expect(db.prescriptions.filter((p) => p.exerciseId === 'ex-glute-bridge')).toHaveLength(0)
  expect(db.profile[0].proteinTarget).toBe(protein)
})
