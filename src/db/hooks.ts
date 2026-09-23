import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Base, type Exercise, type Injury, type JournalEntry, type Meal, type Measurement, type MedicalDocument, type RehabSession, type Symptom } from './db'
import { alive, getMeta } from './repo'

export function useInjuries() {
  return useLiveQuery(async () => (await db.injuries.toArray()).filter(alive), [])
}

/** All injuries (including deleted) keyed by id, so old entries can still show their injury name. */
export function useInjuryMap() {
  return useLiveQuery(async () => new Map((await db.injuries.toArray()).map((i) => [i.id, i])), []) ?? new Map<string, Injury>()
}

export const isOpenInjury = (i: Injury) => i.status !== 'resolved'

export function useProfile() {
  return useLiveQuery(() => db.profile.get('me'), [])
}

export function useSymptomsSince(from: number, injuryId?: string, type = 'pain') {
  return useLiveQuery(
    async () =>
      (await db.symptoms.where('recordedAt').aboveOrEqual(from).toArray()).filter(
        (s) => alive(s) && s.type === type && (!injuryId || s.injuryId === injuryId),
      ),
    [from, injuryId, type],
  )
}

export function useMeta<T>(key: string) {
  return useLiveQuery(() => getMeta<T>(key), [key])
}

export function useExercises() {
  return useLiveQuery(async () => (await db.exercises.toArray()).filter(alive).sort((a, b) => a.name.localeCompare(b.name)), [])
}

/** All exercises (including deleted) keyed by id, so old sessions can still show names. */
export function useExerciseMap() {
  return useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e])), []) ?? new Map<string, Exercise>()
}

export function usePrescriptions() {
  return useLiveQuery(async () => (await db.prescriptions.toArray()).filter(alive), [])
}

/** Finished sessions since `from`, newest first. */
export function useSessions(from = 0) {
  return useLiveQuery(
    async () => (await db.sessions.where('recordedAt').aboveOrEqual(from).toArray()).filter(alive).sort((a, b) => b.recordedAt - a.recordedAt),
    [from],
  )
}

export type Entry =
  | { kind: 'symptom'; at: number; item: Symptom }
  | { kind: 'measurement'; at: number; item: Measurement }
  | { kind: 'note'; at: number; item: JournalEntry }
  | { kind: 'injury'; at: number; item: Injury }
  | { kind: 'session'; at: number; item: RehabSession }
  | { kind: 'document'; at: number; item: MedicalDocument }
  | { kind: 'meal'; at: number; item: Meal }

/**
 * The timeline is derived from the typed tables, never stored separately.
 * Newest first; `kind` filters before `limit` applies, so paging never hides matches.
 */
export function useEntries(opts: { from?: number; injuryId?: string; limit?: number; kind?: Entry['kind'] } = {}) {
  const { from = 0, injuryId, limit = 300, kind } = opts
  // Query once per filter; paging (limit) only slices the loaded list, so "Show Older" never re-reads the database.
  const all = useLiveQuery(async () => {
    const since = <T extends Base & { injuryId?: string }>(rows: T[]) =>
      rows.filter((r) => alive(r) && (!injuryId || r.injuryId === injuryId))
    const [symptoms, measurements, notes, injuries, sessions, documents, meals] = await Promise.all([
      db.symptoms.where('recordedAt').aboveOrEqual(from).toArray(),
      db.measurements.where('recordedAt').aboveOrEqual(from).toArray(),
      injuryId ? Promise.resolve([] as JournalEntry[]) : db.journal.where('recordedAt').aboveOrEqual(from).toArray(),
      db.injuries.toArray(),
      db.sessions.where('recordedAt').aboveOrEqual(from).toArray(),
      db.documents.toArray(),
      injuryId ? Promise.resolve([] as Meal[]) : db.meals.where('recordedAt').aboveOrEqual(from).toArray(),
    ])
    const entries: Entry[] = [
      ...since(symptoms).map((item) => ({ kind: 'symptom' as const, at: item.recordedAt, item })),
      ...since(measurements).map((item) => ({ kind: 'measurement' as const, at: item.recordedAt, item })),
      ...notes.filter(alive).map((item) => ({ kind: 'note' as const, at: item.recordedAt, item })),
      ...meals.filter(alive).map((item) => ({ kind: 'meal' as const, at: item.recordedAt, item })),
      ...since(sessions).map((item) => ({ kind: 'session' as const, at: item.recordedAt, item })),
      ...since(documents)
        .map((item) => ({ kind: 'document' as const, at: new Date(item.date + 'T12:00').getTime(), item }))
        .filter((e) => e.at >= from),
      ...injuries
        .filter((i) => alive(i) && (!injuryId || i.id === injuryId))
        .map((item) => ({ kind: 'injury' as const, at: new Date(item.startDate + 'T09:00').getTime(), item }))
        .filter((e) => e.at >= from),
    ]
    const matching = kind ? entries.filter((e) => e.kind === kind) : entries
    return matching.sort((a, b) => b.at - a.at)
  }, [from, injuryId, kind])
  return useMemo(() => all && { entries: all.slice(0, limit), truncated: all.length > limit }, [all, limit])
}

/** Live documents, newest first (optionally for one injury). */
export function useDocuments(injuryId?: string) {
  return useLiveQuery(
    async () =>
      (await db.documents.toArray())
        .filter((d) => alive(d) && (!injuryId || d.injuryId === injuryId))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [injuryId],
  )
}

/** Meals since `from`, newest first. */
export function useMeals(from = 0) {
  return useLiveQuery(
    async () => (await db.meals.where('recordedAt').aboveOrEqual(from).toArray()).filter(alive).sort((a, b) => b.recordedAt - a.recordedAt),
    [from],
  )
}

/** Saved meals, most recently updated (used) first. */
export function useSavedMeals() {
  return useLiveQuery(async () => (await db.savedMeals.toArray()).filter(alive).sort((a, b) => b.updatedAt - a.updatedAt), [])
}
