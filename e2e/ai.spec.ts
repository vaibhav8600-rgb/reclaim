import { expect, test, type Page } from '@playwright/test'
import { ANSWERS, mockAi } from './fake-ai'
import { FakeDrive } from './fake-google'
import { dumpDb, importBackup, injuriesBackup, newDevice, PNG, rangeAverage, seedDemo } from './helpers'
import { IDS } from './fixtures/demo-data'

/** Accept the one-time AI consent sheet; the Google sign-in happens right after, from the same tap. */
async function acceptConsent(page: Page) {
  const sheet = page.getByRole('dialog', { name: 'Use AI in Reclaim?' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Turn On AI' }).click()
  await expect(sheet).toBeHidden()
}

test('weekly summary: consent, Google sign-in, the four-part answer, and it’s kept', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  const requests = await mockAi(page)
  await seedDemo(page)
  await page.goto('/insights')

  await page.getByRole('button', { name: 'Create Weekly Summary' }).click()
  await acceptConsent(page)
  await expect(page.getByText(ANSWERS['weekly-summary'].headline)).toBeVisible()
  for (const heading of ['What the data shows', 'Possible patterns', 'What the data can’t establish', 'To discuss with your clinician']) {
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  }
  await expect(page.getByText(/Not medical advice/)).toBeVisible()

  // What was sent: the log summary, authorised with the Google token — and never the person's name.
  expect(requests).toHaveLength(1)
  expect(requests[0].task).toBe('weekly-summary')
  expect(requests[0].authorization).toBe('Bearer fake-access-token')
  const sent = JSON.stringify(requests[0].input)
  expect(sent).toContain('Tennis elbow')
  expect(sent).not.toContain('Alex')

  await page.reload()
  await expect(page.getByText(ANSWERS['weekly-summary'].headline)).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('link', { name: new RegExp(ANSWERS['weekly-summary'].headline) })).toBeVisible()
})

test('choosing Not Now sends nothing', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  const requests = await mockAi(page)
  await seedDemo(page)
  await page.goto('/insights')
  await page.getByRole('button', { name: 'Create Weekly Summary' }).click()
  await page.getByRole('dialog', { name: 'Use AI in Reclaim?' }).getByRole('button', { name: 'Not Now' }).click()
  await expect(page.getByRole('dialog', { name: 'Use AI in Reclaim?' })).toBeHidden()
  expect(requests).toHaveLength(0)
})

test('ask a question and keep a short history', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  const requests = await mockAi(page)
  await seedDemo(page)
  await page.goto('/insights')
  const ask = page.getByRole('button', { name: 'Ask', exact: true })
  await expect(ask).toBeDisabled()
  await page.getByRole('button', { name: 'When is my pain worst during the day?' }).click()
  await ask.click()
  await acceptConsent(page)
  await expect(page.getByText(ANSWERS.ask.answer)).toBeVisible()
  expect(requests[0].input.question).toBe('When is my pain worst during the day?')

  await page.getByLabel('Your question').fill('Is my rehab helping?')
  await ask.click() // consent already given: no sheet this time
  await expect(page.getByText('“Is my rehab helping?”')).toBeVisible()
  await expect(page.getByText('Earlier questions (1)')).toBeVisible()
})

test('a note becomes reviewed entries — nothing saved until confirmed', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  const requests = await mockAi(page)
  await importBackup(page, injuriesBackup('Tennis elbow'))

  await page.goto('/log/note')
  const note = 'A bit stiff when I woke up. Elbow sore after 8 hours at the laptop, grip was 28 kg. 30 min walk.'
  await page.getByLabel('Note').fill(note)
  await page.getByRole('button', { name: 'Turn into Entries' }).click()
  await acceptConsent(page)

  await expect(page.getByRole('heading', { name: 'Review Entries' })).toBeVisible()
  expect(requests[0].task).toBe('structure-note')
  expect(requests[0].input).toMatchObject({ text: note, injuries: [{ id: 'inj-0', name: 'Tennis elbow' }] })

  const pain = page.getByRole('checkbox', { name: 'Include Pain · Tennis elbow' })
  const stiffness = page.getByRole('checkbox', { name: 'Include Stiffness' })
  const grip = page.getByRole('checkbox', { name: /Include Grip strength 28 kg/ })
  await expect(pain).toBeChecked()
  await expect(page.getByText('AI estimate — adjust if needed')).toBeVisible()
  await expect(stiffness).not.toBeChecked() // no intensity in the note → the user must choose
  await expect(page.getByText('“sore after 8 hours at the laptop”')).toBeVisible()
  await expect(page.getByText('30 min walk')).toBeVisible()

  // Nothing is saved yet
  expect((await dumpDb(page)).symptoms).toHaveLength(0)

  await page.getByRole('radio', { name: 'Choose Intensity 3' }).click()
  await expect(stiffness).toBeChecked()
  await grip.uncheck()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Added 2 entries')).toBeVisible()

  const db = await dumpDb(page)
  expect(db.symptoms.map((s) => [s.type, s.severity, s.source])).toEqual(expect.arrayContaining([['pain', 4, 'user_confirmed'], ['stiffness', 3, 'user_confirmed']]))
  expect(db.measurements).toHaveLength(0)
  expect(db.journal).toHaveLength(1) // the note itself was kept
  await expect(page.getByRole('link', { name: /Pain.*Tennis elbow · Desk work · From your note/ })).toBeVisible()
})

