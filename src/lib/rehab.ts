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
    .filter((s) => s.recordedAt >= from && s.recordedAt < from + 7 * DAY)
    .reduce((n, s) => n + s.items.filter(itemDone).length, 0)
  return { planned, done }
}

/** Planned vs completed exercises today (daily prescriptions count their times-per-day). */
export function todayAdherence(prescriptions: Prescription[], sessions: RehabSession[], now = Date.now()): Adherence {
  const from = startOfDay(now)
  const planned = prescriptions.filter((p) => p.active).reduce((n, p) => n + p.timesPerDay, 0)
  const done = sessions.filter((s) => s.recordedAt >= from).reduce((n, s) => n + s.items.filter(itemDone).length, 0)
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
}

export const DRAFT_KEY = 'sessionDraft'
