import { expect, test, type Page } from '@playwright/test'
import { FakeDrive } from './fake-google'
import { connectDrive, importBackup, injuriesBackup, newDevice, PNG, syncNow } from './helpers'

const PASS = 'orange kite river 42'

async function addDocument(page: Page, file: { name: string; mimeType: string; buffer: Buffer }, title?: string) {
  await page.goto('/documents/new')
  const save = page.getByRole('button', { name: 'Save' })
  await expect(save).toBeDisabled() // no file yet
  await page.getByLabel('Document file').setInputFiles(file)
  if (title) await page.getByPlaceholder('MRI left elbow').fill(title)
  await save.click()
  await expect(page.getByText('Document added')).toBeVisible({ timeout: 30_000 })
}

const imageLoaded = (page: Page) =>
  expect.poll(() => page.locator('img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), { timeout: 30_000 }).toBe(1)

test('add a record, preview it, find it everywhere, edit, delete and undo', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/injuries')
  await page.getByRole('link', { name: /Medical Records/ }).click()
  await expect(page.getByText('Keep your records together')).toBeVisible()

  await page.getByRole('link', { name: 'Add Document', exact: true }).click()
  await page.getByLabel('Document file').setInputFiles({ name: 'MRI_left_elbow.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByPlaceholder('MRI left elbow')).toHaveValue('MRI left elbow') // title from the file name
  await expect(page.getByRole('button', { name: 'Scan / Imaging' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Tennis elbow' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByPlaceholder(/what the report says/).fill('Common extensor tendinopathy')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Document added')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'MRI left elbow', level: 1 })).toBeVisible()
  await imageLoaded(page)
  await expect(page.getByText('This iPhone only')).toBeVisible()
  await expect(page.getByText('Common extensor tendinopathy')).toBeVisible()

  // Everywhere it should appear
  await page.goto('/documents')
  await expect(page.getByRole('link', { name: /MRI left elbow.*Scan \/ Imaging.*Tennis elbow/ })).toBeVisible()
  await page.goto('/injuries/inj-0')
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible()
  await expect(page.getByRole('link', { name: /MRI left elbow/ }).first()).toBeVisible() // under Documents (and Recent)
  await page.goto('/timeline')
  await page.getByRole('button', { name: 'Records' }).click()
  await expect(page.getByRole('link', { name: /MRI left elbow/ })).toBeVisible()

  // Edit
  await page.getByRole('link', { name: /MRI left elbow/ }).click()
  await page.getByRole('link', { name: 'Edit document' }).click()
  await page.getByPlaceholder('MRI left elbow').fill('MRI right elbow')
  await page.getByRole('button', { name: 'Lab Report' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'MRI right elbow', level: 1 })).toBeVisible()
  await expect(page.getByText('Lab Report ·')).toBeVisible()

  // Delete and undo
  await page.getByRole('button', { name: 'Delete Document' }).click()
  await expect(page.getByText('Document deleted')).toBeVisible()
  await expect(page.getByText('Keep your records together')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('link', { name: /MRI right elbow/ })).toBeVisible()
  await page.getByRole('link', { name: /MRI right elbow/ }).click()
  await imageLoaded(page) // the file survived the undo
})

test('files over 25 MB are refused with a clear message', async ({ page }) => {
  await page.goto('/documents/new')
  await page.getByLabel('Document file').setInputFiles({ name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(26 * 1024 * 1024) })
  await expect(page.getByText(/The limit is 25\.0 MB/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
})

test('records sync encrypted, open on another device, and deleting removes them from Drive', async ({ browser }, info) => {
  test.slow() // two devices, each deriving the passphrase key (600k PBKDF2 rounds): slow when tests run in parallel
  const drive = new FakeDrive()
  const phone = await newDevice(browser, info, drive)
  await importBackup(phone, injuriesBackup('Tennis elbow'))
  await connectDrive(phone, PASS)

  await addDocument(phone, { name: 'xray.png', mimeType: 'image/png', buffer: PNG }, 'Elbow X-ray')
  // A larger PDF exercises the resumable upload path (> 5 MB).
  const MARKER = 'Patient: Alex. Findings: common extensor tendinopathy.'
  const bigPdf = Buffer.concat([Buffer.from(`%PDF-1.4\n${MARKER}\n`), Buffer.alloc(6 * 1024 * 1024, 32), Buffer.from('\n%%EOF')])
  await addDocument(phone, { name: 'physio-report.pdf', mimeType: 'application/pdf', buffer: bigPdf }, 'Physio report')
  await syncNow(phone)

  const docs = drive.documents()
  expect(docs).toHaveLength(2)
  for (const d of docs) {
    expect(d.body.subarray(0, 4).toString()).toBe('RCL1')
    // Neither file is readable in Drive. (Whole-content checks: short byte runs occur by chance in ciphertext.)
    expect(d.body.includes(PNG)).toBe(false)
    expect(d.body.includes(MARKER)).toBe(false)
  }
  await phone.goto('/documents')
  await phone.getByRole('link', { name: /Elbow X-ray/ }).click()
  await expect(phone.getByText('Encrypted in Drive')).toBeVisible()

  // Another device: the record arrives with the sync, and the file downloads and decrypts on open.
  const laptop = await newDevice(browser, info, drive)
  await connectDrive(laptop, PASS, { existing: true })
  await laptop.goto('/documents')
  await laptop.getByRole('link', { name: /Elbow X-ray/ }).click()
  await imageLoaded(laptop)

  // Deleting on the phone removes the encrypted copy from Drive at the next sync.
  await phone.goto('/documents')
  await phone.getByRole('link', { name: /Elbow X-ray/ }).click()
  await phone.getByRole('button', { name: 'Delete Document' }).click()
  await syncNow(phone)
  expect(drive.documents()).toHaveLength(1)
  await syncNow(laptop)
  await laptop.goto('/documents')
  await expect(laptop.getByRole('link', { name: /Elbow X-ray/ })).toHaveCount(0)
  await expect(laptop.getByRole('link', { name: /Physio report/ })).toBeVisible()
})
