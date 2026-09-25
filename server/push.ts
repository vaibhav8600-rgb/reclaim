import webpush from 'web-push'
import { authFromEnv, authorize, json, type AuthDeps } from './auth.ts'

/**
 * Daily reminders by Web Push.
 *
 * POST /api/push   { action: 'subscribe', subscription } | { action: 'unsubscribe', endpoint } | { action: 'test', endpoint }
 *                  — the app's owner (the same Google sign-in and allowlist as AI).
 * GET  /api/push   — Vercel Cron, once a day (vercel.json), with `Authorization: Bearer $CRON_SECRET`: wakes every device.
 *
 * The push carries no health data, only { kind }. The phone works out what to remind about from its own data
 * (public/push-sw.js). Subscriptions are kept in Upstash Redis (free tier), keyed by endpoint.
 */

export interface PushSubscriptionJson {
  endpoint: string
  keys: { p256dh: string; auth: string }
}
export interface Stored {
  email: string
  sub: PushSubscriptionJson
}
export interface SubStore {
  save(s: Stored): Promise<void>
  remove(endpoint: string): Promise<void>
  all(): Promise<Stored[]>
}
export type Send = (sub: PushSubscriptionJson, payload: string) => Promise<'sent' | 'gone'>

export interface PushDeps {
  auth: AuthDeps
  store?: SubStore
  send?: Send
  cronSecret?: string
}

const MAX_DEVICES = 10
/** The push services browsers use; anything else is refused, so the server never posts to arbitrary URLs. */
const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/]

export function validSubscription(s: unknown): s is PushSubscriptionJson {
  const sub = s as PushSubscriptionJson
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1000 || typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') return false
  try {
    const url = new URL(sub.endpoint)
    return url.protocol === 'https:' && PUSH_HOSTS.some((h) => h.test(url.hostname))
  } catch {
    return false
  }
}

export async function handlePush(req: Request, deps: PushDeps): Promise<Response> {
  if (!deps.store || !deps.send) return json(503, { error: 'Reminders aren’t set up on the server yet (see docs/PUSH_SETUP.md).' })

  // The daily run, from Vercel Cron
  if (req.method === 'GET') {
    if (!deps.cronSecret || req.headers.get('authorization') !== `Bearer ${deps.cronSecret}`) return json(401, { error: 'Not allowed.' })
    let sent = 0
    let removed = 0
    for (const s of await deps.store.all()) {
      const result = await deps.send(s.sub, JSON.stringify({ kind: 'daily' })).catch(() => 'failed' as const)
      if (result === 'gone') {
        await deps.store.remove(s.sub.endpoint)
        removed++
      } else if (result === 'sent') sent++
    }
    return json(200, { sent, removed })
  }
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' })

  const who = await authorize(req, deps.auth, 'reminders')
  if (who instanceof Response) return who
  const raw = await req.text()
  if (raw.length > 4000) return json(413, { error: 'Too large.' })
  let body: { action?: string; subscription?: unknown; endpoint?: string }
  try {
    body = JSON.parse(raw)
  } catch {
    return json(400, { error: 'Invalid request.' })
  }
  const mine = (await deps.store.all()).filter((s) => s.email === who.email)

  switch (body.action) {
    case 'subscribe': {
      if (!validSubscription(body.subscription)) return json(400, { error: 'That isn’t a push subscription this server accepts.' })
      const known = mine.some((s) => s.sub.endpoint === (body.subscription as PushSubscriptionJson).endpoint)
      if (!known && mine.length >= MAX_DEVICES) return json(429, { error: `Reminders are already on for ${MAX_DEVICES} devices. Turn them off on one first.` })
      await deps.store.save({ email: who.email, sub: body.subscription })
      return json(200, { ok: true })
    }
    case 'unsubscribe': {
      const own = mine.find((s) => s.sub.endpoint === body.endpoint)
      if (own) await deps.store.remove(own.sub.endpoint)
      return json(200, { ok: true })
    }
    case 'test': {
      const own = mine.find((s) => s.sub.endpoint === body.endpoint)
      if (!own) return json(404, { error: 'Reminders aren’t on for this device yet.' })
      const result = await deps.send(own.sub, JSON.stringify({ kind: 'test' })).catch((e: Error) => e)
      if (result === 'gone') {
        await deps.store.remove(own.sub.endpoint)
        return json(410, { error: 'This device’s subscription has expired. Turn reminders off and on again.' })
      }
      if (result instanceof Error) return json(502, { error: 'The push service didn’t accept the reminder. Try again.' })
      return json(200, { ok: true })
    }
    default:
      return json(400, { error: 'Unknown action.' })
  }
}

/** Upstash Redis over its REST API (no client library): one hash, endpoint → { email, sub }. */
export function redisStore(url: string, token: string, key = 'reclaim:push'): SubStore {
  const cmd = async (...args: string[]) => {
    const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(args) })
    if (!r.ok) throw new Error(`Redis ${r.status}`)
    return ((await r.json()) as { result: unknown }).result
  }
  return {
    async save(s) {
      await cmd('HSET', key, s.sub.endpoint, JSON.stringify(s))
    },
    async remove(endpoint) {
      await cmd('HDEL', key, endpoint)
    },
    async all() {
      const flat = ((await cmd('HGETALL', key)) as string[] | null) ?? []
      return flat.flatMap((v, i) => (i % 2 ? [JSON.parse(v) as Stored] : []))
    },
  }
}

/** Real dependencies from the environment. Upstash's Vercel integration names its variables KV_REST_API_*. */
export function pushFromEnv(env: Record<string, string | undefined>): PushDeps {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN
  const publicKey = env.VITE_VAPID_PUBLIC_KEY
  const privateKey = env.VAPID_PRIVATE_KEY
  const ready = url && token && publicKey && privateKey
  if (ready) webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:reclaim@example.com', publicKey, privateKey)
  return {
    auth: authFromEnv(env),
    store: ready ? redisStore(url, token) : undefined,
    send: ready
      ? async (sub, payload) => {
          try {
            await webpush.sendNotification(sub, payload, { TTL: 12 * 3600, urgency: 'normal' })
            return 'sent'
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode
            if (status === 404 || status === 410) return 'gone' // unsubscribed or expired
            throw e
          }
        }
      : undefined,
    cronSecret: env.CRON_SECRET,
  }
}
