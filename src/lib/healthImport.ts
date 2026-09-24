/**
 * Apple Health → Reclaim, through an iPhone Shortcut (a web app can't read HealthKit itself).
 *
 * The Shortcut writes one line per sample and opens `/import/health#d=<url-encoded lines>`:
 *   steps,2026-09-24,6420                         a day's steps (several lines for a day are added up)
 *   exercise,2026-09-24,35                        a day's exercise minutes
 *   weight,2026-09-24T07:30,85.4[,lb]             kg unless the unit says lb
 *   sleep,2026-09-23T23:10,2026-09-24T02:05[,Core] one sleep segment; "In Bed" and "Awake" are ignored
 * Sleep segments less than an hour apart join into one night. Anything else is counted and skipped.
 */

export interface HealthImport {
  steps: Map<string, number>
  exercise: Map<string, number>
  weights: { at: number; kg: number }[]
  nights: { bedAt: number; wakeAt: number }[]
  skipped: number
}

const MAX_LINES = 5000
const DAY = /^\d{4}-\d{2}-\d{2}$/
/** "2026-09-24T07:30", "2026-09-24 07:30", or with seconds; local time. */
const parseTime = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim())
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)).getTime() : NaN
}
const number = (s?: string) => Number((s ?? '').trim().replace(/,(?=\d{3}\b)/g, '').replace(/[^\d.]/g, '') || NaN)

export function parseHealthExport(text: string, now = Date.now()): HealthImport {
  const out: HealthImport = { steps: new Map(), exercise: new Map(), weights: [], nights: [], skipped: 0 }
  const segments: { start: number; end: number }[] = []
  for (const raw of text.split(/\r?\n/).slice(0, MAX_LINES)) {
    const line = raw.trim()
    if (!line) continue
    const [kind, a, b, c] = line.split(/\s*[,;\t]\s*/)
    const k = kind?.toLowerCase()
    if ((k === 'steps' || k === 'exercise') && DAY.test(a ?? '') && Number.isFinite(number(b)) && number(b) >= 0) {
      const map = k === 'steps' ? out.steps : out.exercise
      map.set(a, (map.get(a) ?? 0) + Math.round(number(b)))
    } else if (k === 'weight' && Number.isFinite(parseTime(a ?? '')) && number(b) > 0) {
      const kg = c?.toLowerCase().startsWith('lb') ? number(b) / 2.20462 : number(b)
      if (kg < 20 || kg > 400 || parseTime(a) > now) out.skipped++
      else out.weights.push({ at: parseTime(a), kg: Math.round(kg * 10) / 10 })
    } else if (k === 'sleep' && Number.isFinite(parseTime(a ?? '')) && Number.isFinite(parseTime(b ?? ''))) {
      const state = (c ?? '').toLowerCase()
      if (state.includes('bed') || state.includes('awake')) continue // time in bed or awake isn't sleep
      const start = parseTime(a)
      const end = parseTime(b)
      if (end > start && end - start < 16 * 3_600_000 && end <= now + 60_000) segments.push({ start, end })
      else out.skipped++
    } else out.skipped++
  }
  // Join segments into nights: a gap under an hour is the same night.
  for (const s of segments.sort((x, y) => x.start - y.start)) {
    const last = out.nights[out.nights.length - 1]
    if (last && s.start - last.wakeAt < 3_600_000) last.wakeAt = Math.max(last.wakeAt, s.end)
    else out.nights.push({ bedAt: s.start, wakeAt: s.end })
  }
  out.nights = out.nights.filter((n) => n.wakeAt - n.bedAt >= 30 * 60_000) // a stray few minutes isn't a night
  return out
}

export const isEmptyImport = (h: HealthImport) => !h.steps.size && !h.exercise.size && !h.weights.length && !h.nights.length
