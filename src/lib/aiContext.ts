import { db, type HealthFact } from '../db/db'
import { alive } from '../db/repo'
import { kindInfo, sideLabel, symptomLabel } from './constants'
import { dayKey, daysAgo, daysBetween, fromDayKey } from './dates'
import { factKey, factValue } from './facts'
import { dailyProtein } from './nutrition'
import { candidates } from './plan'
import { itemDone, startOfWeek, weeklyAdherence } from './rehab'

/**
 * A compact, privacy-minded summary of the log for the AI: only what a task needs,
 * no name or account details, text trimmed. Numbers are computed here, not by the model.
 */

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)
const DAY = 86_400_000

/**
 * The confirmed medical history, compact: conditions, medicines and allergies, the latest result of each lab test
 * (out-of-range first) and recent scan findings. Values as the user confirmed them from their records.
 */
function healthProfile(facts: HealthFact[]) {
  if (!facts.length) return undefined
  const newest = [...facts].sort((a, b) => b.date.localeCompare(a.date))
  const pick = (kind: HealthFact['kind'], n: number) => newest.filter((f) => f.kind === kind).slice(0, n).map((f) => ({ date: f.date, name: f.name, detail: f.detail && trim(f.detail, 200) }))
  const latestLab = new Map<string, HealthFact>()
  for (const f of newest) if (f.kind === 'lab' && !latestLab.has(factKey(f.name))) latestLab.set(factKey(f.name), f)
  return {
    conditions: pick('condition', 15),
    medicines: pick('medication', 15),
    allergies: pick('allergy', 10),
    labs: [...latestLab.values()]
      .sort((a, b) => Number(!!b.flag) - Number(!!a.flag))
      .slice(0, 40)
      .map((f) => ({ date: f.date, test: f.name, result: factValue(f), range: f.range, flag: f.flag })),
    scans: pick('imaging', 8),
    procedures: pick('procedure', 8),
  }
}

export async function buildAiContext({ days = 14, injuryId }: { days?: number; injuryId?: string } = {}) {
  const now = Date.now()
  const from = daysAgo(days - 1, now)
  const half = daysAgo(Math.floor(days / 2) - 1, now)

  const [injuries, symptoms, measurements, notes, sessions, prescriptions, exercises, documents, meals, profile, facts, water] = await Promise.all([
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
    db.facts.toArray(),
    db.water.where('recordedAt').aboveOrEqual(from).toArray(),
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
    const k = `${m.kind === 'other' ? m.method : kindInfo(m.kind).label}${m.side && m.side !== 'none' ? ` (${m.side})` : ''} [${m.unit}]` // one series per unit: cm and in never mix
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
    health: healthProfile(facts.filter(alive)),
    water: water.some(alive)
      ? {
          dailyGoalMl: profile?.waterTarget,
          loggedDays: Object.entries(Object.groupBy(water.filter(alive), (d) => dayKey(d.recordedAt))).map(([date, ds]) => ({ date, ml: ds!.reduce((a, d) => a + d.amount, 0) })),
        }
      : undefined,
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

/**
 * The whole confirmed medical history, for the overall health summary: every lab test with its results in date
 * order (so changes over time can be described), plus conditions, medicines, scans and the injuries being tracked.
 */
export async function buildHealthContext() {
  const [facts, injuries] = await Promise.all([db.facts.toArray(), db.injuries.toArray()])
  const live = facts.filter(alive).sort((a, b) => a.date.localeCompare(b.date))
  const list = (kind: HealthFact['kind']) => live.filter((f) => f.kind === kind).map((f) => ({ date: f.date, name: f.name, detail: f.detail && trim(f.detail, 300) }))
  const tests = new Map<string, HealthFact[]>()
  for (const f of live) if (f.kind === 'lab' || f.kind === 'vital') tests.set(factKey(f.name), [...(tests.get(factKey(f.name)) ?? []), f])
  return {
    today: dayKey(Date.now()),
    injuries: injuries.filter(alive).map((i) => ({ name: i.name, status: i.status, diagnosis: i.diagnosis, trackedInReclaimSince: i.startDate })),
    conditions: list('condition'),
    medicines: list('medication'),
    allergies: list('allergy'),
    procedures: list('procedure'),
    scans: list('imaging'),
    tests: [...tests.values()].slice(0, 80).map((rs) => ({
      test: rs[rs.length - 1].name,
      range: rs[rs.length - 1].range,
      results: rs.slice(-8).map((f) => ({ date: f.date, result: factValue(f), flag: f.flag })),
    })),
  }
}

/**
 * For the recovery plan: the 14-day log and health profile, the open injuries (with ids to assign exercises to),
 * and the vetted exercises that suit them, with their dose ranges. The AI may choose only from this library.
 */
export async function buildPlanContext() {
  const [base, injuries, exercises] = await Promise.all([buildAiContext({ days: 14 }), db.injuries.toArray(), db.exercises.toArray()])
  const open = injuries.filter((i) => alive(i) && i.status !== 'resolved')
  return {
    ...base,
    openInjuries: open.map((i) => ({ id: i.id, name: i.name, region: `${sideLabel(i.side) ?? ''} ${i.bodyRegion}`.trim(), status: i.status, diagnosis: i.diagnosis, daysSinceStart: daysBetween(fromDayKey(i.startDate), Date.now()) })),
    library: candidates(exercises.filter(alive), open).map(({ exercise: e, guide: g }) => ({
      id: e.id,
      name: e.name,
      for: g.for,
      sets: g.sets,
      [e.mode === 'time' ? 'secondsPerSet' : 'repsPerSet']: g.target,
      timesPerDay: g.timesPerDay,
      daysPerWeek: g.daysPerWeek,
      note: g.caution,
    })),
  }
}
