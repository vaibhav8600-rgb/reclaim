import { expect, test } from '@playwright/test'
import type { Prescription, RehabSession, Symptom } from '../src/db/db'
import { weeklyCheck } from '../src/lib/plan'
import { reachScale, reachTrend } from '../src/lib/reach'
import { flareDay, flareItems, morningCheckDue, settledByMorning } from '../src/lib/rehab'
import { dumpDb, importBackup } from './helpers'

const DAY = 86_400_000
const HOUR = 3_600_000
const stamp = { createdAt: 0, updatedAt: 0 }
const backup = (data: object) => ({ app: 'reclaim', schemaVersion: 1, exportedAt: new Date().toISOString(), data })
const injury = (id: string, name: string, bodyRegion: string) => ({ id, name, bodyRegion, side: 'none', startDate: '2026-09-01', status: 'active', ...stamp })
const session = (id: string, recordedAt: number, painBefore?: number, morningPain?: number) =>
  ({ id, startedAt: recordedAt - HOUR, recordedAt, painBefore, morningPain, source: 'user', items: [{ exerciseId: 'ex-bird-dog', sets: [{ amount: 10, done: true }], painDuring: 2 }], ...stamp }) as RehabSession
const yesterdayEvening = () => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(19, 0, 0, 0); return d.getTime() }

test('the morning after: settled or not, which sessions still need asking, and the weekly check eases off', () => {
  expect(settledByMorning({ painBefore: 2, morningPain: 3 })).toBe(true) // within 1 of before
  expect(settledByMorning({ painBefore: 2, morningPain: 4 })).toBe(false)
  expect(settledByMorning({ morningPain: 5 })).toBe(true)
  expect(settledByMorning({ morningPain: 6 })).toBe(false) // above 5/10
  expect(settledByMorning({ painBefore: 2 })).toBeUndefined() // not asked yet

  const now = new Date(2026, 8, 25, 9).getTime()
  const at = (daysAgo: number, hour: number) => new Date(2026, 8, 25 - daysAgo, hour).getTime()
  const due = morningCheckDue([session('y', at(1, 19)), session('t', at(0, 8)), session('old', at(2, 19)), session('answered', at(1, 7), 2, 3)], now)
  expect(due.map((s) => s.id)).toEqual(['y'])

  const p = { id: 'p', exerciseId: 'ex-bird-dog', sets: 3, target: 10, timesPerDay: 1, daysPerWeek: 2, active: true, ...stamp } as Prescription
  const check = weeklyCheck(p, [session('a', at(1, 19), 2, 5), session('b', at(3, 19), 2, 2)], now)
  expect(check).toEqual({ verdict: 'ease', reason: 'Pain hadn’t settled by the next morning after a session this week.' })
  expect(weeklyCheck(p, [session('a', at(1, 19), 2, 2), session('b', at(3, 19), 2, 3)], now).verdict).toBe('progress')
})

test('flare-up days and gentler sessions; how far symptoms reach, and which way it’s moving', () => {
  const now = new Date(2026, 8, 25, 9).getTime()
  expect(flareDay({ startedAt: new Date(2026, 8, 25, 7).getTime() }, now)).toBe(1)
  expect(flareDay({ startedAt: new Date(2026, 8, 23, 22).getTime() }, now)).toBe(3)
  const sets = (n: number) => Array.from({ length: n }, () => ({ amount: 10, done: false }))
  expect(flareItems([{ exerciseId: 'a', sets: sets(3) }, { exerciseId: 'b', sets: sets(1) }, { exerciseId: 'c', sets: sets(4) }]).map((i) => i.sets.length)).toEqual([2, 1, 2])

  expect(reachScale('Lower back')?.[3]).toBe('Below the knee')
  expect(reachScale('Neck')?.[4]).toBe('Hand or fingers')
  expect(reachScale('Knee')).toBeUndefined()
  const trend = (...r: number[]) => reachTrend(r.map((reach, i) => ({ reach, recordedAt: i }) as Symptom))
  expect(trend(3, 3, 3, 1, 1, 1)).toBe('centralising')
  expect(trend(1, 1, 3, 3)).toBe('spreading')
  expect(trend(2, 2)).toBe('steady')
  expect(trend(2)).toBeUndefined()
})

