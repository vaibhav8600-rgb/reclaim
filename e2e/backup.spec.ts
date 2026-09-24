import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { generateDemoData, IDS } from './fixtures/demo-data'
import { canonical, dumpDb, importBackup, seedDemo } from './helpers'

test('restore preview counts, then the data lands exactly as in the backup', async ({ page }) => {
  const demo = generateDemoData()
  await page.goto('/settings')
  await page.getByLabel('Backup file').setInputFiles({ name: 'demo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(demo)) })

  const table = page.locator('table')
  const counts = (label: string) => table.getByRole('row', { name: new RegExp(`^${label}\\b`) })
  await expect(counts('Symptoms')).toHaveText(new RegExp(`^Symptoms\\s*${demo.data.symptoms.length}\\s*0\\s*0$`))
  await expect(counts('Sessions')).toHaveText(new RegExp(`^Sessions\\s*${demo.data.sessions.length}\\s*0\\s*0$`))
  await page.getByRole('button', { name: /^Merge \d+ Changes$/ }).click()
  await expect(page.getByText('Backup restored')).toBeVisible()

  const db = await dumpDb(page)
  for (const t of ['injuries', 'symptoms', 'measurements', 'journal', 'prescriptions', 'sessions', 'profile'] as const) {
    const expected = [...demo.data[t]].sort((a, b) => a.id.localeCompare(b.id))
    expect(canonical(db[t]), t).toBe(canonical(expected))
  }
  expect(db.exercises.length).toBeGreaterThanOrEqual(20) // starter library
})

test('export → delete everything → restore gives back identical data', async ({ page }) => {
  await seedDemo(page)
  const before = await dumpDb(page)

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Create Backup' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Download/ }).click()])
  expect(download.suggestedFilename()).toMatch(/^Reclaim-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const file = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(file.app).toBe('reclaim')
  await expect(page.getByText(/^Last backup /)).toBeVisible()

  const del = page.getByRole('button', { name: 'Delete Everything' })
  await expect(del).toBeDisabled()
  await page.getByPlaceholder('Type "DELETE"').fill('delete')
  await expect(del).toBeDisabled()
  await page.getByPlaceholder('Type "DELETE"').fill('DELETE')
  await del.click()
  await expect(page.getByText('What are you recovering from?')).toBeVisible()
  expect((await dumpDb(page)).symptoms).toHaveLength(0)

  await importBackup(page, file)
  const after = await dumpDb(page)
  expect(canonical(after)).toBe(canonical(before))

  // Importing the same file again changes nothing.
  await page.getByLabel('Backup file').setInputFiles({ name: 'again.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
  await expect(page.getByText('This iPhone already has everything in this backup.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Merge 0/ })).toBeDisabled()
})

test('merge keeps the newest edit of each record', async ({ page }) => {
  const now = Date.now()
  const demo = await seedDemo(page, now)

  // Edit locally → newer than the backup.
  await page.goto(`/injuries/${IDS.elbow}/edit`)
  await page.getByPlaceholder('Left elbow pain').fill('Right tennis elbow')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Right tennis elbow', level: 1 })).toBeVisible()

  // Re-importing the older backup must not overwrite it.
  await page.goto('/settings')
  await page.getByLabel('Backup file').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(demo)) })
  await expect(page.getByRole('row', { name: /^Injuries/ })).toHaveText(/^Injuries\s*0\s*0\s*3$/)
  await page.getByRole('button', { name: 'Cancel' }).click()

  // A backup with an even newer edit wins.
  const newer = structuredClone(demo)
  const elbow = newer.data.injuries.find((i) => i.id === IDS.elbow)!
  elbow.name = 'Tennis elbow (from other device)'
  elbow.updatedAt = Date.now() + 60_000
  await page.getByLabel('Backup file').setInputFiles({ name: 'newer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(newer)) })
  await expect(page.getByRole('row', { name: /^Injuries/ })).toHaveText(/^Injuries\s*0\s*1\s*2$/)
  await page.getByRole('button', { name: 'Merge 1 Change' }).click()
  await expect(page.getByText('Backup restored')).toBeVisible()
  await page.goto(`/injuries/${IDS.elbow}`)
  await expect(page.getByRole('heading', { name: 'Tennis elbow (from other device)', level: 1 })).toBeVisible()
})

test('rejects files that are not Reclaim backups', async ({ page }) => {
  await page.goto('/settings')
  const input = page.getByLabel('Backup file')
  await input.setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{not json') })
  await expect(page.getByText("This file isn't valid JSON.")).toBeVisible()

  await input.setInputFiles({ name: 'y.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'other', data: {} })) })
  await expect(page.getByText(/doesn't look like a Reclaim backup/)).toBeVisible()

  const bad = generateDemoData()
  ;(bad.data.symptoms[0] as { severity: number }).severity = 42
  await input.setInputFiles({ name: 'z.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) })
  await expect(page.getByText(/doesn't look like a Reclaim backup \(data\.symptoms\.0\.severity/)).toBeVisible()
  expect((await dumpDb(page)).symptoms).toHaveLength(0)
})
