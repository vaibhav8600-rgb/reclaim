import type { CheckIn } from '../db/db'

/** Minute buckets for "how long before it hurts" (stored as the midpoint, so trends can compare them). */
export const TOLERANCE = [
  { minutes: 10, label: 'Under 15 min' },
  { minutes: 20, label: '15–30 min' },
  { minutes: 45, label: '30–60 min' },
  { minutes: 90, label: '1–2 hours' },
  { minutes: 150, label: 'Over 2 hours' },
] as const
export const toleranceLabel = (m: number | undefined) => TOLERANCE.find((t) => t.minutes === m)?.label

/** Everyday activities people often rate; any can be typed instead. */
export const ACTIVITY_IDEAS = ['Sitting at work', 'Walking 30 minutes', 'Climbing stairs', 'Lifting a bag', 'Bending to the floor', 'Typing', 'Driving', 'Sleeping through']

const mean = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => x !== undefined)
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : undefined
}
/** PEG: the mean of pain, enjoyment and general activity (0–10, lower is better). */
export const pegScore = (c: CheckIn) => mean([c.pain, c.enjoyment, c.generalActivity])
/** Patient-Specific Functional Scale: the mean of the activity scores (0–10, higher is better). */
export const psfsScore = (c: CheckIn) => mean((c.activities ?? []).map((a) => a.score))

/** A week since the last one (or never), while an injury is open. */
export const checkInDue = (hasOpenInjury: boolean, lastAt: number | undefined, now = Date.now()) =>
  hasOpenInjury && (lastAt === undefined || lastAt < now - 7 * 86_400_000)

/**
 * First against latest, for each measure — the change that matters is over weeks. A 2-point change is the usual
 * "clinically important" threshold for both PEG and PSFS; smaller is shown as about the same.
 */
export function checkInTrend(checkins: CheckIn[]) {
  const sorted = [...checkins].filter((c) => !c.deletedAt).sort((a, b) => a.recordedAt - b.recordedAt)
  const pick = <T,>(f: (c: CheckIn) => T | undefined) => {
    const withValue = sorted.filter((c) => f(c) !== undefined)
    return withValue.length ? { first: f(withValue[0])!, latest: f(withValue[withValue.length - 1])!, count: withValue.length, since: withValue[0].recordedAt } : undefined
  }
  return { peg: pick(pegScore), psfs: pick(psfsScore), sit: pick((c) => c.sitMinutes), walk: pick((c) => c.walkMinutes), nights: pick((c) => c.nightsWoken) }
}

/** Better, worse or about the same, given which way is better and what counts as a real change. */
export function direction(first: number, latest: number, better: 'up' | 'down', threshold: number) {
  const d = latest - first
  if (Math.abs(d) < threshold) return 'same'
  return (d > 0) === (better === 'up') ? 'better' : 'worse'
}
