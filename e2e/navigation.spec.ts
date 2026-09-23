import { expect, test, type Page } from '@playwright/test'
import { importBackup, injuriesBackup, seedDemo, tab } from './helpers'

/** Resolve with every motion kind the page used while `action` ran. */
async function recordMotions(page: Page, action: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as { __motions: string[] }
    w.__motions = []
    new MutationObserver(() => {
      const m = document.documentElement.dataset.motion
      if (m) w.__motions.push(m)
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] })
  })
  await action()
  await page.waitForTimeout(600)
  return page.evaluate(() => (window as unknown as { __motions: string[] }).__motions)
}

test('tabs, push and back navigation', async ({ page }) => {
  await seedDemo(page)
  await page.goto('/')
  for (const [name, heading] of [['Rehab', 'Rehab'], ['Timeline', 'Timeline'], ['Injuries', 'Injuries'], ['Today', 'Today']] as const) {
    await tab(page, name).click()
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    await expect(tab(page, name)).toHaveClass(/text-accent/)
  }

  await tab(page, 'Injuries').click()
  await page.getByRole('link', { name: /Tennis elbow/ }).click()
  await expect(page.getByRole('heading', { name: 'Tennis elbow', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Injuries', level: 1 })).toBeVisible()

  await tab(page, 'Today').click()
  await page.getByRole('link', { name: 'Profile and settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
})

test('opening a screen directly still gives a way out', async ({ page }) => {
  await page.goto('/log/note')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()

  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
})

test('new screens start at the top; tapping the current tab scrolls up', async ({ page }) => {
  await seedDemo(page)
  await page.goto('/timeline')
  await expect(page.getByRole('button', { name: 'Show Older Entries' })).toBeAttached() // history loaded
  const scrollDown = (y: number) => page.evaluate((y) => (window.scrollTo(0, y), scrollY), y)
  await expect.poll(() => scrollDown(3000)).toBeGreaterThan(500)
  await page.getByRole('link', { name: /^Rehab Session/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Edit Session' })).toBeVisible()
  expect(await page.evaluate(() => scrollY)).toBe(0)
  await page.getByRole('button', { name: 'Cancel' }).click()

  await expect.poll(() => scrollDown(2000)).toBeGreaterThan(300)
  await tab(page, 'Timeline').click()
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
})

test('navigation uses iOS motion: push, pop, tab, sheet up and down', async ({ page }) => {
  const animated = await page.evaluate(() => 'startViewTransition' in document && !matchMedia('(prefers-reduced-motion: reduce)').matches)
  test.skip(!animated, 'View Transitions unavailable (or Reduce Motion on) in this project')
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/')

  expect(await recordMotions(page, () => tab(page, 'Injuries').click())).toContain('tab')
  expect(await recordMotions(page, () => page.getByRole('link', { name: /Tennis elbow/ }).click())).toContain('push')
  expect(await recordMotions(page, () => page.getByRole('link', { name: 'Edit injury' }).click())).toContain('sheet-up')
  expect(await recordMotions(page, () => page.getByRole('button', { name: 'Cancel' }).click())).toContain('sheet-down')
  expect(await recordMotions(page, () => page.getByRole('button', { name: 'Back', exact: true }).click())).toContain('pop')
  await expect(page.getByRole('heading', { name: 'Injuries', level: 1 })).toBeVisible()
})

test('Reduce Motion turns navigation animation off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/injuries')
  const motions = await recordMotions(page, () => page.getByRole('link', { name: /Tennis elbow/ }).click())
  expect(motions).toEqual([])
  await expect(page.getByRole('heading', { name: 'Tennis elbow', level: 1 })).toBeVisible()
})

test('dark mode renders with the dark palette', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toBe('rgb(0, 0, 0)')
})
