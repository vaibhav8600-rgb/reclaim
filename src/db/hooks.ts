import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Activity, type Base, type Exercise, type Injury, type JournalEntry, type Meal, type Measurement, type MedicalDocument, type RehabSession, type Sleep, type Symptom } from './db'
import { alive, getMeta } from './repo'
import { dayKey, fromDayKey } from '../lib/dates'

export function useInjuries() {
  return useLiveQuery(async () => (await db.injuries.toArray()).filter(alive), [])
}

/** All injuries (including deleted) keyed by id, so old entries can still show their injury name. */
export function useInjuryMap() {
  return useLiveQuery(async () => new Map((await db.injuries.toArray()).map((i) => [i.id, i])), []) ?? new Map<string, Injury>()
}

export const isOpenInjury = (i: Injury) => i.status !== 'resolved'

/** The profile: undefined while loading, null when there isn't one yet (a new user). */
export function useProfile() {
  return useLiveQuery(async () => (await db.profile.get('me')) ?? null, [])
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
  | { kind: 'sleep'; at: number; item: Sleep }
  | { kind: 'activity'; at: number; item: Activity }

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
    const [symptoms, measurements, notes, injuries, sessions, documents, meals, sleeps, activity] = await Promise.all([
      db.symptoms.where('recordedAt').aboveOrEqual(from).toArray(),
      db.measurements.where('recordedAt').aboveOrEqual(from).toArray(),
      injuryId ? Promise.resolve([] as JournalEntry[]) : db.journal.where('recordedAt').aboveOrEqual(from).toArray(),
      db.injuries.toArray(),
      db.sessions.where('recordedAt').aboveOrEqual(from).toArray(),
      db.documents.toArray(),
      injuryId ? Promise.resolve([] as Meal[]) : db.meals.where('recordedAt').aboveOrEqual(from).toArray(),
      injuryId ? Promise.resolve([] as Sleep[]) : db.sleep.where('wakeAt').aboveOrEqual(from).toArray(),
      injuryId ? Promise.resolve([] as Activity[]) : db.activity.where('date').aboveOrEqual(dayKey(from)).toArray(),
    ])
    const entries: Entry[] = [
      ...since(symptoms).map((item) => ({ kind: 'symptom' as const, at: item.recordedAt, item })),
      ...since(measurements).map((item) => ({ kind: 'measurement' as const, at: item.recordedAt, item })),
      ...notes.filter(alive).map((item) => ({ kind: 'note' as const, at: item.recordedAt, item })),
      ...meals.filter(alive).map((item) => ({ kind: 'meal' as const, at: item.recordedAt, item })),
      ...sleeps.filter(alive).map((item) => ({ kind: 'sleep' as const, at: item.wakeAt, item })),
      // A day's activity sits at the end of that day (or now, for today).
      ...activity.filter(alive).map((item) => ({ kind: 'activity' as const, at: Math.min(fromDayKey(item.date) + 21 * 3_600_000, Date.now()), item })),
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

/** Confirmed health facts, newest record first. */
export function useFacts() {
  return useLiveQuery(async () => (await db.facts.toArray()).filter(alive).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)), [])
}

/** Water logged since `from`. */
export function useWater(from = 0) {
  return useLiveQuery(async () => (await db.water.where('recordedAt').aboveOrEqual(from).toArray()).filter(alive), [from])
}

/** Sleep that ended since `from`, newest first. */
export function useSleep(from = 0) {
  return useLiveQuery(async () => (await db.sleep.where('wakeAt').aboveOrEqual(from).toArray()).filter(alive).sort((a, b) => b.wakeAt - a.wakeAt), [from])
}

/** Daily activity since a day (YYYY-MM-DD), newest first. */
export function useActivity(fromDay = '0000-00-00') {
  return useLiveQuery(async () => (await db.activity.where('date').aboveOrEqual(fromDay).toArray()).filter(alive).sort((a, b) => b.date.localeCompare(a.date)), [fromDay])
}

/** The most recent weight reading (null once loaded if there's none). */
export function useLatestWeight() {
  return useLiveQuery(async () => (await db.measurements.where('kind').equals('weight').toArray()).filter(alive).sort((a, b) => b.recordedAt - a.recordedAt)[0] ?? null, [])
}
