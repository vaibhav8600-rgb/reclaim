import { db } from '../db/db'
import { alive } from '../db/repo'
import { kindInfo, sideLabel, symptomLabel } from './constants'
import { dayKey, daysAgo, daysBetween, fromDayKey } from './dates'
import { dailyProtein } from './nutrition'
import { itemDone, startOfWeek, weeklyAdherence } from './rehab'

/**
 * A compact, privacy-minded summary of the log for the AI: only what a task needs,
 * no name or account details, text trimmed. Numbers are computed here, not by the model.
 */

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)
const DAY = 86_400_000

export async function buildAiContext({ days = 14, injuryId }: { days?: number; injuryId?: string } = {}) {
  const now = Date.now()
  const from = daysAgo(days - 1, now)
  const half = daysAgo(Math.floor(days / 2) - 1, now)

  const [injuries, symptoms, measurements, notes, sessions, prescriptions, exercises, documents, meals, profile] = await Promise.all([
    db.injuries.toArray(),
    db.symptoms.where('recordedAt').aboveOrEqual(from).toArray(),
    db.measurements.toArray(),
    db.journal.where('recordedAt').aboveOrEqual(from).toArray(),
    db.sessions.toArray(),
    db.prescriptions.toArray(),
    db.exercises.toArray(),
    db.documents.toArray(),
    db.meals.where('recordedAt').aboveOrEqual(from).toArray(), // not injury-specific, but relevant to any recovery
    db.profile.get('me'),
  ])
  const inScope = <T extends { injuryId?: string; deletedAt?: number }>(r: T) => alive(r as never) && (!injuryId || r.injuryId === injuryId)
  const injuryName = new Map(injuries.map((i) => [i.id, i.name]))
  const exerciseName = new Map(exercises.map((e) => [e.id, e.name]))
  const liveSymptoms = symptoms.filter(inScope)
  const liveMeals = meals.filter(alive)

  const pain = injuries
    .filter((i) => alive(i) && (!injuryId || i.id === injuryId))
    .map((i) => {
      const logs = liveSymptoms.filter((s) => s.type === 'pain' && s.injuryId === i.id)
      const byDay = new Map<string, number[]>()
      for (const s of logs) byDay.set(dayKey(s.recordedAt), [...(byDay.get(dayKey(s.recordedAt)) ?? []), s.severity])
      const byTime = (from: number, to: number) => avg(logs.filter((s) => new Date(s.recordedAt).getHours() >= from && new Date(s.recordedAt).getHours() < to).map((s) => s.severity))
      return {
        injury: i.name,
        region: `${sideLabel(i.side) ?? ''} ${i.bodyRegion}`.trim(),
        status: i.status,
        daysSinceStart: daysBetween(fromDayKey(i.startDate), now),
        diagnosis: i.diagnosis,
        logs: logs.length,
        averageRecentHalf: avg(logs.filter((s) => s.recordedAt >= half).map((s) => s.severity)),
        averageEarlierHalf: avg(logs.filter((s) => s.recordedAt < half).map((s) => s.severity)),
        averageByTimeOfDay: { morning: byTime(5, 12), afternoon: byTime(12, 17), evening: byTime(17, 24) },
        daily: [...byDay].sort().map(([date, v]) => ({ date, avg: avg(v), logs: v.length })),
      }
    })

  const triggerStats = new Map<string, number[]>()
  for (const s of liveSymptoms) if (s.trigger) triggerStats.set(s.trigger, [...(triggerStats.get(s.trigger) ?? []), s.severity])

  const otherSymptoms = new Map<string, number[]>()
  for (const s of liveSymptoms.filter((s) => s.type !== 'pain')) {
    const k = `${symptomLabel(s.type)}${s.injuryId ? ` (${injuryName.get(s.injuryId)})` : ''}`
    otherSymptoms.set(k, [...(otherSymptoms.get(k) ?? []), s.severity])
  }

  const series = new Map<string, typeof measurements>()
  for (const m of measurements.filter(inScope).sort((a, b) => a.recordedAt - b.recordedAt)) {
    const k = `${m.kind === 'other' ? m.method : kindInfo(m.kind).label}${m.side && m.side !== 'none' ? ` (${m.side})` : ''}`
    series.set(k, [...(series.get(k) ?? []), m])
  }

  const livePlan = prescriptions.filter((p) => alive(p) && p.active && (!injuryId || p.injuryId === injuryId))
  const liveSessions = sessions.filter((s) => alive(s) && s.recordedAt >= from)
  const week = weeklyAdherence(livePlan, sessions.filter(alive), now)
  const lastWeek = weeklyAdherence(livePlan, sessions.filter(alive), startOfWeek(now) - DAY)

  return {
    today: dayKey(now),
    periodDays: days,
    pain,
    otherSymptoms: [...otherSymptoms].map(([symptom, v]) => ({ symptom, logs: v.length, averageSeverity: avg(v) })),
    triggers: [...triggerStats].map(([trigger, v]) => ({ trigger, logs: v.length, averageSeverity: avg(v) })).sort((a, b) => b.logs - a.logs).slice(0, 8),
    measurements: [...series].map(([what, ms]) => ({
      what,
      unit: ms[0].unit,
      first: { date: dayKey(ms[0].recordedAt), value: ms[0].value },
      latest: { date: dayKey(ms[ms.length - 1].recordedAt), value: ms[ms.length - 1].value },
      readings: ms.length,
    })),
    rehab: livePlan.length
      ? {
          exercisesInPlan: livePlan.map((p) => exerciseName.get(p.exerciseId)),
          thisWeek: week,
          lastWeek,
          sessionsInPeriod: liveSessions.length,
          averagePainBefore: avg(liveSessions.flatMap((s) => (s.painBefore === undefined ? [] : [s.painBefore]))),
          averagePainAfter: avg(liveSessions.flatMap((s) => (s.painAfter === undefined ? [] : [s.painAfter]))),
          loads: livePlan
            .map((p) => {
              const loads = sessions
                .filter(alive)
                .sort((a, b) => a.recordedAt - b.recordedAt)
                .flatMap((s) => s.items.filter((i) => i.exerciseId === p.exerciseId && itemDone(i)).map((i) => Math.max(0, ...i.sets.filter((x) => x.done).map((x) => x.load ?? 0))))
                .filter((l) => l > 0)
              return loads.length ? { exercise: exerciseName.get(p.exerciseId), firstKg: loads[0], latestKg: loads[loads.length - 1] } : undefined
            })
            .filter(Boolean),
        }
      : undefined,
    notes: notes
      .filter(alive)
      .sort((a, b) => b.recordedAt - a.recordedAt)
      .slice(0, 12)
      .map((n) => ({ date: dayKey(n.recordedAt), text: trim(n.text, 400) })),
    documents: documents
      .filter(inScope)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
      .map((d) => ({ date: d.date, title: d.title, summary: d.aiSummary ? trim(d.aiSummary.summary, 300) : undefined })),
    nutrition: liveMeals.length
      ? {
          dailyProteinGoalGrams: profile?.proteinTarget,
          // Only days with at least one meal logged: a missing day means not logged, not nothing eaten.
          loggedDays: dailyProtein(liveMeals, days, now)
            .filter((d) => d.meals)
            .map((d) => ({ date: d.key, proteinGrams: d.protein, kcal: d.calories || undefined, meals: d.meals })),
        }
      : undefined,
  }
}
