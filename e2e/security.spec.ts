import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { mockAi } from './fake-ai'
import { FakeDrive } from './fake-google'
import { connectDrive, newDevice, seedDemo } from './helpers'

/** The production security headers, exactly as vercel.json sends them. */
const headers: Record<string, string> = Object.fromEntries(
  (JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] }).headers
    .find((h) => h.source === '/(.*)')!
    .headers.map((h) => [h.key.toLowerCase(), h.value]),
)

test('every screen works under the production Content-Security-Policy', async ({ browser }, info) => {
  const drive = new FakeDrive()
  const page = await newDevice(browser, info, drive)
  await mockAi(page)
  // Serve the app's HTML with the production headers.
  await page.route(/localhost:\d+\/(?!api\/|assets\/|.*\.\w+$).*/, async (route) => {
    const r = await route.fetch()
    await route.fulfill({ response: r, headers: { ...r.headers(), ...headers } })
  })
  const violations: string[] = []
  await page.exposeFunction('__cspViolation', (v: string) => violations.push(v))
  await page.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __cspViolation: (v: string) => void }).__cspViolation(`${e.violatedDirective} ${e.blockedURI}`),
    ),
  )

  await seedDemo(page)
  await connectDrive(page, 'orange kite river 42') // Google sign-in script + Drive API under CSP
  for (const path of ['/', '/rehab', '/rehab/session', '/timeline', '/injuries', '/injuries/demo-injury-elbow', '/documents', '/insights', '/report', '/log/symptom', '/settings']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
  }
  expect(violations).toEqual([])
  const response = await page.goto('/')
  expect(response!.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
})

test('the production bundle contains no secrets', async () => {
  test.skip(test.info().project.name !== 'iphone-chromium', 'filesystem check; run once')
  const { readdirSync } = await import('node:fs')
  for (const f of readdirSync('dist/assets').filter((f) => f.endsWith('.js'))) {
    const js = readFileSync(`dist/assets/${f}`, 'utf8')
    expect(js, f).not.toMatch(/GOCSPX-[\w-]{10,}/) // OAuth client secret
    expect(js, f).not.toMatch(/AIza[\w-]{30,}/) // Google API key
  }
})

test('the AI function’s relative imports name their .ts file, so Vercel’s unbundled output loads in Node', () => {
  // Vercel converts api/ file by file (TypeScript 7) and rewrites "./x.ts" to "./x.js"; an extensionless import
  // stays extensionless and Node's ESM loader can't find it, so the function crashes with a bare 500.
  const files = ['api', 'server/ai', 'shared'].flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => `${dir}/${f}`))
  const bad = files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/from '(\.{1,2}\/[^']*)'/g)].filter((m) => !m[1].endsWith('.ts')).map((m) => `${f}: ${m[1]}`))
  expect(bad).toEqual([])
})
