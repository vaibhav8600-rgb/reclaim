import { expect, test, type Page } from '@playwright/test'
import type { HealthFact } from '../src/db/db'
import { convertUnit, weightKg } from '../src/lib/constants'
import { injurySuggestions } from '../src/lib/facts'
import { mockAi } from './fake-ai'
import { FakeDrive } from './fake-google'
import { dumpDb, newDevice } from './helpers'

const condition = (f: Partial<HealthFact>) => ({ id: 'f', createdAt: 0, updatedAt: 0, source: 'user_confirmed', kind: 'condition', name: 'Lateral epicondylitis', date: '2026-07-01', bodyRegion: 'Elbow', side: 'right', ...f }) as HealthFact

test('injuries are suggested from records only when one body part is named and it isn’t tracked yet', () => {
  const facts = [condition({ date: '2026-08-01' }), condition({ date: '2026-07-01', detail: 'Early' }), condition({ name: 'Hypertension', bodyRegion: undefined, side: undefined })]
  expect(injurySuggestions(facts, [])).toEqual([{ key: 'lateral epicondylitis|Elbow|right', name: 'Lateral epicondylitis', bodyRegion: 'Elbow', side: 'right', since: '2026-07-01', detail: undefined }])
  expect(injurySuggestions(facts, [{ bodyRegion: 'Elbow', side: 'right' }])).toEqual([]) // already tracked
  expect(injurySuggestions(facts, [{ bodyRegion: 'Elbow', side: 'left' }])).toHaveLength(1) // the other elbow
  expect(injurySuggestions(facts, [{ bodyRegion: 'Elbow', side: 'right', deletedAt: 1 }])).toHaveLength(1)
  expect(injurySuggestions(facts, [], ['lateral epicondylitis|Elbow|right'])).toEqual([]) // dismissed
})

test('units convert, and weight in pounds still works out per kg', () => {
  expect(convertUnit(80, 'cm', 'in')).toBe(31.5)
  expect(convertUnit(34, 'in', 'cm')).toBe(86.4)
  expect(convertUnit(70, 'kg', 'lb')).toBe(154.3)
  expect(weightKg({ value: 176, unit: 'lb' })).toBe(79.8)
  expect(weightKg({ value: 80, unit: 'kg' })).toBe(80)
})

async function acceptConsent(page: Page) {
  const sheet = page.getByRole('dialog', { name: 'Use AI in Reclaim?' })
  await sheet.getByRole('button', { name: 'Turn On AI' }).click()
  await expect(sheet).toBeHidden()
}

test('from scanned records to a plan: the condition is offered as an injury, then the plan builds on it', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  await mockAi(page)
  await page.goto('/documents/import')
  await page.getByLabel('Record files').setInputFiles({ name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nreport\n%%EOF') })
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Read Record with AI' }).click()
  await acceptConsent(page)
  await page.getByRole('link', { name: /6 facts found/ }).click({ timeout: 30_000 })
  await expect(page.getByText('Right elbow', { exact: true })).toBeVisible() // where, shown for checking
  await page.getByRole('button', { name: 'Save' }).click()

  // Offered, not added: nothing becomes an injury until tapped.
  await expect(page.getByRole('heading', { name: 'From Your Records' })).toBeVisible()
  await expect(page.getByText(/Right elbow · in your records since 1 Sept? 2026/)).toBeVisible()
  expect((await dumpDb(page)).injuries ?? []).toHaveLength(0)
  await page.getByRole('button', { name: 'Add Lateral epicondylitis as an injury' }).click()
  await expect(page.getByText('Lateral epicondylitis added')).toBeVisible()
  expect((await dumpDb(page)).injuries).toMatchObject([{ name: 'Lateral epicondylitis', bodyRegion: 'Elbow', side: 'right', startDate: '2026-09-01', status: 'active', diagnosis: 'Lateral epicondylitis' }])
  await expect(page.getByRole('heading', { name: 'From Your Records' })).toHaveCount(0)

  // On to the plan, which now has an injury to build around
  await page.getByRole('link', { name: /Next: your recovery plan/ }).click()
  await expect(page.getByRole('button', { name: 'Create My Plan' })).toBeVisible()
})

test('waist in inches: the unit is offered, converts what’s typed, and is remembered', async ({ page }) => {
  await page.goto('/log/measurement')
  await page.getByRole('button', { name: 'Waist' }).click()
  await page.getByLabel('Value').fill('86.4')
  await page.getByRole('radio', { name: 'in' }).click()
  await expect(page.getByLabel('Value')).toHaveValue('34')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Waist 34 in saved')).toBeVisible()

  await page.goto('/log/measurement')
  await page.getByRole('button', { name: 'Waist' }).click()
  await expect(page.getByRole('radio', { name: 'in' })).toBeChecked()
})
