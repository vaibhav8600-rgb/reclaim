import { expect, test } from '@playwright/test'
import { FAKE_EMAIL, FakeDrive } from './fake-google'
import { canonical, connectDrive, dumpDb, importBackup, injuriesBackup, newDevice, seedDemo, syncNow, tab } from './helpers'

const PASS = 'orange kite river 42'

test('connecting creates an encrypted vault and uploads an encrypted first backup', async ({ browser }, info) => {
  const drive = new FakeDrive()
  const page = await newDevice(browser, info, drive)
  await importBackup(page, injuriesBackup('Tennis elbow'))

  await connectDrive(page, PASS)
  await expect(page.getByText(FAKE_EMAIL)).toBeVisible()
  await expect(page.getByText('Synced today', { exact: true })).toBeVisible()

  const [snapshot] = drive.snapshots()
  expect(drive.snapshots()).toHaveLength(1)
  expect(snapshot.body.subarray(0, 4).toString()).toBe('RCL1') // Reclaim encrypted container
  expect(snapshot.body.includes('Tennis elbow')).toBe(false) // Google only ever sees ciphertext
  expect(snapshot.appProperties.salt).toMatch(/^[A-Za-z0-9+/=]{20,}$/)
  expect(snapshot.appProperties.iterations).toBe('600000')
})

test('the passphrase must be confirmed and acknowledged before anything is uploaded', async ({ browser }, info) => {
  const drive = new FakeDrive()
  const page = await newDevice(browser, info, drive)
  await page.goto('/settings/drive')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  const go = page.getByRole('button', { name: 'Encrypt and Back Up' })
  await page.getByLabel('Passphrase', { exact: true }).fill('short')
  await page.getByLabel('Confirm passphrase').fill('short')
  await page.getByRole('checkbox').check()
  await expect(go).toBeDisabled() // under 8 characters
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS)
  await expect(page.getByText('Passphrases don’t match.')).toBeVisible()
  await expect(go).toBeDisabled()
  await page.getByLabel('Confirm passphrase').fill(PASS)
  await page.getByRole('checkbox').uncheck()
  await expect(go).toBeDisabled()
  expect(drive.snapshots()).toHaveLength(0)
})

test('a new device unlocks the backups with the passphrase and gets everything', async ({ browser }, info) => {
  const drive = new FakeDrive()
  const phone = await newDevice(browser, info, drive)
  await seedDemo(phone)
  await connectDrive(phone, PASS)
  const before = await dumpDb(phone)

  const laptop = await newDevice(browser, info, drive)
  await laptop.goto('/settings')
  await laptop.getByRole('link', { name: 'Connect Google Drive' }).click()
  await laptop.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(laptop.getByRole('heading', { name: 'Enter your passphrase' })).toBeVisible()
  await laptop.getByLabel('Passphrase', { exact: true }).fill('not my passphrase')
  await laptop.getByRole('button', { name: 'Unlock' }).click()
  await expect(laptop.getByText('That passphrase doesn’t unlock your backups. Try again.')).toBeVisible({ timeout: 60_000 })

  await laptop.getByLabel('Passphrase', { exact: true }).fill(PASS)
  await laptop.getByRole('button', { name: 'Unlock' }).click()
  await expect(laptop.getByText('Google Drive connected')).toBeVisible({ timeout: 90_000 })

  const after = await dumpDb(laptop)
  expect(canonical(after)).toBe(canonical(before))
  await tab(laptop, 'Injuries').click()
  await expect(laptop.getByRole('link', { name: /Tennis elbow/ })).toBeVisible()
})

test('two devices stay in sync: additions and deletions travel both ways', async ({ browser }, info) => {
  test.slow() // two devices, each deriving the passphrase key (600k PBKDF2 rounds): slow when tests run in parallel
  const drive = new FakeDrive()
  const phone = await newDevice(browser, info, drive)
  await importBackup(phone, injuriesBackup('Tennis elbow'))
  await connectDrive(phone, PASS)
  const laptop = await newDevice(browser, info, drive)
  await connectDrive(laptop, PASS, { existing: true })

  const addNote = async (page: typeof phone, text: string) => {
    await page.goto('/log/note')
    await page.getByLabel('Note').fill(text)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Note saved')).toBeVisible()
  }
  const notes = (page: typeof phone) => page.goto('/timeline').then(() => page.getByRole('link', { name: /^Note / }))

  await addNote(phone, 'Written on the phone')
  await syncNow(phone)
  await syncNow(laptop)
  await expect(await notes(laptop)).toHaveText([/Written on the phone/])

  await addNote(laptop, 'Written on the laptop')
  await syncNow(laptop)
  await syncNow(phone)
  await expect(await notes(phone)).toHaveCount(2)

  // Delete on the phone; the laptop loses it too.
  await (await notes(phone)).filter({ hasText: 'Written on the laptop' }).click()
  await phone.getByRole('button', { name: 'Delete Note' }).click()
  await expect(phone.getByText('Note deleted')).toBeVisible()
  await syncNow(phone)
  await syncNow(laptop)
  await expect(await notes(laptop)).toHaveText([/Written on the phone/])

  // Old snapshots are pruned (a background sync may briefly add one more before its own prune).
  await expect.poll(() => drive.snapshots().length, { timeout: 30_000 }).toBeLessThanOrEqual(10)
})

