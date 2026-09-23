import type { Table } from 'dexie'
import { db, type Base } from './db'

/** crypto.randomUUID only exists in secure contexts; testing over LAN http needs the fallback. */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const alive = (r: Base) => !r.deletedAt

const listeners = new Set<() => void>()
/** Notified after every local edit (sync uses it to schedule a background sync). */
export function onLocalChange(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
const changed = () => listeners.forEach((fn) => fn())

type Input<T extends Base> = Omit<T, keyof Base> & { id?: string }

/** Create or update a record, maintaining timestamps. Returns the id. */
export async function save<T extends Base>(table: Table<T, string>, values: Input<T>): Promise<string> {
  const now = Date.now()
  const existing = values.id ? await table.get(values.id) : undefined
  const id = values.id ?? newId()
  const record = existing
    ? { ...existing, ...values, id, updatedAt: now }
    : { ...values, id, createdAt: now, updatedAt: now }
  await table.put(record as T)
  changed()
  return id
}

/** Soft delete: keep a tombstone so backups and sync know it was removed. */
export async function softDelete<T extends Base>(table: Table<T, string>, id: string) {
  const now = Date.now()
  const existing = await table.get(id)
  if (existing) await table.put({ ...existing, deletedAt: now, updatedAt: now })
  changed()
}

export async function restore<T extends Base>(table: Table<T, string>, id: string) {
  const existing = await table.get(id)
  if (existing) await table.put({ ...existing, deletedAt: undefined, updatedAt: Date.now() })
  changed()
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}
