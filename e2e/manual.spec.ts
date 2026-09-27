import { expect, test, type Page } from '@playwright/test'
import { IDS } from './fixtures/demo-data'
import { mockAi } from './fake-ai'
import { FakeDrive } from './fake-google'
import { importBackup, PNG, seedDemo } from './helpers'

/**
 * Screenshots for the user manual (docs/USER_MANUAL.md and the in-app User Manual), saved straight into public/help/.
 * Off by default; regenerate with:  MANUAL=1 npx playwright test manual --project=iphone-chromium
 */
const OUT = 'public/help'

test('user manual screenshots', async ({ browser }, info) => {
  test.skip(!process.env.MANUAL || info.project.name !== 'iphone-chromium', 'run with MANUAL=1 on iphone-chromium')
  test.setTimeout(1_200_000)
  const u = info.project.use
  const context = await browser.newContext({
    viewport: u.viewport, deviceScaleFactor: 2, isMobile: u.isMobile, hasTouch: u.hasTouch, userAgent: u.userAgent,
    baseURL: u.baseURL, timezoneId: u.timezoneId, locale: u.locale, reducedMotion: 'reduce', colorScheme: 'light', serviceWorkers: 'block',
  })
  await new FakeDrive().install(context)
  const page = await context.newPage()
  await mockAi(page)

  const shot = async (name: string, fullPage = false) => {
    if (fullPage) {
      // Charts draw as they scroll into view: scroll through once. The floating tab bar would land mid-page.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)) }
        scrollTo(0, 0)
      })
    }
    await page.waitForTimeout(350)
    await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 72, fullPage, animations: 'disabled', style: fullPage ? 'nav.tabbar, .animate-pop[role=status] { display: none !important }' : undefined })
  }
  const open = async (name: string, route: string, heading: string, fullPage = false) => {
    await page.goto(route)
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible()
    await shot(name, fullPage)
  }
  const consent = async (p: Page) => {
    const sheet = p.getByRole('dialog', { name: 'Use AI in Reclaim?' })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Turn On AI' }).click()
    await expect(sheet).toBeHidden()
  }

  // Getting started: the first screen, before any data
  await open('welcome', '/welcome', 'Welcome')
  await seedDemo(page)

  // Today
  await open('today', '/', 'Today', true)
  await page.getByRole('button', { name: 'Quick log' }).click()
  await expect(page.getByRole('dialog', { name: 'Quick log' })).toBeVisible()
  await shot('quick-log')

  // Logging
  await open('log-symptom', `/log/symptom?injury=${IDS.back}`, 'Log Symptom', true)
  await open('log-measurement', '/log/measurement', 'Measurement', true)
  await open('log-note', '/log/note', 'Note')
  await open('log-sleep', '/log/sleep', 'Sleep', true)
  await open('log-steps', '/log/steps', 'Steps & Activity', true)
  await open('log-meal', '/log/meal', 'Meal', true)
  await page.getByRole('button', { name: 'Search Foods' }).click()
  await page.getByLabel('Search foods').fill('dal')
  await shot('food-search')
  await page.getByRole('button', { name: /^Dal, toor/ }).click()
  await shot('food-portion')

  // Exercise tab
  await open('exercise', '/rehab', 'Exercise', true)
  await page.getByRole('button', { name: '+ Gentle full body (home)' }).click()
  await expect(page.getByRole('link', { name: 'Start Gentle full body (home)' })).toBeVisible()
  await open('library', '/rehab/library', 'Exercise Library')
  await open('exercise-rehab', '/rehab/exercises/ex-wrist-ext-ecc', 'Eccentric wrist extension', true)
  await page.goto('/rehab/library')
  await page.getByRole('button', { name: 'Strength', exact: true }).click()
  await shot('library-strength')
  await open('rehab-session', '/rehab/session', 'Rehab Session', true)
  await open('prescription-form', '/rehab/plan/new?exercise=ex-pro-sup', 'Add to Plan', true)
  await page.goto('/rehab')
  await page.getByRole('link', { name: 'Start Gentle full body (home)' }).click()
  await expect(page.getByRole('heading', { name: 'Gentle full body (home)' }).first()).toBeVisible()
  await shot('workout-session', true)
  await page.getByRole('button', { name: /set 1 done$/ }).first().click()
  await shot('rest-timer')
  await page.goto('/rehab')
  await page.getByRole('link', { name: 'Edit Gentle full body (home)' }).click()
  await shot('workout-editor', true)
  // A fitness exercise that loads an injury: the caution notes
  await page.goto('/rehab/library')
  await page.getByRole('button', { name: 'Strength', exact: true }).click()
  await page.getByRole('link', { name: /Push-up/ }).first().click()
  await shot('exercise-fitness', true)

  // Flare-up
  await page.goto('/rehab')
  await page.getByText('Having a Flare-Up?').click()
  await expect(page.getByTestId('flare-card')).toBeVisible()
  await page.getByTestId('flare-card').scrollIntoViewIfNeeded()
  await shot('flare-card')
  await page.getByRole('button', { name: 'It’s Settling — End Flare-Up' }).click()

  // Health tab
  await open('health-tab', '/injuries', 'Health', true)
  await open('injury-detail', `/injuries/${IDS.elbow}`, 'Tennis elbow', true)
  await open('injury-back', `/injuries/${IDS.back}`, 'Lower back stiffness', true)
  await open('injury-form', '/injuries/new', 'New Injury', true)
  await open('safety', '/safety', 'Warning Signs', true)
  await open('checkin', '/checkin', 'Weekly Check-in', true)
  // Three weekly check-ins, so the progress page has a story to show
  const week = (n: number) => Date.now() - n * 7 * 86_400_000
  const checkin = (n: number, pain: number, sit: number, walk: number, typing: number) => ({
    id: `manual-c${n}`, recordedAt: week(n), pain, enjoyment: pain - 1, generalActivity: pain, sitMinutes: sit, walkMinutes: walk, nightsWoken: Math.max(0, pain - 3),
    activities: [{ name: 'Sitting at work', score: 10 - pain }, { name: 'Typing', score: typing }], source: 'user', createdAt: week(n), updatedAt: week(n),
  })
  await importBackup(page, { app: 'reclaim', schemaVersion: 1, exportedAt: new Date().toISOString(), data: { checkins: [checkin(3, 7, 20, 20, 3), checkin(2, 6, 45, 45, 5), checkin(1, 4, 90, 45, 7)] } })
  await open('progress', '/progress', 'How You’re Doing', true)
  await open('health-profile', '/health', 'Health Profile', true)
  await open('lab', `/health/lab?name=${encodeURIComponent('Vitamin D (25-OH)')}`, 'Vitamin D (25-OH)')
  await open('fact-form', '/health/facts/new?kind=lab', 'Add a Fact')
  await open('records', '/documents', 'Medical Records', true)
  await open('add-records', '/documents/import', 'Add Records', true)
  await open('add-document', '/documents/new', 'Add Document', true)

  // Food and body
  await open('nutrition', '/nutrition', 'Nutrition', true)
  await open('goals', '/goals', 'Goals', true)
  await open('weight', '/weight', 'Weight', true)
  await open('my-food', '/nutrition/foods/new', 'New Food', true)

  // Insights, the week, the doctor report, the timeline
  await open('insights', '/insights', 'Insights', true)
  await open('week', '/week', 'Your Week', true)
  await open('report', `/report?injury=${IDS.elbow}`, 'Clinician Report', true)
  await open('timeline', '/timeline', 'Timeline')

  // Settings
  await open('settings', '/settings', 'Settings', true)
  await page.getByText('Export Everything').click()
  await shot('export')
  await open('apple-health', '/settings/health', 'Apple Health', true)
  await open('reminders', '/settings/reminders', 'Reminders', true)
  await open('drive', '/settings/drive', 'Google Drive', true)

  // AI (canned answers): consent, preview, and each AI feature
  await page.goto('/insights')
  await page.getByRole('button', { name: 'Create Weekly Summary' }).click()
  await expect(page.getByRole('dialog', { name: 'Use AI in Reclaim?' })).toBeVisible()
  await shot('ai-consent')
  await consent(page)
  await page.getByRole('button', { name: 'Is my rehab helping?' }).click()
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByText('“Is my rehab helping?”')).toBeVisible()
  await shot('ai-insights', true)

  await page.goto('/log/note')
  await page.getByLabel('Note').fill('A bit stiff when I woke up. Elbow sore after 8 hours at the laptop, grip was 28 kg. 30 min walk.')
  await page.getByRole('button', { name: 'Turn into Entries' }).click()
  await expect(page.getByRole('heading', { name: 'Review Entries' })).toBeVisible()
  await shot('ai-note-review', true)

  await page.goto('/documents/new')
  await page.getByLabel('Document file').setInputFiles({ name: 'MRI_right_elbow.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Summarize with AI' }).click()
  await expect(page.getByText('AI summary — check against the original')).toBeVisible()
  await shot('ai-document', true)
  await page.getByRole('link', { name: /Review 6 Facts/ }).click()
  await expect(page.getByRole('heading', { name: 'Review Facts' })).toBeVisible()
  await shot('ai-facts-review', true)

  await page.goto('/health')
  await page.getByRole('button', { name: 'Summarize My Health' }).click()
  await expect(page.getByRole('heading', { name: 'Needs Attention' })).toBeVisible()
  await shot('ai-health-overview', true)

  await page.goto('/plan')
  await page.getByRole('button', { name: 'Create My Plan' }).click()
  await expect(page.getByRole('heading', { name: 'Daily Targets' })).toBeVisible()
  await shot('ai-plan', true)

  await page.goto(`/report?injury=${IDS.elbow}`)
  await page.getByRole('button', { name: 'Add AI Summary' }).click()
  await expect(page.getByText(/Drafted by AI/)).toBeVisible()
  await shot('ai-report', true)

  // "Show What’s Sent First": the preview sheet before anything leaves the phone
  await page.goto('/settings')
  await page.getByText('Show What’s Sent First').click()
  await page.goto('/insights')
  await page.getByRole('button', { name: 'What changed since last month?' }).click()
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await shot('ai-preview')

  // Dark mode, once
  await page.emulateMedia({ colorScheme: 'dark' })
  await open('today-dark', '/', 'Today')
  await context.close()
})
