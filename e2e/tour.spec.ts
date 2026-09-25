import { expect, test } from '@playwright/test'
import { IDS } from './fixtures/demo-data'
import { seedDemo } from './helpers'

/**
 * A screenshot tour of every main screen with realistic data, in light and dark.
 * Images are attached to the HTML report (npx playwright show-report) for design review.
 */
const screens: [name: string, path: string, heading: string, fullPage?: false][] = [
  ['today', '/', 'Today'],
  ['rehab', '/rehab', 'Rehab'],
  ['session', '/rehab/session', 'Rehab Session'],
  ['library', '/rehab/library', 'Exercise Library', false],
  ['exercise', '/rehab/exercises/ex-wrist-ext-ecc', 'Eccentric wrist extension'],
  ['timeline', '/timeline', 'Timeline', false], // months of history: too tall for a full-page capture
  ['injuries', '/injuries', 'Injuries'],
  ['injury', `/injuries/${IDS.elbow}`, 'Tennis elbow'],
  ['symptom-form', '/log/symptom', 'Log Symptom'],
  ['nutrition', '/nutrition', 'Nutrition'],
  ['goals', '/goals', 'Goals'],
  ['my-food', '/nutrition/foods/new', 'New Food'],
  ['apple-health', '/settings/health', 'Apple Health'],
  ['safety', '/safety', 'Warning Signs'],
  ['weight', '/weight', 'Weight'],
  ['sleep-form', '/log/sleep', 'Sleep'],
  ['steps-form', '/log/steps', 'Steps & Activity'],
  ['welcome', '/welcome', 'Welcome'],
  ['meal-form', '/log/meal', 'Meal'],
  ['health', '/health', 'Health Profile'],
  ['lab', `/health/lab?name=${encodeURIComponent('Vitamin D (25-OH)')}`, 'Vitamin D (25-OH)'],
  ['fact-form', '/health/facts/new?kind=lab', 'Add a Fact'],
  ['add-records', '/documents/import', 'Add Records'],
  ['records', '/documents', 'Medical Records'],
  ['add-document', '/documents/new', 'Add Document'],
  ['drive-connect', '/settings/drive', 'Google Drive'],
  ['settings', '/settings', 'Settings'],
]

for (const scheme of ['light', 'dark'] as const) {
  test(`screenshot tour (${scheme})`, async ({ page }, info) => {
    test.skip(info.project.name !== 'iphone-webkit', 'one engine is enough for screenshots')
    await seedDemo(page)
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    for (const [name, route, heading, fullPage = true] of screens) {
      await page.goto(route)
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible()
      await page.waitForTimeout(250)
      const path = info.outputPath(`${scheme}-${name}.png`)
      await page.screenshot({ path, fullPage })
      await info.attach(`${scheme}-${name}`, { path, contentType: 'image/png' })
    }
    // The food picker: search, then a portion
    await page.goto('/log/meal')
    await page.getByRole('button', { name: 'Search Foods' }).click()
    await page.getByLabel('Search foods').fill('dal')
    await page.waitForTimeout(250)
    await page.screenshot({ path: info.outputPath(`${scheme}-food-search.png`) })
    await info.attach(`${scheme}-food-search`, { path: info.outputPath(`${scheme}-food-search.png`), contentType: 'image/png' })
    await page.getByRole('button', { name: /^Dal, toor/ }).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: info.outputPath(`${scheme}-food-portion.png`) })
    await info.attach(`${scheme}-food-portion`, { path: info.outputPath(`${scheme}-food-portion.png`), contentType: 'image/png' })

    await page.goto('/')
    await page.getByRole('button', { name: 'Quick log' }).click()
    await expect(page.getByRole('dialog', { name: 'Quick log' })).toBeVisible()
    await page.waitForTimeout(400)
    const path = info.outputPath(`${scheme}-quick-log.png`)
    await page.screenshot({ path })
    await info.attach(`${scheme}-quick-log`, { path, contentType: 'image/png' })
  })
}

/** The AI screens with realistic (canned) answers, for design review. */
for (const scheme of ['light', 'dark'] as const) {
  test(`AI screens tour (${scheme})`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'iphone-webkit', 'one engine is enough for screenshots')
    const { FakeDrive } = await import('./fake-google')
    const { mockAi } = await import('./fake-ai')
    const { newDevice, PNG } = await import('./helpers')
    const page = await newDevice(browser, info, new FakeDrive())
    await mockAi(page)
    await seedDemo(page)
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    const shot = async (name: string, fullPage = true) => {
      await page.waitForTimeout(300)
      const path = info.outputPath(`${scheme}-${name}.png`)
      await page.screenshot({ path, fullPage })
      await info.attach(`${scheme}-${name}`, { path, contentType: 'image/png' })
    }
    const consent = async () => {
      const sheet = page.getByRole('dialog', { name: 'Use AI in Reclaim?' })
      if (await sheet.isVisible().catch(() => false)) await sheet.getByRole('button', { name: 'Turn On AI' }).click()
    }

    await page.goto('/insights')
    await page.getByRole('button', { name: 'Create Weekly Summary' }).click()
    await expect(page.getByRole('dialog', { name: 'Use AI in Reclaim?' })).toBeVisible()
    await shot('ai-consent', false)
    await consent()
    await page.getByRole('button', { name: 'Is my rehab helping?' }).click()
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    await expect(page.getByText('“Is my rehab helping?”')).toBeVisible()
    await shot('ai-insights')

    await page.goto('/')
    await shot('ai-today')

    await page.goto('/log/note')
    await page.getByLabel('Note').fill('A bit stiff when I woke up. Elbow sore after 8 hours at the laptop, grip was 28 kg. 30 min walk.')
    await page.getByRole('button', { name: 'Turn into Entries' }).click()
    await expect(page.getByRole('heading', { name: 'Review Entries' })).toBeVisible()
    await shot('ai-review')

    await page.goto('/documents/new')
    await page.getByLabel('Document file').setInputFiles({ name: 'MRI_right_elbow.png', mimeType: 'image/png', buffer: PNG })
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('button', { name: 'Summarize with AI' }).click()
    await expect(page.getByText('AI summary — check against the original')).toBeVisible()
    await shot('ai-document')
    await page.getByRole('link', { name: /Review 6 Facts/ }).click()
    await expect(page.getByRole('heading', { name: 'Review Facts' })).toBeVisible()
    await shot('ai-facts-review')
    await page.goto('/health/summaries')
    await expect(page.getByRole('heading', { name: 'Record Summaries' })).toBeVisible()
    await shot('ai-summaries')

    await page.goto('/health')
    await page.getByRole('button', { name: 'Summarize My Health' }).click()
    await expect(page.getByRole('heading', { name: 'Needs Attention' })).toBeVisible()
    await shot('ai-health-overview')

    await page.goto('/plan')
    await page.getByRole('button', { name: 'Create My Plan' }).click()
    await expect(page.getByRole('heading', { name: 'Daily Targets' })).toBeVisible()
    await shot('ai-plan')

    await page.goto('/report?injury=demo-injury-elbow')
    await page.getByRole('button', { name: 'Add AI Summary' }).click()
    await expect(page.getByText(/Drafted by AI/)).toBeVisible()
    await shot('ai-report')

    await page.goto('/settings')
    await shot('ai-settings')
  })
}
