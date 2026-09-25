import type { Exercise, Prescription, RehabSession, SessionItem } from '../db/db'
import { startOfDay } from './dates'

const DAY = 86_400_000

/** Monday 00:00 of the week containing `ms`. */
export function startOfWeek(ms: number) {
  const d = new Date(startOfDay(ms))
  const offset = (d.getDay() + 6) % 7 // Monday = 0
  return d.getTime() - offset * DAY
}

export const plannedPerWeek = (p: Prescription) => p.timesPerDay * p.daysPerWeek

/** Rehab sessions only: workouts (fitness) don't count towards the rehab plan. */
export const isRehab = (s: Pick<RehabSession, 'kind'>) => s.kind !== 'workout'

/** An exercise counts as done in a session when at least one set was completed. */
export const itemDone = (i: SessionItem) => i.sets.some((s) => s.done)

export interface Adherence {
  planned: number
  done: number
}

/**
 * Completed vs planned exercises for the week containing `now`.
 * Planned is the full week's prescription total; done counts completed exercises this week.
 */
export function weeklyAdherence(prescriptions: Prescription[], sessions: RehabSession[], now = Date.now()): Adherence {
  const from = startOfWeek(now)
  const active = prescriptions.filter((p) => p.active)
  const planned = active.reduce((n, p) => n + plannedPerWeek(p), 0)
  const done = sessions
    .filter((s) => isRehab(s) && s.recordedAt >= from && s.recordedAt < from + 7 * DAY)
    .reduce((n, s) => n + s.items.filter(itemDone).length, 0)
  return { planned, done }
}

/** Planned vs completed exercises today (daily prescriptions count their times-per-day). */
export function todayAdherence(prescriptions: Prescription[], sessions: RehabSession[], now = Date.now()): Adherence {
  const from = startOfDay(now)
  const planned = prescriptions.filter((p) => p.active).reduce((n, p) => n + p.timesPerDay, 0)
  const done = sessions.filter((s) => isRehab(s) && s.recordedAt >= from).reduce((n, s) => n + s.items.filter(itemDone).length, 0)
  return { planned, done }
}

export function formatTarget(p: Pick<Prescription, 'sets' | 'target' | 'load' | 'loadNote'>, mode: Exercise['mode']) {
  const amount = mode === 'time' ? `${p.target}s` : `${p.target}`
  const load = p.load ? ` @ ${p.load} kg` : p.loadNote ? ` · ${p.loadNote}` : ''
  return `${p.sets} × ${amount}${load}`
}

export function formatFrequency(p: Pick<Prescription, 'timesPerDay' | 'daysPerWeek'>) {
  const perDay = p.timesPerDay === 1 ? 'Once' : p.timesPerDay === 2 ? 'Twice' : `${p.timesPerDay}×`
  return p.daysPerWeek === 7 ? `${perDay} a day` : `${perDay} a day, ${p.daysPerWeek} days a week`
}

export interface ProgressPoint {
  sessionId: string
  ms: number
  value: number
}

/**
 * One point per session for an exercise: heaviest completed load if a load was used,
 * otherwise total completed reps (or seconds).
 */
export function exerciseProgress(sessions: RehabSession[], exerciseId: string): { metric: 'load' | 'volume'; points: ProgressPoint[] } {
  const rows = sessions
    .filter((s) => !s.deletedAt)
    .flatMap((s) => s.items.filter((i) => i.exerciseId === exerciseId && itemDone(i)).map((i) => ({ s, sets: i.sets.filter((x) => x.done) })))
    .sort((a, b) => a.s.recordedAt - b.s.recordedAt)
  const usesLoad = rows.some((r) => r.sets.some((x) => x.load))
  return {
    metric: usesLoad ? 'load' : 'volume',
    points: rows.map(({ s, sets }) => ({
      sessionId: s.id,
      ms: s.recordedAt,
      value: usesLoad ? Math.max(...sets.map((x) => x.load ?? 0)) : sets.reduce((n, x) => n + x.amount, 0),
    })),
  }
}

/** Build a new session's items from the active plan (optionally for one injury). */
export function itemsFromPlan(prescriptions: Prescription[], injuryId?: string): SessionItem[] {
  return prescriptions
    .filter((p) => p.active && (!injuryId || p.injuryId === injuryId))
    .map((p) => ({
      exerciseId: p.exerciseId,
      prescriptionId: p.id,
      sets: Array.from({ length: p.sets }, () => ({ amount: p.target, load: p.load, done: false })),
    }))
}

/** An in-progress session, kept in meta so it survives leaving the screen or closing the app. */
export interface SessionDraft {
  id?: string
  startedAt: number
  injuryId?: string
  painBefore?: number
  painAfter?: number
  items: SessionItem[]
  notes?: string
  /** A workout: its template, name, rest between sets and the effort rating */
  kind?: 'workout'
  workoutId?: string
  name?: string
  restSeconds?: number
  effort?: number
}

export const DRAFT_KEY = 'sessionDraft'
/** A workout in progress, kept apart from a rehab session in progress */
export const WORKOUT_DRAFT_KEY = 'workoutDraft'

/**
 * Had the pain settled by the next morning? At most 5/10, and no more than 1 above the pain before the session
 * (Silbernagel 2007: pain the morning after shouldn't be worse than before). Undefined until it's been asked.
 */
export function settledByMorning(s: Pick<RehabSession, 'painBefore' | 'morningPain'>) {
  if (s.morningPain === undefined) return undefined
  return s.morningPain <= 5 && (s.painBefore === undefined || s.morningPain <= s.painBefore + 1)
}

/** Yesterday's sessions still waiting for their morning-after answer (asked all day today). */
export function morningCheckDue(sessions: RehabSession[], now = Date.now()) {
  const today = startOfDay(now)
  const yesterday = startOfDay(today - 12 * 3_600_000) // safe across a daylight-saving change
  return sessions.filter((s) => !s.deletedAt && s.recordedAt >= yesterday && s.recordedAt < today && s.morningPain === undefined)
}

/* ─────────── flare-up ─────────── */

/** meta: a flare-up in progress. Sessions start at half the usual sets until it ends. */
export const FLARE_KEY = 'flare'
export interface Flare {
  startedAt: number
}
/** Day 1 is the day it started. */
export const flareDay = (f: Flare, now = Date.now()) => Math.round((startOfDay(now) - startOfDay(f.startedAt)) / 86_400_000) + 1
/** A gentler session: half the usual sets (at least one), same reps or hold. */
export const flareItems = (items: SessionItem[]) => items.map((i) => ({ ...i, sets: i.sets.slice(0, Math.max(1, Math.ceil(i.sets.length / 2))) }))

/* ─────────── workouts ─────────── */

/** Minutes from start to finish, and the weight moved (kg × reps, for sets with a weight). */
export function sessionStats(s: Pick<RehabSession, 'startedAt' | 'recordedAt' | 'items'>) {
  const volume = s.items.flatMap((i) => i.sets.filter((x) => x.done && x.load)).reduce((n, x) => n + x.load! * x.amount, 0)
  return { minutes: Math.max(1, Math.round((s.recordedAt - s.startedAt) / 60_000)), volume: Math.round(volume) }
}
