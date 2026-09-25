import { expect, test, type Page } from '@playwright/test'
import type { HealthFact } from '../src/db/db'
import { compareReports, medicineList } from '../src/lib/facts'
import { imagesToPdf } from '../src/lib/pdf'
import { mockAi } from './fake-ai'
import { FakeDrive } from './fake-google'
import { dumpDb, importBackup, injuriesBackup, newDevice } from './helpers'

const stamp = { createdAt: 0, updatedAt: 0 }
const fact = (f: Partial<HealthFact>) => ({ id: f.name ?? 'f', ...stamp, date: '2026-09-01', source: 'user_confirmed', kind: 'lab', name: '', ...f }) as HealthFact

test('photos → one PDF: every object where the index says, one page per photo', () => {
  const jpeg = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7) % 256)
  const pdf = imagesToPdf([{ jpeg: jpeg(300), width: 1200, height: 1600 }, { jpeg: jpeg(500), width: 1600, height: 1200 }])
  const text = new TextDecoder('latin1').decode(pdf)
  expect(text.startsWith('%PDF-1.4\n')).toBe(true)
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
  expect(text).toContain('/Count 2')
  expect(text).toContain('/MediaBox [0 0 595 793]') // portrait page follows the photo
  expect(text).toContain('/MediaBox [0 0 595 446]') // and landscape
  // The cross-reference table points at each object exactly (a PDF reader relies on it)
  const startxref = Number(/startxref\n(\d+)/.exec(text)![1])
  expect(text.slice(startxref, startxref + 4)).toBe('xref')
  const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
  expect(offsets).toHaveLength(8) // catalog, pages, and 3 per page
  offsets.forEach((o, i) => expect(text.slice(o, o + 10), `object ${i + 1}`).toMatch(new RegExp(`^${i + 1} 0 obj`)))
})

test('since last time, and one entry per medicine', () => {
  const before = [fact({ name: 'Vitamin D (25-OH)', value: 16, unit: 'ng/mL', flag: 'low' }), fact({ name: 'Haemoglobin', value: 14, unit: 'g/dL' }), fact({ name: 'HbA1c', value: 5.4, unit: '%' })]
  const after = [fact({ name: 'vitamin d (25-OH)', value: 34, unit: 'ng/mL' }), fact({ name: 'Haemoglobin', value: 14, unit: 'g/dL' }), fact({ name: 'Ferritin', value: 80, unit: 'ng/mL' })]
  const c = compareReports(after, before)
  expect(c.changed).toEqual([{ name: 'vitamin d (25-OH)', unit: 'ng/mL', before: '16 ng/mL', after: '34 ng/mL', beforeFlag: 'low', afterFlag: undefined, trend: 'up' }])
  expect(c.added.map((f) => f.name)).toEqual(['Ferritin'])
  expect(c.gone.map((f) => f.name)).toEqual(['HbA1c'])
  expect(c.same).toBe(1)

  const now = new Date(2026, 8, 25).getTime()
  const med = (name: string, date: string, detail: string) => fact({ id: `${name}${date}`, kind: 'medication', name, date, detail })
  const m = medicineList([med('Etoricoxib 90', '2026-09-10', '1 daily × 5 days'), med('etoricoxib 90', '2026-07-01', '1 daily'), med('Pregabalin 75', '2026-03-01', 'at night'), fact({ name: 'Haemoglobin' })], now)
  expect(m.recent).toMatchObject([{ name: 'Etoricoxib 90', count: 2, latest: { detail: '1 daily × 5 days' } }])
  expect(m.earlier.map((x) => x.name)).toEqual(['Pregabalin 75'])
})

