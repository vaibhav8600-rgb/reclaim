import { expect, test } from '@playwright/test'
import type { Injury } from '../src/db/db'
import { adjustments } from '../src/lib/plan'
import { safetyCheckDue } from '../src/lib/safety'
import { signGroups, urgencyOf } from '../src/lib/warningSigns'
import { dumpDb, importBackup } from './helpers'

const DAY = 86_400_000
const injury = (id: string, name: string, bodyRegion: string) => ({ id, name, bodyRegion, side: 'none', startDate: '2026-09-01', status: 'active', createdAt: 0, updatedAt: 0 }) as Injury
const backup = (...injuries: Injury[]) => ({ app: 'reclaim', schemaVersion: 1, exportedAt: new Date().toISOString(), data: { injuries } })

test('warning signs are picked by the injuries, and the check comes back weekly or after a nerve symptom', () => {
  const titles = (regions: string[], nerve = false) => signGroups(regions, nerve).map((g) => g.title)
  expect(titles(['Lower back'])).toEqual(['Lower Back'])
  expect(titles(['Neck', 'Elbow'])).toEqual(['Neck', 'Joints'])
  expect(titles(['Elbow'], true)).toEqual(['Lower Back', 'Neck', 'Joints']) // numbness: the spine lists too
  expect(titles([])).toEqual(['Lower Back', 'Neck', 'Joints'])
  const ids = (regions: string[]) => signGroups(regions).flatMap((g) => g.signs.map((s) => s.id))
  expect(ids(['Elbow'])).not.toContain('clot') // leg-only questions for leg injuries
  expect(ids(['Knee'])).toContain('clot')

  const [saddle, fever] = [signGroups(['Lower back'])[0].signs[0], signGroups(['Lower back'])[0].signs[4]]
  expect(urgencyOf([])).toBeUndefined()
  expect(urgencyOf([fever])).toBe('soon')
  expect(urgencyOf([fever, saddle])).toBe('now')

  const now = Date.UTC(2026, 8, 25, 12)
  expect(safetyCheckDue(['Lower back'], undefined, undefined, now)).toBe('weekly')
  expect(safetyCheckDue(['Lower back'], now - 2 * DAY, undefined, now)).toBeUndefined()
  expect(safetyCheckDue(['Lower back'], now - 8 * DAY, undefined, now)).toBe('weekly')
  expect(safetyCheckDue(['Elbow'], undefined, undefined, now)).toBeUndefined() // no spine injury: no weekly check
  expect(safetyCheckDue(['Elbow'], now - 2 * DAY, now - DAY, now)).toBe('nerve') // numbness since the last check
  expect(safetyCheckDue(['Elbow'], now - DAY, now - 2 * DAY, now)).toBeUndefined() // already checked since
  expect(safetyCheckDue(['Elbow'], undefined, now - 4 * DAY, now)).toBeUndefined() // too long ago to ask now
})

test('one plan across injuries: each exercise says how to adjust it for the others', () => {
  const knees = [injury('a', 'Right knee strain', 'Knee'), injury('b', 'Left knee strain', 'Knee')]
  const back = injury('c', 'L4–L5 disc bulge', 'Lower back')
  const elbow = injury('d', 'Tennis elbow', 'Elbow')
  // Bird dog is for the back; kneeling needs a note (once, for two sore knees), and so does weight through the hands.
  expect(adjustments('ex-bird-dog', [...knees, back, elbow]).map((a) => [a.injury.name, a.note.split(':')[0]])).toEqual([
    ['Right knee strain', 'Kneeling presses on the knee'],
    ['Tennis elbow', 'Your weight goes through your hands'],
  ])
  expect(adjustments('ex-slr', [back])[0].note).toMatch(/stop if pain runs down the leg/)
  expect(adjustments('ex-quad-set', [...knees, back])).toEqual([]) // made for the knee, nothing to adjust
  expect(adjustments('custom-exercise', [back])).toEqual([])
})

test('weekly safety check: nothing ticked clears it; numbness brings it back, and a ticked sign says what to do', async ({ page }) => {
  await importBackup(page, backup(injury('back', 'L4–L5 disc bulge', 'Lower back'), injury('knee', 'Right knee sprain', 'Knee')))
  await page.goto('/')
  await page.getByRole('link', { name: /Weekly safety check/ }).click()
  await expect(page.getByRole('heading', { name: 'Warning Signs' })).toBeVisible()
  await expect(page.getByText('Lower Back', { exact: true })).toBeVisible()
  await expect(page.getByText(/Calf pain, swelling/)).toBeVisible() // a leg injury adds the blood-clot question
  await expect(page.getByText('Neck', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'I Have None of These' }).click()
  await expect(page.getByText('No warning signs — safety check done')).toBeVisible()
  await expect(page.getByRole('link', { name: /Weekly safety check/ })).toHaveCount(0)

  // Numbness: the form says why, and Today asks again
  await page.goto('/log/symptom')
  await page.getByRole('button', { name: 'Numbness' }).click()
  await expect(page.getByTestId('nerve-note')).toBeVisible()
  await page.getByRole('radio', { name: '4', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('link', { name: /You logged numbness, tingling or weakness/ }).click()
  await expect(page.getByText('Neck', { exact: true })).toBeVisible() // nerve signs can start in the neck too
  await page.getByText(/Numbness or tingling around your bottom/).click()
  await page.getByRole('button', { name: 'Show What to Do' }).click()
  await expect(page.getByRole('alert')).toContainText('Get medical help now')
  await expect(page.getByRole('alert')).toContainText('112')
  expect((await dumpDb(page)).journal).toMatchObject([{ text: expect.stringMatching(/^Warning signs \(get help now\): Numbness or tingling around your bottom/) }])
})

test('the exercise page says how to adjust it for your other injuries', async ({ page }) => {
  await importBackup(page, backup(injury('back', 'L4–L5 disc bulge', 'Lower back'), injury('knee', 'Right knee sprain', 'Knee')))
  await page.goto('/rehab/exercises/ex-bird-dog')
  await expect(page.getByTestId('adjust-notes')).toContainText('Right knee sprain: Kneeling presses on the knee')
  await page.goto('/rehab/exercises/ex-quad-set')
  await expect(page.getByRole('heading', { name: 'How To' })).toBeVisible()
  await expect(page.getByTestId('adjust-notes')).toHaveCount(0)
})
