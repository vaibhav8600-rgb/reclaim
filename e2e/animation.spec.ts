import { expect, test } from '@playwright/test'
import { STARTER_EXERCISES } from '../src/lib/exercises'
import { EXERCISE_GUIDES } from '../src/lib/guide'
import { importBackup, injuriesBackup } from './helpers'

test('every starter exercise has a vetted guide, and nothing else does', () => {
  expect(Object.keys(EXERCISE_GUIDES).sort()).toEqual(STARTER_EXERCISES.map((e) => e.id).sort())
})

test('an exercise shows a looping demonstration with a caption per phase, and can be paused', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/rehab/exercises/ex-wrist-ext-ecc')
  await expect(page.getByRole('img', { name: /How to do Eccentric wrist extension: .*Lower slowly on your own, 3–4 s/ })).toBeVisible()
  // The caption follows the movement through its phases.
  await expect(page.getByText('Lift with the other hand', { exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Lower slowly on your own, 3–4 s', { exact: true })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Pause how to do Eccentric wrist extension' }).click()
  const caption = await page.getByTestId('animation-caption').textContent()
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('animation-caption')).toHaveText(caption!)
  await expect(page.getByRole('button', { name: 'Play how to do Eccentric wrist extension' })).toBeVisible()
})

test('with Reduce Motion, the start and key positions are shown still, side by side', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/rehab/exercises/ex-glute-bridge')
  const stills = page.getByRole('img', { name: /How to do Glute bridge/ }).locator('figcaption')
  await expect(stills).toHaveText(['Lower slowly', 'Squeeze the glutes and lift the hips — hold 2 s'])
  await expect(page.getByRole('button', { name: /Pause how to do/ })).toHaveCount(0)
})

test('every starter exercise has a demonstration; custom exercises simply don’t', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone-chromium', 'the same drawing code in every engine; one is enough for the full sweep')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const e of STARTER_EXERCISES) {
    await page.goto(`/rehab/exercises/${e.id}`)
    await expect(page.getByRole('img', { name: `How to do ${e.name}`, exact: false }), e.id).toBeVisible()
  }
})

test('the session screen shows how to do an exercise on request', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/rehab/session')
  await page.getByLabel('Add Exercise').selectOption({ label: 'Calf raises' })
  await expect(page.getByRole('img', { name: /How to do Calf raises/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'How to' }).click()
  await expect(page.getByRole('img', { name: /How to do Calf raises/ })).toBeVisible()
})
