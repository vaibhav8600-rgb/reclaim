import { expect, test, type Page } from '@playwright/test'
import { AI_TASKS, outputs, type AiInput, type AiOutput, type AiTask } from '../shared/ai'
import { buildPrompt } from '../server/ai/prompts'
import { rangeFlag } from '../src/lib/facts'
import { ANSWERS, mockAi } from './fake-ai'
import { FakeDrive } from './fake-google'
import { dumpDb, importBackup, injuriesBackup, newDevice, PNG, seedDemo } from './helpers'

const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n${name}\n%%EOF`) })

async function acceptConsent(page: Page) {
  const sheet = page.getByRole('dialog', { name: 'Use AI in Reclaim?' })
  await sheet.getByRole('button', { name: 'Turn On AI' }).click()
  await expect(sheet).toBeHidden()
}

test('lab flags are worked out only from ranges simple enough to trust', () => {
  expect(rangeFlag(18, '30 - 100')).toBe('low')
  expect(rangeFlag(120, '30–100')).toBe('high')
  expect(rangeFlag(50, '30 to 100')).toBeUndefined()
  expect(rangeFlag(14.2, '13.0-17.0')).toBeUndefined()
  expect(rangeFlag(-3, '-2 - 2')).toBe('low')
  expect(rangeFlag(6, '< 5')).toBe('high')
  expect(rangeFlag(4, 'Up to 5.0')).toBeUndefined()
  expect(rangeFlag(35, '> 40')).toBe('low')
  expect(rangeFlag(1500, '1,000 - 2,000')).toBeUndefined()
  // Several bands, or words: not trusted — the report's own flag is used instead.
  expect(rangeFlag(25, 'Deficient < 20, Insufficient 20 - 30, Sufficient 30 - 100')).toBeNull()
  expect(rangeFlag(1, 'Negative')).toBeNull()
})

test('the record-reading answer survives small model slips, and Gemini gets a schema it accepts', () => {
  // Seen from a real model on the plain fallback path: questions wrapped as objects, a number as text.
  const r = outputs['summarize-document'].parse({
    readable: 'yes',
    summary: 'The report states…',
    findings: [{ label: 'Vitamin D', detail: 'Low' }, 'not an object'],
    questions: [{ question: 'Should I take a supplement?' }, 'What about B12?'],
    document: { title: 'Blood test', kind: 'lab', date: '12/08/2026' },
    facts: [
      { kind: 'lab', name: 'Vitamin D (25-OH)', value: '14.62', unit: 'ng/mL', flag: 'LOW', evidence: 'Vitamin D 14.62' },
      { kind: 'mystery', name: 'dropped' },
    ],
  })
  expect(r.questions).toEqual(['Should I take a supplement?', 'What about B12?'])
  expect(r.findings).toHaveLength(1)
  expect(r.document).toEqual({ title: 'Blood test', kind: 'lab', date: '' }) // only YYYY-MM-DD dates are trusted
  expect(r.facts).toEqual([{ kind: 'lab', name: 'Vitamin D (25-OH)', value: 14.62, unit: 'ng/mL', evidence: 'Vitamin D 14.62' }])

  // Gemini rejects a large maxItems on a list of objects ("invalid argument"), which silently forced the plain path.
  const maxItems = (schema: unknown): number[] =>
    schema && typeof schema === 'object' ? Object.entries(schema).flatMap(([k, v]) => (k === 'maxItems' ? [v as number] : maxItems(v))) : []
  const samples: { [T in AiTask]: AiInput<T> } = {
    'structure-note': { text: 'x', date: '2026-01-01', injuries: [] },
    'summarize-document': { title: 't', kind: 'lab', mimeType: 'image/jpeg', data: '' },
    'estimate-meal': { description: 'eggs' },
    'weekly-summary': { context: {} },
    ask: { question: 'why?', context: {} },
    'report-narrative': { context: {} },
    'health-summary': { context: {} },
    'recovery-plan': { context: {} },
  }
  for (const task of AI_TASKS) expect(Math.max(0, ...maxItems(buildPrompt(task, samples[task] as never).schema)), task).toBeLessThanOrEqual(20)
})

test('add records in bulk: AI files them and finds facts, which join the Health Profile only after review', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  // The second record is an older report with a different vitamin D result.
  const older: AiOutput<'summarize-document'> = {
    ...ANSWERS['summarize-document'],
    document: { title: 'Blood test: vitamin D', kind: 'lab', date: '2026-03-10' },
    facts: [{ kind: 'lab', name: 'vitamin d (25-oh)', value: 12, unit: 'ng/mL', range: '30 - 100', evidence: 'Vitamin D 12 ng/mL' }],
  }
  const requests = await mockAi(page, { answer: (task, n) => (task === 'summarize-document' && n === 1 ? older : undefined) })
  await importBackup(page, injuriesBackup('Tennis elbow'))

  await page.goto('/injuries')
  await page.getByRole('link', { name: /Health Profile/ }).click()
  await expect(page.getByText('Your medical history in one place')).toBeVisible()
  await page.getByRole('link', { name: 'Add Records', exact: true }).click()

  await page.getByLabel('Record files').setInputFiles([pdf('scan_0001.pdf'), pdf('scan_0002.pdf')])
  await expect(page.getByText('2 Records')).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Added 2 records')).toBeVisible()

  await page.getByRole('button', { name: 'Read 2 Records with AI' }).click()
  await acceptConsent(page)
  // Filed under what's printed on them, not the file names
  await expect(page.getByRole('link', { name: /Blood test: vitamin D and CBC.*6 facts found.*1 Sept? 2026/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: /Blood test: vitamin D.*1 fact found.*10 Mar 2026/ })).toBeVisible({ timeout: 30_000 })
  expect(requests.map((r) => r.task)).toEqual(['summarize-document', 'summarize-document'])
  expect(requests[0].input).toMatchObject({ mimeType: 'application/pdf', title: 'scan 0001' })
  expect((await dumpDb(page)).facts).toHaveLength(0) // nothing saved before review

  // Review every record on one screen: each with its summary, flags worked out from the range or as the report marks them
  await page.getByRole('link', { name: /Review All 2 Records/ }).click()
  await expect(page.getByRole('heading', { name: 'Review 2 Records' })).toBeVisible()
  const newer = page.getByRole('region', { name: 'Blood test: vitamin D and CBC' })
  await expect(newer.getByText(ANSWERS['summarize-document'].summary)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Blood test: vitamin D', exact: true })).toBeVisible()
  const vitD = newer.locator('label', { hasText: 'Vitamin D (25-OH)' })
  await expect(vitD.getByText('18 ng/mL')).toBeVisible()
  await expect(vitD.getByText('Low', { exact: true })).toBeVisible()
  await expect(newer.locator('label', { hasText: 'Haemoglobin' }).getByText(/^(Low|High)$/)).toHaveCount(0)
  await expect(newer.locator('label', { hasText: 'Vitamin B12' }).getByText('Low', { exact: true })).toBeVisible()
  await expect(page.getByText('“Tab. Cholecalciferol 60K IU weekly x 8 wks”')).toBeVisible()
  await page.getByLabel('Keep Urine pus cells').uncheck()
  await expect(page.getByText('6 of 7 will be saved')).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved 6 facts to your Health Profile')).toBeVisible()

  // Every record's summary in one place
  await page.getByRole('link', { name: /Record Summaries/ }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
  await page.goBack()

  // The profile: grouped by kind, out-of-range results first, the same test matched across reports
  await expect(page.getByRole('heading', { name: 'To Review' })).toHaveCount(0)
  for (const h of ['Conditions', 'Medicines', 'Lab Results']) await expect(page.getByRole('heading', { name: h })).toBeVisible()
  await expect(page.getByRole('link', { name: /Lateral epicondylitis.*Right side/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Cholecalciferol 60,000 IU.*Once a week for 8 weeks/ })).toBeVisible()
  await expect(page.getByText('Urine pus cells')).toHaveCount(0)
  const labs = page.getByRole('link').filter({ hasText: /Vitamin D \(25-OH\)|Haemoglobin|Vitamin B12/ })
  await expect(labs).toHaveText([/Vitamin B12.*190 pg\/mL.*Low/, /Vitamin D \(25-OH\).*2 results.*18 ng\/mL.*Low/, /Haemoglobin.*14.2 g\/dL/])

  // One test over time
  await page.getByRole('link', { name: /Vitamin D \(25-OH\)/ }).click()
  await expect(page.getByRole('heading', { name: 'Vitamin D (25-OH)', level: 1 })).toBeVisible()
  await expect(page.getByRole('img', { name: /12 ng\/mL on 10 Mar 2026, 18 ng\/mL on 1 Sept? 2026/ })).toBeVisible()

  // Correct a fact: the flag follows the value when the range is simple
  await page.getByRole('link', { name: /^12 ng\/mL/ }).click()
  await page.getByLabel('Value').fill('32')
  await expect(page.getByRole('button', { name: 'In Range' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('“Vitamin D 12 ng/mL”')).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Fact updated')).toBeVisible()
  await expect(page.getByRole('link', { name: /^32 ng\/mL/ })).toBeVisible()

  // Delete and undo
  await page.getByRole('link', { name: /^32 ng\/mL/ }).click()
  await page.getByRole('button', { name: 'Delete Lab Result' }).click()
  await expect(page.getByRole('link', { name: /^32 ng\/mL/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('link', { name: /^32 ng\/mL/ })).toBeVisible()

  // The weekly summary and questions can use the confirmed history
  await page.goto('/insights')
  await page.getByRole('button', { name: 'Create Weekly Summary' }).click()
  await expect(page.getByText(ANSWERS['weekly-summary'].headline)).toBeVisible()
  const sent = JSON.stringify(requests.at(-1)!.input)
  expect(sent).toContain('Vitamin B12')
  expect(sent).toContain('Lateral epicondylitis')
  expect(sent).not.toContain('Urine pus cells')
})

test('one overview across all records: out of range, changes over time, questions — and it says when records changed', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  const requests = await mockAi(page)
  await seedDemo(page)
  await page.goto('/health')
  await page.getByRole('button', { name: 'Summarize My Health' }).click()
  await acceptConsent(page)
  const a = ANSWERS['health-summary']
  await expect(page.getByText(a.overview)).toBeVisible()
  for (const h of ['Needs Attention', 'Changes Over Time', 'Questions for Your Doctor']) await expect(page.getByRole('heading', { name: h })).toBeVisible()
  await expect(page.getByText(a.trends[0])).toBeVisible()

  // Sent: every result of each test in date order, and never the person's name
  const sent = requests.at(-1)!
  expect(sent.task).toBe('health-summary')
  const tests = (sent.input.context as { tests: { test: string; results: { result: string }[] }[] }).tests
  expect(tests.find((t) => t.test === 'Vitamin D (25-OH)')!.results.map((r) => r.result)).toEqual(['16 ng/mL', '34 ng/mL'])
  expect(JSON.stringify(sent.input)).not.toContain('Alex')

  await page.reload()
  await expect(page.getByText(a.overview)).toBeVisible()
  await expect(page.getByText('Your records have changed since this overview.')).toHaveCount(0)
  await page.getByRole('link', { name: /CRP/ }).click()
  await page.getByRole('link', { name: /^2.1 mg\/L/ }).click()
  await page.getByLabel('Value').fill('2.4')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.goto('/health')
  await expect(page.getByText('Your records have changed since this overview.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Update Overview' })).toBeVisible()
})

test('add a fact by hand; a record already read shows its facts and re-reading replaces them', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  await mockAi(page)
  await page.goto('/health/facts/new')
  await page.getByRole('button', { name: 'Allergy' }).click()
  await page.getByPlaceholder('e.g. Penicillin').fill('Penicillin')
  await page.getByPlaceholder('Reaction, if known').fill('Rash')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Allergy added')).toBeVisible()
  await expect(page.getByRole('link', { name: /Penicillin.*Rash/ })).toBeVisible()

  // A record added the usual way keeps its own details; its facts are offered for review.
  await page.goto('/documents/new')
  await page.getByLabel('Document file').setInputFiles({ name: 'report.png', mimeType: 'image/png', buffer: PNG })
  await page.getByPlaceholder('MRI left elbow').fill('June bloods')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Summarize with AI' }).click()
  await acceptConsent(page)
  await expect(page.getByRole('heading', { name: 'June bloods', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: /Review 6 Facts/ }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved 6 facts')).toBeVisible()

  await page.goto('/documents')
  await page.getByRole('link', { name: /June bloods/ }).click()
  await expect(page.getByRole('link', { name: /Health Profile.*6 facts saved from this record/ })).toBeVisible()
  await page.getByRole('button', { name: 'Remove Summary' }).click()
  await page.getByRole('button', { name: 'Summarize with AI' }).click()
  await page.getByRole('link', { name: /Review 6 Facts/ }).click()
  await expect(page.getByText('replacing the 6 saved from this record before')).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  const db = await dumpDb(page)
  expect(db.facts.filter((f) => !f.deletedAt)).toHaveLength(7) // 6 from the record (not 12) + the allergy
})

test('water: one-tap glasses on Today, undo, and a goal', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/')
  const water = page.getByTestId('water-today').first()
  await expect(water).toHaveText('0')
  await page.getByRole('button', { name: 'Log 250 ml of water' }).click()
  await page.getByRole('button', { name: 'Log 500 ml of water' }).click()
  await expect(water).toHaveText('750')
  await expect(page.getByText('500 ml water · 750 ml today')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(water).toHaveText('250')

  await page.goto('/nutrition')
  await page.getByLabel('Daily water goal (ml)').fill('2500')
  await page.getByLabel('Daily water goal (ml)').press('Enter')
  await expect(page.getByText('Daily water goal: 2,500 ml')).toBeVisible()
  await expect(page.getByText('of 2,500 ml')).toBeVisible()

  const db = await dumpDb(page)
  expect(db.water.filter((d) => !d.deletedAt).map((d) => d.amount)).toEqual([250])
  expect(db.profile[0].waterTarget).toBe(2500)
})
