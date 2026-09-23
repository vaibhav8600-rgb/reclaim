import { expect, type Page } from '@playwright/test'
import { generateDemoData, type DemoBackup } from './fixtures/demo-data'

const DAY = 86_400_000

/** Load a backup through the real Settings → Restore flow (the same path a user takes). */
export async function importBackup(page: Page, backup: DemoBackup | object, name = 'Reclaim-backup.json') {
  await page.goto('/settings')
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await page.getByRole('button', { name: /^Merge \d+/ }).click()
  await expect(page.getByText('Backup restored')).toBeVisible({ timeout: 90_000 })
}

/** Seed the realistic demo person. Returns the data so tests can compute expectations from it. */
export async function seedDemo(page: Page, now = Date.now()) {
  const backup = generateDemoData({ now })
  await importBackup(page, backup, 'Reclaim-demo.json')
  return backup
}

export const tab = (page: Page, name: 'Today' | 'Rehab' | 'Timeline' | 'Injuries') =>
  page.locator('nav.tabbar').getByRole('link', { name, exact: true })

/** Every table in the app's IndexedDB, rows sorted by id. */
export async function dumpDb(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('reclaim')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const out: Record<string, { id: string; [k: string]: unknown }[]> = {}
    for (const name of Array.from(db.objectStoreNames)) {
      if (name === 'meta') continue
      out[name] = await new Promise((resolve) => {
        const req = db.transaction(name).objectStore(name).getAll()
        req.onsuccess = () => resolve((req.result as { id: string }[]).sort((a, b) => a.id.localeCompare(b.id)))
      })
    }
    db.close()
    return out
  })
}

/** JSON with sorted keys and undefined dropped — for comparing records regardless of key order. */
export const canonical = (v: unknown) =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => [k, x[k]]))
      : x,
  )

/* ── Independent re-implementations of what the app should show ── */

export function localMidnight(ms: number) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Mean of live pain logs for an injury from the start of the day 6 days ago. */
export function sevenDayAverage(backup: DemoBackup, injuryId: string, now = Date.now()) {
  const from = localMidnight(now) - 6 * DAY
  const vals = backup.data.symptoms
    .filter((s) => !s.deletedAt && s.type === 'pain' && s.injuryId === injuryId && s.recordedAt >= from)
    .map((s) => s.severity)
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export function rangeAverage(backup: DemoBackup, injuryId: string, days: number, now = Date.now()) {
  const from = localMidnight(now) - (days - 1) * DAY
  const vals = backup.data.symptoms.filter((s) => !s.deletedAt && s.type === 'pain' && s.injuryId === injuryId && s.recordedAt >= from).map((s) => s.severity)
  return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length }
}

export function latestPain(backup: DemoBackup, injuryId: string) {
  return backup.data.symptoms
    .filter((s) => !s.deletedAt && s.type === 'pain' && s.injuryId === injuryId)
    .sort((a, b) => b.recordedAt - a.recordedAt)[0]
}

/** Week starts Monday. Planned = Σ active timesPerDay × daysPerWeek; done = exercises with a completed set. */
export function weekAdherence(backup: DemoBackup, now = Date.now()) {
  const m = new Date(localMidnight(now))
  const weekStart = m.getTime() - ((m.getDay() + 6) % 7) * DAY
  const planned = backup.data.prescriptions.filter((p) => p.active && !p.deletedAt).reduce((n, p) => n + p.timesPerDay * p.daysPerWeek, 0)
  const done = backup.data.sessions
    .filter((s) => !s.deletedAt && s.recordedAt >= weekStart)
    .reduce((n, s) => n + s.items.filter((i) => i.sets.some((x) => x.done)).length, 0)
  return { planned, done }
}

/** A small backup containing just the given injuries (for tests that don't need the full demo). */
export function injuriesBackup(...names: string[]) {
  const t = Date.now() - 10 * DAY
  const d = new Date(t)
  const startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return {
    app: 'reclaim',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      injuries: names.map((name, i) => ({
        id: `inj-${i}`, name, bodyRegion: 'Elbow', side: 'right', startDate, status: 'active', createdAt: t, updatedAt: t,
      })),
    },
  }
}

/** A fresh browser context that behaves like another device (same project settings), wired to a fake Google Drive. */
export async function newDevice(browser: import('@playwright/test').Browser, info: import('@playwright/test').TestInfo, drive: import('./fake-google').FakeDrive) {
  const u = info.project.use
  const context = await browser.newContext({
    viewport: u.viewport,
    deviceScaleFactor: u.deviceScaleFactor,
    isMobile: u.isMobile,
    hasTouch: u.hasTouch,
    userAgent: u.userAgent,
    baseURL: u.baseURL,
    timezoneId: u.timezoneId,
    locale: u.locale,
    reducedMotion: u.reducedMotion,
    serviceWorkers: 'block',
    acceptDownloads: true,
  })
  await drive.install(context)
  return context.newPage()
}

/** Settings → Connect Google Drive → sign in → create (or unlock with) the passphrase. */
export async function connectDrive(page: Page, passphrase: string, { existing = false } = {}) {
  await page.goto('/settings')
  await page.getByRole('link', { name: 'Connect Google Drive' }).click()
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  if (existing) {
    await expect(page.getByRole('heading', { name: 'Enter your passphrase' })).toBeVisible()
    await page.getByLabel('Passphrase', { exact: true }).fill(passphrase)
    await page.getByRole('button', { name: 'Unlock' }).click()
  } else {
    await expect(page.getByRole('heading', { name: 'Create a passphrase' })).toBeVisible()
    await page.getByLabel('Passphrase', { exact: true }).fill(passphrase)
    await page.getByLabel('Confirm passphrase').fill(passphrase)
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Encrypt and Back Up' }).click()
  }
  await expect(page.getByText('Google Drive connected')).toBeVisible({ timeout: 90_000 })
}

/** Settings → Sync Now, waiting for it to finish. */
export async function syncNow(page: Page) {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Sync Now' }).click()
  await expect(page.getByText('Synced with Google Drive')).toBeVisible({ timeout: 90_000 })
}

/** A 1×1 PNG, as if photographed. */
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
