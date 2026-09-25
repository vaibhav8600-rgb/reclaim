/**
 * Daily reminders (Web Push). The server stores this device's push subscription and sends a daily wake-up with no
 * health data; the service worker (public/push-sw.js) decides what to say from the data on the phone.
 */

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

async function call(token: string, body: object) {
  const r = await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Reminders request failed (${r.status}).`)
}

/** Call from a tap (iPhone only asks for permission inside one). */
export async function turnOnReminders(token: string) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(permission === 'denied' ? 'Notifications are off for Reclaim. Turn them on in iPhone Settings → Notifications → Reclaim.' : 'Reclaim wasn’t allowed to send notifications.')
  }
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(VAPID_PUBLIC_KEY!) }))
  try {
    await call(token, { action: 'subscribe', subscription: sub.toJSON() })
  } catch (e) {
    await sub.unsubscribe() // not stored on the server: don't leave a half-on subscription
    throw e
  }
  return sub
}

export async function turnOffReminders(token: string | undefined, sub: PushSubscription) {
  if (token) await call(token, { action: 'unsubscribe', endpoint: sub.endpoint }).catch(() => undefined) // the daily run also drops dead ones
  await sub.unsubscribe()
}

export const sendTestReminder = (token: string, sub: PushSubscription) => call(token, { action: 'test', endpoint: sub.endpoint })
