import type { Exercise, HealthFact, Injury, Prescription, RehabSession } from '../db/db'
import { clampTo, EXERCISE_GUIDES, type ExerciseGuide } from './guide'
import { suggestedCalories } from './nutrition'
import { itemDone, plannedPerWeek, settledByMorning } from './rehab'

/**
 * The rules-based half of the recovery plan: which vetted exercises suit the user's injuries, daily protein and
 * water targets from published ranges, safety holds from their records, and a weekly check of each exercise from
 * their logs (the pain-monitoring model). The AI explains and picks; these numbers are never the AI's.
 */

/** Vetted exercises that suit at least one open injury. */
export function candidates(exercises: Exercise[], injuries: Injury[]) {
  const regions = new Set(injuries.map((i) => i.bodyRegion))
  return exercises.flatMap((e) => {
    const guide = EXERCISE_GUIDES[e.id]
    return guide && guide.for.some((r) => regions.has(r)) ? [{ exercise: e, guide }] : []
  })
}

/**
 * How to adjust an exercise for the user's other open injuries: one note per body region the exercise isn't for
 * (two sore knees get one kneeling note). Injuries passed in should be the open ones.
 */
export function adjustments(exerciseId: string, injuries: Injury[]) {
  const guide = EXERCISE_GUIDES[exerciseId]
  if (!guide?.adjust) return []
  const out = new Map<string, { region: string; injury: Injury; note: string }>()
  for (const injury of injuries) {
    const note = guide.adjust[injury.bodyRegion]
    if (note && !guide.for.includes(injury.bodyRegion) && !out.has(injury.bodyRegion)) out.set(injury.bodyRegion, { region: injury.bodyRegion, injury, note })
  }
  return [...out.values()]
}

/** An AI-chosen dose, kept inside the vetted range. */
export function clampDose(guide: ExerciseGuide, d: { sets: number; target: number; timesPerDay: number; daysPerWeek: number }) {
  return {
    sets: clampTo(guide.sets, d.sets),
    target: clampTo(guide.target, d.target),
    timesPerDay: clampTo(guide.timesPerDay, d.timesPerDay),
    daysPerWeek: clampTo(guide.daysPerWeek, d.daysPerWeek),
  }
}

/* ─────────── daily targets ─────────── */

const round = (n: number, step: number) => Math.round(n / step) * step
const has = (facts: HealthFact[], kind: HealthFact['kind'], name: RegExp) => facts.some((f) => f.kind === kind && name.test(f.name))

/**
 * Conditions in the records that make a generic protein or water target unsafe to suggest: kidney disease
 * (a low eGFR, or a kidney condition) for both; heart failure, liver cirrhosis or a fluid restriction for water.
 */
export function holds(facts: HealthFact[]) {
  const lowEgfr = facts.some((f) => f.kind === 'lab' && /egfr|glomerular/i.test(f.name) && f.value !== undefined && f.value < 60)
  const kidney = lowEgfr || has(facts, 'condition', /kidney|renal|ckd|nephr|dialysis/i)
  const fluid = has(facts, 'condition', /heart failure|cardiac failure|\bchf\b|cirrhosis|fluid restrict/i) || has(facts, 'medication', /fluid restrict/i)
  return {
    protein: kidney ? 'Your records mention kidney problems. Protein needs are different then — ask your doctor or a dietitian for your target.' : undefined,
    water: kidney || fluid ? 'Your records mention a condition where the amount you drink may need to be limited. Ask your doctor how much to drink.' : undefined,
  }
}

/** Protein 1.4–2.0 g/kg for people exercising (ISSN); aim at 1.6 g/kg. Water ~30–35 ml/kg; aim at 33 ml/kg. */
export function dailyTargets(weightKg: number | undefined, facts: HealthFact[]) {
  const hold = holds(facts)
  if (!weightKg) return { hold }
  return {
    hold,
    protein: hold.protein ? undefined : { target: round(weightKg * 1.6, 5), low: round(weightKg * 1.4, 5), high: round(weightKg * 2.0, 5) },
    water: hold.water ? undefined : { target: round(weightKg * 33, 250), low: round(weightKg * 30, 250), high: round(weightKg * 35, 250) },
  }
}

/* ─────────── weekly check (pain-monitoring model) ─────────── */

export type Check = { verdict: 'progress' | 'hold' | 'ease' | 'new'; reason: string }

/**
 * How one exercise went over the last 7 days. Pain during exercise up to 5/10 is acceptable if it settles
 * (Silbernagel 2007); ease off above that, if pain after sessions climbs, or if it hadn't settled by the next
 * morning; progress when it's comfortable (at or below 3/10) and done most of the planned times.
 */
export function weeklyCheck(p: Prescription, sessions: RehabSession[], now = Date.now()): Check {
  const week = sessions.filter((s) => !s.deletedAt && s.recordedAt > now - 7 * 86_400_000)
  const items = week.flatMap((s) => s.items.filter((i) => i.exerciseId === p.exerciseId && itemDone(i)).map((i) => ({ i, s })))
  if (!items.length) return { verdict: 'new', reason: 'Not done in the last 7 days yet.' }
  const during = items.flatMap(({ i }) => (i.painDuring === undefined ? [] : [i.painDuring]))
  const worst = during.length ? Math.max(...during) : undefined
  const avg = during.length ? during.reduce((a, b) => a + b, 0) / during.length : undefined
  const flare = items.some(({ s }) => s.painBefore !== undefined && s.painAfter !== undefined && s.painAfter - s.painBefore >= 2)
  const unsettled = items.some(({ s }) => settledByMorning(s) === false)
  const done = items.length / Math.max(1, plannedPerWeek(p))
  if ((worst !== undefined && worst > 5) || flare || unsettled) {
    return {
      verdict: 'ease',
      reason: worst !== undefined && worst > 5 ? `Pain reached ${worst}/10 during it this week (above 5/10).` : flare ? 'Pain rose by 2 or more after a session this week.' : 'Pain hadn’t settled by the next morning after a session this week.',
    }
  }
  if (avg !== undefined && avg <= 3 && done >= 0.7) return { verdict: 'progress', reason: `Done ${items.length} of ${plannedPerWeek(p)} times with pain around ${Math.round(avg)}/10.` }
  return { verdict: 'hold', reason: done < 0.7 ? `Done ${items.length} of ${plannedPerWeek(p)} planned times — keep going at this level.` : 'Keep going at this level.' }
}

/**
 * Starting goals for a beginner, from published ranges: protein and water per kg (with the same holds as the
 * recovery plan when records show kidney or heart problems), 8,000 steps, 8 hours of sleep. Only ever fills goals
 * that aren't set yet.
 */
export function suggestedGoals(weightKg: number | undefined, facts: HealthFact[], profile: Parameters<typeof suggestedCalories>[0] = {}) {
  const t = dailyTargets(weightKg, facts)
  return { calorieTarget: suggestedCalories(profile, weightKg), proteinTarget: t.protein?.target, fiberTarget: 30, waterTarget: t.water?.target, stepsTarget: 8000, sleepTarget: 8 }
}
