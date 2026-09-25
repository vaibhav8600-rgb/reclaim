import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Activity, Injury, Meal, RehabSession, Symptom } from '../src/db/db'
import { csv } from '../src/lib/csv'
import { startOfWeek } from '../src/lib/rehab'
import { weekReview } from '../src/lib/week'
import { crc32, zip } from '../src/lib/zip'
import { importBackup } from './helpers'

const DAY = 86_400_000
const stamp = { createdAt: 0, updatedAt: 0 }

/** Reads a stored (uncompressed) ZIP back: name → text, checking each file's checksum. */
function unzip(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  expect(v.getUint32(end, true)).toBe(0x06054b50)
  const count = v.getUint16(end + 10, true)
  let at = v.getUint32(end + 16, true)
  const files = new Map<string, string>()
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50)
    const crc = v.getUint32(at + 16, true)
    const size = v.getUint32(at + 20, true)
    const nameLen = v.getUint16(at + 28, true)
    const local = v.getUint32(at + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen))
    expect(v.getUint32(local, true), name).toBe(0x04034b50)
    const data = bytes.subarray(local + 30 + nameLen, local + 30 + nameLen + size)
    expect(crc32(data), name).toBe(crc)
    files.set(name, new TextDecoder().decode(data))
    at += 46 + nameLen
  }
  return files
}

test('zip and csv: a readable archive, and spreadsheet cells escaped properly', () => {
  expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686)
  const files = unzip(zip([{ name: 'a.txt', data: new TextEncoder().encode('hello') }, { name: 'folder/b – é.csv', data: new TextEncoder().encode('x,y') }]))
  expect([...files]).toEqual([['a.txt', 'hello'], ['folder/b – é.csv', 'x,y']])
  expect(csv(['A', 'B'], [['x,y', 'he said "hi"'], [undefined, 3]])).toBe('﻿A,B\r\n"x,y","he said ""hi"""\r\n,3\r\n')
})

