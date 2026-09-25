import { expect, test } from '@playwright/test'
import type { Injury, Prescription, RehabSession } from '../src/db/db'
import { FITNESS_EXERCISES, STARTER_EXERCISES } from '../src/lib/exercises'
import { bestsFor, CAUTIONS, cautionsFor, newBests, STARTER_WORKOUTS } from '../src/lib/fitness'
import { sessionStats, weeklyAdherence } from '../src/lib/rehab'
import { dumpDb, importBackup } from './helpers'

const stamp = { createdAt: 0, updatedAt: 0 }
const injury = (id: string, name: string, bodyRegion: string) => ({ id, name, bodyRegion, side: 'none', startDate: '2026-09-01', status: 'active', ...stamp }) as Injury
const back = injury('back', 'L4–L5 disc bulge', 'Lower back')
const knee = injury('knee', 'Right knee sprain', 'Knee')
const elbow = injury('elbow', 'Tennis elbow', 'Elbow')
const set = (amount: number, load?: number) => ({ amount, load, done: true })
const session = (items: RehabSession['items'], extra: Partial<RehabSession> = {}) => ({ id: 's', startedAt: 0, recordedAt: 45 * 60_000, items, source: 'user', ...stamp, ...extra }) as RehabSession

test('the fitness library is consistent, and each exercise says how it sits with your injuries', () => {
  const ids = new Set([...STARTER_EXERCISES, ...FITNESS_EXERCISES].map((e) => e.id))
  expect(ids.size).toBe(STARTER_EXERCISES.length + FITNESS_EXERCISES.length)
  for (const id of Object.keys(CAUTIONS)) expect(ids.has(id), id).toBe(true)
  for (const w of STARTER_WORKOUTS) for (const i of w.items) expect(ids.has(i.exerciseId), `${w.name}: ${i.exerciseId}`).toBe(true)

  expect(cautionsFor('fx-deadlift', [back])).toMatchObject([{ level: 'avoid', injury: { name: 'L4–L5 disc bulge' } }])
  expect(cautionsFor('fx-deadlift', [knee])).toMatchObject([{ level: 'adjust' }])
  // Ask-your-physio first, then adjustments; one per region
  expect(cautionsFor('fx-back-squat', [knee, back, elbow]).map((c) => [c.region, c.level])).toEqual([['Lower back', 'avoid'], ['Knee', 'adjust']])
  expect(cautionsFor('fx-jog', [knee])[0].level).toBe('avoid')
  expect(cautionsFor('ex-bird-dog', [knee])[0]).toMatchObject({ level: 'adjust', note: expect.stringMatching(/^Kneeling presses/) }) // a rehab exercise's own note
  expect(cautionsFor('fx-walk', [elbow])).toEqual([])
})

test('a workout’s numbers and personal bests; workouts don’t count towards the rehab plan', () => {
  const s = session([{ exerciseId: 'fx-goblet-squat', sets: [set(10, 16), set(10, 16), set(8, 18)] }])
  expect(sessionStats(s)).toEqual({ minutes: 45, volume: 464 })

  const before = [session([{ exerciseId: 'fx-goblet-squat', sets: [set(10, 16)] }, { exerciseId: 'fx-plank', sets: [set(30)] }])]
  const names = new Map([['fx-goblet-squat', { name: 'Goblet squat', mode: 'reps' as const }], ['fx-plank', { name: 'Plank', mode: 'time' as const }], ['fx-leg-press', { name: 'Leg press', mode: 'reps' as const }]])
  const now = session([{ exerciseId: 'fx-goblet-squat', sets: [set(8, 18)] }, { exerciseId: 'fx-plank', sets: [set(45)] }, { exerciseId: 'fx-leg-press', sets: [set(10, 60)] }])
  expect(newBests(before, now, names)).toEqual(['Goblet squat: 18 kg', 'Plank: 45 s']) // the leg press is new: nothing to beat yet
  expect(bestsFor([...before, now], 'fx-goblet-squat')).toEqual({ heaviest: 18, most: 10 })

  const p = { id: 'p', exerciseId: 'ex-bird-dog', sets: 3, target: 10, timesPerDay: 1, daysPerWeek: 5, active: true, ...stamp } as Prescription
  const today = Date.now()
  const rehab = session([{ exerciseId: 'ex-bird-dog', sets: [set(10)] }], { recordedAt: today })
  const workout = session([{ exerciseId: 'ex-bird-dog', sets: [set(10)] }], { recordedAt: today, kind: 'workout' })
  expect(weeklyAdherence([p], [rehab, workout], today).done).toBe(1)
})

test('library: filter by kind, and heavy loads on an injury say “ask physio”', async ({ page }) => {
  await importBackup(page, { app: 'reclaim', schemaVersion: 1, exportedAt: new Date().toISOString(), data: { injuries: [back] } })
  await page.goto('/rehab/library')
  await page.getByRole('button', { name: 'Strength', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Rehab' })).toHaveCount(0)
  await expect(page.getByTestId('caution-fx-deadlift')).toHaveText('Ask physio')
  await expect(page.getByTestId('caution-fx-squat')).toHaveText('Adjust')
  await page.getByRole('link', { name: /^Deadlift/ }).click()
  await expect(page.getByTestId('avoid-notes')).toContainText('L4–L5 disc bulge: Lifting from the floor loads the lower back discs heavily')
})

test('workout: add a starter, log it with the rest timer and effort, and beat a personal best', async ({ page }) => {
  const lastTime = { id: 'w0', startedAt: Date.now() - 3 * 86_400_000, recordedAt: Date.now() - 3 * 86_400_000 + 3_000_000, kind: 'workout', name: 'Gym: upper body', source: 'user', items: [{ exerciseId: 'fx-lat-pulldown', sets: [set(10, 30)] }], ...stamp }
  await importBackup(page, { app: 'reclaim', schemaVersion: 1, exportedAt: new Date().toISOString(), data: { injuries: [elbow], sessions: [lastTime] } })
  await page.goto('/rehab')
  await page.getByRole('button', { name: '+ Gym: upper body' }).click()
  await expect(page.getByText('Gym: upper body added')).toBeVisible()
  await page.getByRole('link', { name: 'Start Gym: upper body' }).click()

  await expect(page.getByRole('heading', { name: 'Gym: upper body' })).toBeVisible()
  await expect(page.getByTestId('adjust-notes').first()).toContainText('Tennis elbow: Gripping loads the elbow')
  await page.getByLabel('Lat pulldown set 1 load').fill('35')
  await page.getByRole('button', { name: 'Lat pulldown set 1 done' }).click()
  await expect(page.getByTestId('rest-timer')).toContainText(/Rest 1:(29|30)/)
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByTestId('rest-timer')).toHaveCount(0)
  await page.getByRole('radio', { name: 'How Hard Was It? 7' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('New personal best! Lat pulldown: 35 kg')).toBeVisible()

  const saved = (await dumpDb(page)).sessions.find((s: RehabSession) => s.id !== 'w0')
  expect(saved).toMatchObject({ kind: 'workout', name: 'Gym: upper body', effort: 7, items: expect.arrayContaining([expect.objectContaining({ exerciseId: 'fx-lat-pulldown', sets: expect.arrayContaining([{ amount: 10, load: 35, done: true }]) })]) })
  await expect(page.getByRole('link', { name: /Gym: upper body.*350 kg lifted · effort 7\/10/ })).toBeVisible() // in Recent Sessions
})