async function photos(page: Page, n: number) {
  // Real images from a canvas, so the app can decode them
  return Promise.all(
    Array.from({ length: n }, async (_, i) => ({
      name: `report-page-${i + 1}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(
        await page.evaluate((k) => {
          const c = Object.assign(document.createElement('canvas'), { width: 400, height: 560 })
          const ctx = c.getContext('2d')!
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, 400, 560)
          ctx.fillStyle = '#000'
          ctx.font = '40px sans-serif'
          ctx.fillText(`Page ${k}`, 40, 80)
          return c.toDataURL('image/png').split(',')[1]
        }, i + 1),
        'base64',
      ),
    })),
  )
}

test('add records: photos of one report become one PDF record, a page each', async ({ page }) => {
  await page.goto('/documents/import')
  await page.getByLabel('Record files').setInputFiles(await photos(page, 3))
  await expect(page.getByText('3 Records')).toBeVisible()
  await page.getByText('Photos Are Pages of One Report').click()
  await expect(page.getByText('1 Record', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Added 1 record')).toBeVisible()

  const [doc] = (await dumpDb(page)).documents
  expect(doc).toMatchObject({ fileName: 'report-page-1 (3 pages).pdf', mimeType: 'application/pdf' })
  const head = await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((r) => { const q = indexedDB.open('reclaim'); q.onsuccess = () => r(q.result) })
    const file = await new Promise<{ bytes: ArrayBuffer }>((r) => { const q = db.transaction('files').objectStore('files').get(id); q.onsuccess = () => r(q.result) })
    const text = new TextDecoder('latin1').decode(file.bytes)
    return { start: text.slice(0, 8), pages: /\/Count (\d+)/.exec(text)?.[1] }
  }, doc.id)
  expect(head).toEqual({ start: '%PDF-1.4', pages: '3' })
})

test('a prescription shows what changed since the previous one', async ({ page }) => {
  const doc = (id: string, title: string, date: string) => ({ id, title, kind: 'prescription', date, fileName: `${id}.pdf`, mimeType: 'application/pdf', size: 1000, ...stamp })
  const med = (id: string, documentId: string, name: string, detail: string, date: string) => ({ id, kind: 'medication', name, detail, date, documentId, source: 'user_confirmed', ...stamp })
  await importBackup(page, {
    app: 'reclaim', schemaVersion: 1, exportedAt: new Date().toISOString(),
    data: {
      documents: [doc('rx1', 'Prescription: Dr Rao', '2026-07-01'), doc('rx2', 'Prescription: Dr Rao (review)', '2026-09-10')],
      facts: [
        med('a1', 'rx1', 'Etoricoxib 90', '1 daily', '2026-07-01'), med('a2', 'rx1', 'Pregabalin 75', 'at night', '2026-07-01'),
        med('b1', 'rx2', 'Etoricoxib 90', '1 daily × 5 days', '2026-09-10'), med('b2', 'rx2', 'Vitamin D3 60K', 'weekly', '2026-09-10'),
      ],
    },
  })
  await page.goto('/documents/rx2')
  await expect(page.getByRole('heading', { name: 'Since Last Time' })).toBeVisible()
  await expect(page.getByTestId('report-change')).toContainText('1 daily → 1 daily × 5 days')
  await expect(page.getByText('Vitamin D3 60K', { exact: true })).toBeVisible() // new this time
  await expect(page.getByText('No longer prescribed')).toBeVisible()
  await expect(page.getByText('Pregabalin 75', { exact: true })).toBeVisible()
})

test('show what’s sent: nothing leaves until Send; Cancel sends nothing', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  const requests = await mockAi(page)
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/settings')
  await page.getByText('Show What’s Sent First').click()
  await expect(page.getByRole('switch', { name: 'Show What’s Sent First' })).toBeChecked()

  await page.goto('/nutrition')
  await page.getByRole('button', { name: 'Suggest Meals' }).click()
  await page.getByRole('dialog', { name: 'Use AI in Reclaim?' }).getByRole('button', { name: 'Turn On AI' }).click()
  const sheet = page.getByRole('dialog', { name: 'What will be sent' })
  await expect(sheet).toContainText('Meal ideas')
  await expect(sheet).toContainText('Never sent to the AI')
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(sheet).toBeHidden()
  expect(requests.filter((r) => r.task === 'meal-ideas')).toHaveLength(0)

  await page.getByRole('button', { name: 'Suggest Meals' }).click()
  await sheet.getByRole('button', { name: 'Send' }).click()
  await expect.poll(() => requests.filter((r) => r.task === 'meal-ideas').length).toBe(1)
})