test('a document gets an AI summary, clearly labelled, that can be removed', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  const requests = await mockAi(page)
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/documents/new')
  await page.getByLabel('Document file').setInputFiles({ name: 'MRI.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Document added')).toBeVisible()

  await page.getByRole('button', { name: 'Summarize with AI' }).click()
  await acceptConsent(page)
  await expect(page.getByText('AI summary — check against the original')).toBeVisible()
  await expect(page.getByText(ANSWERS['summarize-document'].summary)).toBeVisible()
  await expect(page.getByText('Common extensor tendinopathy:')).toBeVisible()
  expect(requests[0]).toMatchObject({ task: 'summarize-document', input: { mimeType: 'image/jpeg', title: 'MRI' } })
  expect(String(requests[0].input.data).length).toBeGreaterThan(50)

  await page.reload()
  await expect(page.getByText(ANSWERS['summarize-document'].summary)).toBeVisible()
  await page.getByRole('button', { name: 'Remove Summary' }).click()
  await expect(page.getByRole('button', { name: 'Summarize with AI' })).toBeVisible()
})

test('clinician report: numbers from the log, optional AI summary, print-ready', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  await mockAi(page)
  await page.addInitScript(() => (window.print = () => ((window as unknown as { __printed: boolean }).__printed = true)))
  const now = Date.now()
  const demo = await seedDemo(page, now)
  await page.goto('/insights')
  await page.getByRole('link', { name: /Clinician Report/ }).click()
  await page.getByRole('button', { name: 'Tennis elbow', exact: true }).click()

  const report = page.locator('article')
  await expect(report.getByRole('heading', { name: 'Tennis elbow', level: 1 })).toBeVisible()
  const { avg, count } = rangeAverage(demo, IDS.elbow, 30, now)
  await expect(report.getByText(`${avg.toFixed(1)} (${count} logs)`)).toBeVisible()
  await expect(report.getByRole('heading', { name: 'Rehabilitation' })).toBeVisible()
  await expect(report.getByText(/Eccentric wrist extension/)).toBeVisible()
  await expect(report.getByText(/Alex ·/)).toBeVisible() // the name is on the report (it stays on the device)

  await page.getByRole('button', { name: 'Add AI Summary' }).click()
  await acceptConsent(page)
  await expect(report.getByText(ANSWERS['report-narrative'].summary)).toBeVisible()
  await expect(report.getByText(/Drafted by AI/)).toBeVisible()

  await page.getByRole('button', { name: 'Print or PDF' }).click()
  expect(await page.evaluate(() => (window as unknown as { __printed?: boolean }).__printed)).toBe(true)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('nav.tabbar')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Print or PDF' })).toBeHidden()
  await expect(report).toBeVisible()
})

test('server problems are explained, and Settings shows whether AI is set up', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  await mockAi(page, { configured: false, fail: { status: 503, error: 'AI isn’t set up on the server yet.' } })
  await seedDemo(page)
  await page.goto('/settings')
  await expect(page.getByText('Not set up', { exact: true }).last()).toBeVisible()
  await expect(page.getByText(/see docs\/AI_SETUP\.md/)).toBeVisible()

  await page.goto('/insights')
  await page.getByRole('button', { name: 'Create Weekly Summary' }).click()
  await acceptConsent(page)
  await expect(page.getByRole('alert')).toHaveText('AI isn’t set up on the server yet.')
})

test('AI can be switched off and on in Settings', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  await mockAi(page)
  await page.goto('/settings')
  const toggle = page.getByRole('switch', { name: 'AI Features' })
  await expect(toggle).not.toBeChecked()
  await page.getByText('AI Features').click()
  await acceptConsent(page)
  await expect(page.getByText('AI turned on')).toBeVisible()
  await expect(toggle).toBeChecked()
  await expect(page.getByText(/Ready · gemini-test/)).toBeVisible()
  await page.getByText('AI Features').click()
  await expect(toggle).not.toBeChecked()
})

test('streamed answers are read piece by piece and saved when complete', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  const requests = await mockAi(page, { stream: true })
  await seedDemo(page)
  await page.goto('/insights')
  await page.getByRole('button', { name: 'Create Weekly Summary' }).click()
  await acceptConsent(page)
  await expect(page.getByText(ANSWERS['weekly-summary'].headline)).toBeVisible()
  await expect(page.getByText(/Not medical advice/)).toBeVisible() // finished (not "Writing…")
  expect(requests[0].input).toBeTruthy()
  await page.reload()
  await expect(page.getByText(ANSWERS['weekly-summary'].headline)).toBeVisible() // saved
})
