import { expect, test } from '@playwright/test'
import { importBackup, injuriesBackup } from './helpers'

// This spec needs the real service worker.
test.use({ serviceWorkers: 'allow' })

test('works offline once installed: loads, logs, and keeps data', async ({ page, context }, info) => {
  test.skip(info.project.name === 'iphone-webkit', "Playwright's Windows WebKit port errors on offline service-worker reloads")
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/')
  // Wait until the service worker controls the page (precache done).
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }))
    }
  })

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Quick log' }).click()
  await page.getByRole('dialog').getByRole('radio', { name: '5', exact: true }).click()
  await expect(page.getByRole('link', { name: /^5 Pain Tennis elbow/ })).toBeVisible()

  // Deep links work offline too (SPA fallback from the precache).
  await page.goto('/rehab/library')
  await expect(page.getByRole('heading', { name: 'Exercise Library', level: 1 })).toBeVisible()

  await context.setOffline(false)
})
