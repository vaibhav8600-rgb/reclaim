/*
 * Reclaim reminders, inside the service worker (loaded with importScripts).
 * The server's daily push carries no health data — only { kind }. What to remind about is worked out here, on the
 * phone, from the app's own IndexedDB: today's rehab, the morning-after check, the weekly check-in, today's steps.
 */

const DAY = 86400000
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const alive = (r) => !r.deletedAt

/** At most two things worth doing today, most useful first. Pure: tested from e2e/reminders.spec.ts. */
self.reclaimReminder = function (data, now) {
  const today = startOfDay(now)
  const yesterday = startOfDay(today - DAY / 2)
  const sessions = (data.sessions || []).filter(alive)
  const open = (data.injuries || []).filter((i) => alive(i) && i.status !== 'resolved')
  const items = []
  if (sessions.some((s) => s.recordedAt >= yesterday && s.recordedAt < today && s.morningPain === undefined)) {
    items.push({ text: 'How did it feel after yesterday’s rehab? One tap on Today.', url: '/' })
  }
  if ((data.prescriptions || []).some((p) => alive(p) && p.active) && !sessions.some((s) => s.recordedAt >= today)) {
    items.push({ text: 'Today’s rehab exercises are waiting.', url: '/rehab' })
  }
  const lastCheckIn = Math.max(0, ...(data.checkins || []).filter(alive).map((c) => c.recordedAt))
  if (open.length && lastCheckIn < now - 7 * DAY) items.push({ text: 'Your weekly check-in — about a minute.', url: '/checkin' })
  if (!(data.activity || []).some((a) => alive(a) && a.date === dayKey(now) && a.steps)) {
    items.push({ text: 'Add today’s steps: Steps → Get from Health → Paste.', url: '/log/steps' })
  }
  if (!items.length) return { title: 'Reclaim', body: 'All done for today. How’s the pain this evening? Two taps to log it.', url: '/' }
  return { title: 'Reclaim', body: items.slice(0, 2).map((i) => i.text).join(' '), url: items[0].url }
}

/** The app's tables, read straight from IndexedDB (Dexie stores each table as an object store of the same name). */
function readData() {
  return new Promise((resolve) => {
    const open = indexedDB.open('reclaim')
    open.onupgradeneeded = () => open.transaction.abort() // no data yet: don't create an empty database
    open.onerror = () => resolve({})
    open.onsuccess = () => {
      const db = open.result
      const names = ['injuries', 'prescriptions', 'sessions', 'checkins', 'activity'].filter((n) => db.objectStoreNames.contains(n))
      if (!names.length) { db.close(); return resolve({}) }
      const tx = db.transaction(names, 'readonly')
      const data = {}
      for (const n of names) tx.objectStore(n).getAll().onsuccess = (e) => { data[n] = e.target.result }
      tx.oncomplete = () => { db.close(); resolve(data) }
      tx.onerror = () => resolve(data)
    }
  })
}

self.addEventListener('push', (event) => {
  let kind = 'daily'
  try { kind = event.data?.json().kind || kind } catch { /* no payload */ }
  event.waitUntil((async () => {
    let r
    try { r = self.reclaimReminder(await readData(), Date.now()) } catch { r = { title: 'Reclaim', body: 'A minute for your recovery today?', url: '/' } }
    // iPhone requires every push to show a notification, so there always is one.
    await self.registration.showNotification(kind === 'test' ? 'Reclaim — reminders are on' : r.title, {
      body: kind === 'test' ? `This is what they look like. ${r.body}` : r.body,
      icon: '/pwa-192x192.png',
      tag: 'reclaim-daily',
      data: { url: r.url },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
    if (open) { await open.focus(); return open.navigate(url) }
    return self.clients.openWindow(url)
  })())
})
