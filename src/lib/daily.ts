import type { Sleep } from '../db/db'
import { startOfDay } from './dates'

/** Sleep, steps, weight: the everyday numbers on Today and in Goals. */

export const SLEEP_QUALITY = [
  { value: 1, label: 'Poor' },
  { value: 2, label: 'Fair' },
  { value: 3, label: 'Good' },
  { value: 4, label: 'Great' },
] as const
export const qualityLabel = (q?: number) => SLEEP_QUALITY.find((x) => x.value === q)?.label

export const sleepHours = (s: Pick<Sleep, 'bedAt' | 'wakeAt'>) => Math.max(0, (s.wakeAt - s.bedAt) / 3_600_000)

/** "7h 12m" */
export function formatHours(h: number) {
  const mins = Math.round(h * 60)
  return `${Math.floor(mins / 60)}h${mins % 60 ? ` ${String(mins % 60).padStart(2, '0')}m` : ''}`
}

/** Last night: sleep that ended today (the longest, if there was a nap too). */
export function lastNight(sleeps: Sleep[], now = Date.now()) {
  return sleeps.filter((s) => !s.deletedAt && s.wakeAt >= startOfDay(now) && s.wakeAt <= now).sort((a, b) => sleepHours(b) - sleepHours(a))[0]
}

/** One activity record per day, so the id is the date. */
export const activityId = (day: string) => `activity-${day}`

export const bmi = (weightKg: number, heightCm: number) => Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10

/** WHO adult ranges. */
export function bmiRange(b: number) {
  return b < 18.5 ? 'below 18.5 (underweight range)' : b < 25 ? '18.5–24.9 (healthy range)' : b < 30 ? '25–29.9 (overweight range)' : '30 or more (obesity range)'
}

