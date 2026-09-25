/**
 * Daily reminders: the /api/push handler in Node (access, subscriptions, the daily run), the service worker's choice
 * of what to remind about, and the settings screen.
 */
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { handlePush, validSubscription, type PushDeps, type Stored } from '../server/push'

const CLIENT = 'client-123.apps.googleusercontent.com'
const OWNER = 'alex@example.com'
const apple = (n: number) => ({ endpoint: `https://web.push.apple.com/QZ${n}`, keys: { p256dh: 'p', auth: 'a' } })

function setup() {
  const rows = new Map<string, Stored>()
  const sent: { endpoint: string; payload: string }[] = []
  const gone = new Set<string>()
  const deps: PushDeps = {
    auth: {
      clientId: CLIENT,
      allowedEmails: [OWNER],
      verifyToken: async (t) => (t === 'good' ? { aud: CLIENT, email: OWNER, email_verified: 'true' } : t === 'stranger' ? { aud: CLIENT, email: 'x@else.com', email_verified: 'true' } : undefined),
      verified: new Map(),
    },
    store: { save: async (s) => void rows.set(s.sub.endpoint, s), remove: async (e) => void rows.delete(e), all: async () => [...rows.values()] },
    send: async (sub, payload) => (gone.has(sub.endpoint) ? 'gone' : (sent.push({ endpoint: sub.endpoint, payload }), 'sent')),
    cronSecret: 'cron-secret',
  }
  const post = (body: unknown, token = 'good') => handlePush(new Request('http://x/api/push', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }), deps)
  const cron = (secret?: string) => handlePush(new Request('http://x/api/push', { headers: secret ? { authorization: `Bearer ${secret}` } : {} }), deps)
  return { deps, rows, sent, gone, post, cron }
}

test.describe('server', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Node-only tests; run once')

  test('only the owner can turn reminders on, and only for real push services', async () => {
    const { post, rows } = setup()
    expect((await post({ action: 'subscribe', subscription: apple(1) }, 'nobody')).status).toBe(401)
    expect((await post({ action: 'subscribe', subscription: apple(1) }, 'stranger')).status).toBe(403)
    // The server posts to the endpoint, so only known push services are accepted.
    for (const endpoint of ['http://web.push.apple.com/x', 'https://169.254.169.254/latest', 'https://evil.example/web.push.apple.com', 'https://push.apple.com.evil.example/x']) {
      expect(validSubscription({ endpoint, keys: { p256dh: 'p', auth: 'a' } }), endpoint).toBe(false)
    }
    expect(validSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } })).toBe(true)
    expect((await post({ action: 'subscribe', subscription: { endpoint: 'https://evil.example/x', keys: { p256dh: 'p', auth: 'a' } } })).status).toBe(400)

    expect((await post({ action: 'subscribe', subscription: apple(1) })).status).toBe(200)
    expect((await post({ action: 'subscribe', subscription: apple(1) })).status).toBe(200) // the same device again: no duplicate
    expect([...rows.values()]).toEqual([{ email: OWNER, sub: apple(1) }])
    for (let n = 2; n <= 10; n++) await post({ action: 'subscribe', subscription: apple(n) })
    expect((await post({ action: 'subscribe', subscription: apple(11) })).status).toBe(429) // at most 10 devices
  })

  test('a test reminder goes to this device; unsubscribing removes it', async () => {
    const { post, sent, rows } = setup()
    await post({ action: 'subscribe', subscription: apple(1) })
    expect((await post({ action: 'test', endpoint: apple(1).endpoint })).status).toBe(200)
    expect(sent).toEqual([{ endpoint: apple(1).endpoint, payload: '{"kind":"test"}' }])
    expect((await post({ action: 'test', endpoint: apple(9).endpoint })).status).toBe(404)
    await post({ action: 'unsubscribe', endpoint: apple(1).endpoint })
    expect(rows.size).toBe(0)
  })

  test('the daily run needs the cron secret, carries no health data, and drops expired devices', async () => {
    const { post, cron, sent, gone, rows, deps } = setup()
    await post({ action: 'subscribe', subscription: apple(1) })
    await post({ action: 'subscribe', subscription: apple(2) })
    expect((await cron()).status).toBe(401)
    expect((await cron('wrong')).status).toBe(401)
    gone.add(apple(2).endpoint)
    const r = await cron('cron-secret')
    expect(await r.json()).toEqual({ sent: 1, removed: 1 })
    expect(sent).toEqual([{ endpoint: apple(1).endpoint, payload: '{"kind":"daily"}' }])
    expect([...rows.keys()]).toEqual([apple(1).endpoint])
    expect((await cron('x')).status).toBe(401)
    expect((await handlePush(new Request('http://x/api/push'), { ...deps, cronSecret: undefined })).status).toBe(401) // no secret set: never runs
    expect((await handlePush(new Request('http://x/api/push'), { auth: deps.auth })).status).toBe(503) // not set up
  })
})

test('the reminder is worked out on the phone: what’s left today, at most two things', () => {
  test.skip(test.info().project.name !== 'iphone-chromium', 'pure logic; run once')
  const self: Record<string, unknown> = { addEventListener: () => undefined }
  new Function('self', readFileSync('public/push-sw.js', 'utf8'))(self)
  const remind = self.reclaimReminder as (data: object, now: number) => { title: string; body: string; url: string }
  const now = new Date(2026, 8, 25, 20).getTime()
  const at = (daysAgo: number, hour: number) => new Date(2026, 8, 25 - daysAgo, hour).getTime()
  const injury = { id: 'i', status: 'active' }
  const plan = { id: 'p', active: true }

  const all = remind({ injuries: [injury], prescriptions: [plan], sessions: [{ recordedAt: at(1, 19) }], checkins: [], activity: [] }, now)
  expect(all.body).toBe('How did it feel after yesterday’s rehab? One tap on Today. Today’s rehab exercises are waiting.')
  expect(all.url).toBe('/')

  const later = remind({ injuries: [injury], prescriptions: [plan], sessions: [{ recordedAt: at(1, 19), morningPain: 2 }, { recordedAt: at(0, 9) }], checkins: [], activity: [] }, now)
  expect(later).toMatchObject({ body: 'Your weekly check-in — about a minute. Add today’s steps: Steps → Get from Health → Paste.', url: '/checkin' })

  const done = remind({ injuries: [injury], prescriptions: [plan], sessions: [{ recordedAt: at(0, 9) }], checkins: [{ recordedAt: at(2, 9) }], activity: [{ date: '2026-09-25', steps: 6000 }] }, now)
  expect(done.body).toMatch(/^All done for today/)
  expect(remind({}, now).url).toBe('/log/steps') // a new install: steps are all there is to suggest
})

test('settings: reminders explain what they need when the server isn’t set up; the worker loads the script', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('link', { name: /Reminders/ }).click()
  await expect(page.getByTestId('reminders-blocked')).toBeVisible()
  const sw = await page.request.get('/sw.js')
  expect(await sw.text()).toContain('importScripts("push-sw.js")')
  expect((await page.request.get('/push-sw.js')).ok()).toBe(true)
})