test('morning check on Today: answered once for yesterday’s session, and it says whether to go easier', async ({ page }) => {
  await importBackup(page, backup({ injuries: [injury('elbow', 'Tennis elbow', 'Elbow')], sessions: [session('s1', yesterdayEvening(), 2)] }))
  await page.goto('/')
  const card = page.getByTestId('morning-check')
  await expect(card).toContainText('How much does it hurt this morning')
  await card.getByRole('radio', { name: 'Pain this morning 5' }).click()
  await expect(card).toContainText('Not settled yet — go easier today')
  expect((await dumpDb(page)).sessions).toMatchObject([{ id: 's1', morningPain: 5 }])
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect(page.getByTestId('morning-check')).toHaveCount(0) // asked once
})

test('flare-up: offered when pain is high, halves the sets, and ends with a note on the timeline', async ({ page }) => {
  await importBackup(page, backup({
    injuries: [injury('back', 'L4–L5 disc bulge', 'Lower back')],
    symptoms: [{ id: 'p1', injuryId: 'back', type: 'pain', severity: 8, recordedAt: Date.now() - 60_000, source: 'user', ...stamp }],
    prescriptions: [{ id: 'rx', exerciseId: 'ex-bird-dog', injuryId: 'back', sets: 3, target: 10, timesPerDay: 1, daysPerWeek: 5, active: true, ...stamp }],
  }))
  await page.goto('/')
  await page.getByTestId('flare-suggestion').getByRole('button', { name: 'Start Flare-Up Plan' }).click()
  await expect(page.getByTestId('flare-card')).toContainText('Flare-up · day 1')
  await expect(page.getByTestId('flare-suggestion')).toHaveCount(0)

  await page.goto('/rehab/session')
  await expect(page.getByTestId('flare-session')).toBeVisible()
  await expect(page.getByText('0 of 2 sets')).toBeVisible() // 3 planned, halved

  await page.goto('/')
  await page.getByRole('button', { name: 'It’s Settling — End Flare-Up' }).click()
  await expect(page.getByText('Flare-up ended — back to your usual plan')).toBeVisible()
  await expect(page.getByTestId('flare-card')).toHaveCount(0)
  const notes = (await dumpDb(page)).journal.map((j: { text: string }) => j.text)
  expect(notes).toEqual(expect.arrayContaining(['Flare-up started: gentler days, half the usual sets.', 'Flare-up ended after 1 day.']))
})

test('how far it reaches: asked for back and neck symptoms, shown on the timeline, and spreading is flagged', async ({ page }) => {
  const earlier = (d: number) => ({ id: `n${d}`, injuryId: 'back', type: 'numbness', severity: 3, reach: 1, recordedAt: Date.now() - d * DAY, source: 'user', ...stamp })
  await importBackup(page, backup({ injuries: [injury('back', 'L4–L5 disc bulge', 'Lower back'), injury('knee', 'Right knee sprain', 'Knee')], symptoms: [earlier(3), earlier(2), earlier(1)] }))

  await page.goto('/log/symptom?injury=knee')
  await expect(page.getByText('How Far Does It Reach?')).toHaveCount(0) // a knee has nowhere to spread to

  await page.goto('/log/symptom?injury=back')
  await page.getByRole('button', { name: 'Tingling' }).click()
  await page.getByRole('button', { name: 'Below the knee' }).click()
  await page.getByRole('radio', { name: '4', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  expect((await dumpDb(page)).symptoms.find((s: Symptom) => s.type === 'tingling')).toMatchObject({ reach: 3 })

  await page.goto('/injuries/back')
  await expect(page.getByTestId('reach-trend')).toHaveText('Spreading further down')
  await expect(page.getByRole('link', { name: 'Check the warning signs' })).toBeVisible()
  await page.goto('/timeline')
  await expect(page.getByText(/Reaches: Below the knee/)).toBeVisible()
})
