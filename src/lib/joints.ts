/**
 * Weight and the joints. Each kilogram of body weight lost takes about 4 kg of load off the knee with every step
 * (Messier 2005, adults with knee osteoarthritis) — a motivating, honest way to show what weight change does.
 */

export const KNEE_LOAD_PER_KG = 4

/** Lost at least 1 kg from the heaviest reading in the last 6 months: how much, since when, and the knee load. */
export function jointLoad(readings: { at: number; kg: number }[], now = Date.now()) {
  const recent = readings.filter((r) => r.at >= now - 183 * 86_400_000).sort((a, b) => a.at - b.at)
  if (recent.length < 2) return undefined
  const latest = recent[recent.length - 1]
  const peak = recent.reduce((a, b) => (b.kg > a.kg ? b : a))
  const lost = Math.round((peak.kg - latest.kg) * 10) / 10
  return lost >= 1 ? { lost, since: peak.at, kneeKg: Math.round(lost * KNEE_LOAD_PER_KG) } : undefined
}

/**
 * A gentle weekly step target: about 10% (at least 500) more than the recent daily average, rounded to 250,
 * never above the goal — building up rather than jumping straight to it, which sore knees and backs tolerate better.
 */
export function stepRamp(average: number | undefined, goal: number | undefined) {
  if (!goal || !average) return undefined
  if (average >= goal * 0.9) return undefined
  return Math.min(goal, Math.round(Math.max(average * 1.1, average + 500) / 250) * 250)
}