test('cancelling Google sign-in explains what happened', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  await page.addInitScript(() => ((window as unknown as { __denyGoogle: boolean }).__denyGoogle = true))
  await page.goto('/settings/drive')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(page.getByText('Sign-in was cancelled.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
})

test('if the Drive checkbox is left unticked, the app explains it and asks Google again with the consent screen', async ({ browser }, info) => {
  const drive = new FakeDrive()
  const page = await newDevice(browser, info, drive)
  await page.addInitScript(() => ((window as unknown as { __untickDriveOnce: boolean }).__untickDriveOnce = true))
  await page.goto('/settings/drive')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(page.getByText(/tick the box for Google Drive/)).toBeVisible()

  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(page.getByRole('heading', { name: 'Create a passphrase' })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __gisPrompts: string[] }).__gisPrompts)).toEqual(['', 'consent'])
})

test('sign out backs up first, clears this device, and restoring brings everything back', async ({ browser }, info) => {
  test.slow() // passphrase key derived twice
  const drive = new FakeDrive()
  const page = await newDevice(browser, info, drive)
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await connectDrive(page, PASS)
  // An edit made just before signing out must be in the backup too.
  await page.goto('/injuries/new')
  await page.getByPlaceholder('Left elbow pain').fill('Runner’s knee')
  await page.getByLabel('Body Region').selectOption('Knee')
  await page.getByRole('radio', { name: 'Right' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Injury added')).toBeVisible()

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Sign Out' }).click()
  await page.getByRole('button', { name: 'Back Up and Sign Out' }).click()
  await expect(page.getByText('What are you recovering from?')).toBeVisible({ timeout: 60_000 })
  expect((await dumpDb(page)).injuries ?? []).toHaveLength(0)

  await page.getByRole('link', { name: 'Restore from Google Drive' }).click()
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(page.getByRole('heading', { name: 'Enter your passphrase' })).toBeVisible()
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS)
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByText('Google Drive connected')).toBeVisible({ timeout: 90_000 })
  await page.goto('/injuries')
  await expect(page.getByRole('link', { name: /Tennis elbow/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Runner’s knee/ })).toBeVisible()
})

test('delete everything removes this device’s data and the Drive backups: a true fresh start', async ({ browser }, info) => {
  const drive = new FakeDrive()
  const page = await newDevice(browser, info, drive)
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await connectDrive(page, PASS)
  expect(drive.snapshots().length).toBeGreaterThan(0)

  await page.goto('/settings')
  await expect(page.getByText(/and your encrypted backups in Google Drive/)).toBeVisible()
  await page.getByPlaceholder('Type "DELETE"').fill('DELETE')
  await page.getByRole('button', { name: 'Delete Everything' }).click()
  await expect(page.getByText('What are you recovering from?')).toBeVisible({ timeout: 60_000 })
  expect(drive.snapshots()).toHaveLength(0)

  // Signing in again finds nothing to restore: it starts a new encrypted backup.
  await page.getByRole('link', { name: 'Restore from Google Drive' }).click()
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(page.getByRole('heading', { name: 'Create a passphrase' })).toBeVisible()

  // Once connected, the first screen no longer offers a restore (there's nothing to restore into).
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS)
  await page.getByLabel('Confirm passphrase').fill(PASS)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Encrypt and Back Up' }).click()
  await expect(page.getByText('Google Drive connected')).toBeVisible({ timeout: 90_000 })
  await page.goto('/')
  await expect(page.getByText('What are you recovering from?')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Restore from Google Drive' })).toHaveCount(0)
})

test('background sync uploads only when something changed; returning to the app just checks', async ({ browser }, info) => {
  test.slow()
  const drive = new FakeDrive()
  const page = await newDevice(browser, info, drive)
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await connectDrive(page, PASS)
  expect(drive.snapshots()).toHaveLength(1)

  // Coming back to the app with nothing new: no new snapshot.
  await tab(page, 'Today').click() // in-app navigation: the Google sign-in stays in memory
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.waitForTimeout(3000)
  expect(drive.snapshots()).toHaveLength(1)

  // An edit goes up by itself a few seconds later.
  await page.getByRole('button', { name: 'Quick log' }).click()
  await page.getByRole('dialog', { name: 'Quick log' }).getByRole('radio', { name: '3', exact: true }).click()
  await expect.poll(() => drive.snapshots().length, { timeout: 30_000 }).toBe(2)
})