test('the week in review compares every area with the week before', () => {
  const monday = new Date(2026, 8, 21).getTime()
  const at = (weekOffset: number, day: number, h = 10) => monday + weekOffset * 7 * DAY + day * DAY + h * 3_600_000
  const injury = { id: 'b', name: 'L4–L5 disc bulge', bodyRegion: 'Lower back', side: 'none', startDate: '2026-08-01', status: 'active', ...stamp } as Injury
  const pain = (w: number, d: number, severity: number) => ({ id: `p${w}${d}`, injuryId: 'b', type: 'pain', severity, recordedAt: at(w, d), source: 'user', ...stamp }) as Symptom
  const day = (w: number, d: number) => { const x = new Date(at(w, d)); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
  const steps = (w: number, d: number, n: number) => ({ id: `a${w}${d}`, date: day(w, d), steps: n, source: 'user', ...stamp }) as Activity
  const meal = (w: number, d: number, protein: number, calories: number) => ({ id: `m${w}${d}`, name: 'x', protein, calories, items: [], recordedAt: at(w, d), source: 'user', ...stamp }) as unknown as Meal
  const workout = (w: number, d: number) => ({ id: `w${w}${d}`, kind: 'workout', startedAt: at(w, d), recordedAt: at(w, d) + 40 * 60_000, items: [], source: 'user', ...stamp }) as RehabSession
  const rows = weekReview({
    injuries: [injury],
    symptoms: [pain(-1, 0, 6), pain(-1, 2, 5), pain(0, 0, 3), pain(0, 3, 3)],
    sessions: [workout(0, 1), workout(0, 4)],
    prescriptions: [],
    activity: [steps(-1, 0, 4000), steps(-1, 1, 4200), steps(0, 0, 6000), steps(0, 1, 6400)],
    sleep: [],
    measurements: [],
    meals: [meal(-1, 0, 90, 2600), meal(0, 0, 130, 2250), meal(0, 1, 110, 2100)],
    water: [],
    checkins: [],
    profile: { proteinTarget: 120, calorieTarget: 2200 },
  }, monday)
  const row = (id: string) => rows.find((r) => r.id === id)
  expect(row('pain-b')).toMatchObject({ now: '3/10 average', before: '5.5/10', dir: 'better' })
  expect(row('steps')).toMatchObject({ now: '6,200', dir: 'better' })
  expect(row('workouts')).toMatchObject({ now: '2 · 80 min', before: '0', dir: 'better' })
  expect(row('protein')).toMatchObject({ now: '120 g a day · goal met 1 of 2 days', dir: 'better' })
  expect(row('calories')).toMatchObject({ now: '2,175 kcal a day · goal met 2 of 2 days', dir: 'better' }) // closer to the goal, not just lower
  expect(row('sleep')).toBeUndefined() // nothing logged: no row
})

test('export everything: one ZIP with spreadsheets, the backup and a read-me', async ({ page }) => {
  await importBackup(page, {
    app: 'reclaim', schemaVersion: 1, exportedAt: new Date().toISOString(),
    data: {
      injuries: [{ id: 'b', name: 'L4–L5 disc bulge', bodyRegion: 'Lower back', side: 'none', startDate: '2026-08-01', status: 'active', ...stamp }],
      symptoms: [{ id: 's1', injuryId: 'b', type: 'pain', severity: 4, trigger: 'Sitting, long drive', recordedAt: Date.now() - DAY, source: 'user', ...stamp }],
      documents: [{ id: 'd1', title: 'MRI lumbar spine', kind: 'imaging', date: '2026-08-02', injuryId: 'b', fileName: 'mri.pdf', mimeType: 'application/pdf', size: 1000, ...stamp }],
    },
  })
  await page.goto('/settings')
  await page.getByText('Export Everything').click()
  const download = page.waitForEvent('download')
  await page.getByText('Download', { exact: true }).click()
  const files = unzip(new Uint8Array(readFileSync(await (await download).path())))
  expect([...files.keys()]).toEqual(expect.arrayContaining(['spreadsheets/symptoms.csv', 'spreadsheets/injuries.csv', 'spreadsheets/meals.csv', 'Reclaim-backup.json', 'README.txt']))
  expect(files.get('spreadsheets/symptoms.csv')).toContain('L4–L5 disc bulge,Pain,4,,"Sitting, long drive"')
  expect(JSON.parse(files.get('Reclaim-backup.json')!).app).toBe('reclaim')
  expect(files.get('README.txt')).toContain('Not included (the file is only in Google Drive — sign in to include it): MRI lumbar spine') // no file on this device
})

test('your week, and the doctor report lists its attachments', async ({ page }) => {
  const monday = startOfWeek(Date.now())
  await importBackup(page, {
    app: 'reclaim', schemaVersion: 1, exportedAt: new Date().toISOString(),
    data: {
      injuries: [{ id: 'b', name: 'L4–L5 disc bulge', bodyRegion: 'Lower back', side: 'none', startDate: '2026-08-01', status: 'active', ...stamp }],
      symptoms: [
        { id: 'p1', injuryId: 'b', type: 'pain', severity: 6, recordedAt: monday - 5 * DAY, source: 'user', ...stamp },
        { id: 'p2', injuryId: 'b', type: 'pain', severity: 3, recordedAt: monday + 60_000, source: 'user', ...stamp },
      ],
      documents: [{ id: 'd1', title: 'MRI lumbar spine', kind: 'imaging', date: '2026-08-02', injuryId: 'b', fileName: 'mri.pdf', mimeType: 'application/pdf', size: 1000, ...stamp }],
    },
  })
  await page.goto('/week')
  await page.getByRole('button', { name: 'This Week' }).click()
  await expect(page.getByTestId('week-pain-b')).toContainText('3/10 average')
  await expect(page.getByTestId('week-pain-b')).toContainText('Better')

  await page.goto('/report?injury=b')
  await expect(page.getByTestId('attachments')).toContainText('MRI lumbar spine')
  await expect(page.getByRole('button', { name: 'Share the Record' })).toBeVisible()
})
