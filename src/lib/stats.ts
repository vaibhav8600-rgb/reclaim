import type { Symptom } from '../db/db'
import { dayKey, daysAgo, fromDayKey } from './dates'

export interface DayPoint {
  day: string
  ms: number
  /** Average severity that day, or null when nothing was logged. */
  avg: number | null
  count: number
}

/** One point per calendar day for the last `days` days (oldest first). */
export function dailySeries(symptoms: Symptom[], days: number): DayPoint[] {
  const buckets = new Map<string, number[]>()
  for (const s of symptoms) {
    const k = dayKey(s.recordedAt)
    const arr = buckets.get(k)
    if (arr) arr.push(s.severity)
    else buckets.set(k, [s.severity])
  }
  const out: DayPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = dayKey(daysAgo(i))
    const vals = buckets.get(day) ?? []
    out.push({
      day,
      ms: fromDayKey(day),
      avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      count: vals.length,
    })
  }
  return out
}

export function average(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

/** Mean severity in [from, to). */
export function windowAverage(symptoms: Symptom[], from: number, to: number) {
  return average(symptoms.filter((s) => s.recordedAt >= from && s.recordedAt < to).map((s) => s.severity))
}

export const round1 = (n: number) => Math.round(n * 10) / 10
