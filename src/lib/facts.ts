import type { ExtractedFact } from '../../shared/ai'
import type { HealthFact } from '../db/db'

/** Pure helpers for health facts (no database), shared by the screens and the AI context. */

/**
 * Whether a number is outside a printed reference range. Only simple ranges ("13–17", "< 5", "> 40", "up to 5")
 * are trusted; anything else ("Deficient < 20, Sufficient 30–100") returns null and the report's own flag is used.
 */
export function rangeFlag(value: number, range: string): 'low' | 'high' | undefined | null {
  const n = String.raw`(-?\d+(?:\.\d+)?)`
  const r = range.trim().replace(/,/g, '')
  let m = new RegExp(String.raw`^${n}\s*(?:-|–|—|to)\s*${n}$`, 'i').exec(r)
  if (m) return value < +m[1] ? 'low' : value > +m[2] ? 'high' : undefined
  m = new RegExp(String.raw`^(?:<|≤|<=|up\s*to|upto|less than)\s*${n}$`, 'i').exec(r)
  if (m) return value > +m[1] ? 'high' : undefined
  m = new RegExp(String.raw`^(?:>|≥|>=|more than|greater than)\s*${n}$`, 'i').exec(r)
  if (m) return value < +m[1] ? 'low' : undefined
  return null
}

/** The flag to show: worked out from the range when it's simple, otherwise as the report marks it. */
export function effectiveFlag(f: Pick<ExtractedFact, 'value' | 'range' | 'flag'>) {
  if (f.value === undefined || !f.range) return f.flag
  const computed = rangeFlag(f.value, f.range)
  return computed === null ? f.flag : computed
}

/** Same test, same name (case and spacing aside), across records. */
export const factKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')

/** "12.5 g/dL", "Positive", "130/85 mmHg" */
export function factValue(f: Pick<HealthFact, 'value' | 'unit' | 'detail'>) {
  if (f.value === undefined) return `${f.detail ?? ''}${f.detail && f.unit ? ` ${f.unit}` : ''}`
  return `${+f.value.toFixed(3)}${f.unit ? ` ${f.unit}` : ''}`
}

export interface InjurySuggestion {
  key: string
  name: string
  bodyRegion: string
  side: 'left' | 'right' | 'both' | 'none'
  /** The earliest record of it. */
  since: string
  detail?: string
}

const sidesOverlap = (a?: string, b?: string) => !a || !b || a === b || a === 'both' || b === 'both' || a === 'none' || b === 'none'
export const suggestionKey = (f: Pick<HealthFact, 'name' | 'bodyRegion' | 'side'>) => `${factKey(f.name)}|${f.bodyRegion}|${f.side ?? ''}`

/**
 * Conditions of one body part in the records that aren't tracked as an injury yet (none in the same region and
 * side, current or resolved): offered as injuries to add, so a plan can be built for them. Never added unasked.
 */
export function injurySuggestions(facts: HealthFact[], injuries: { bodyRegion: string; side: string; deletedAt?: number }[], dismissed: string[] = []): InjurySuggestion[] {
  const groups = new Map<string, HealthFact[]>()
  for (const f of facts) {
    if (f.deletedAt || f.kind !== 'condition' || !f.bodyRegion || f.bodyRegion === 'Other') continue
    groups.set(suggestionKey(f), [...(groups.get(suggestionKey(f)) ?? []), f])
  }
  return [...groups].flatMap(([key, group]) => {
    const byDate = [...group].sort((a, b) => a.date.localeCompare(b.date))
    const first = byDate[0]
    const latest = byDate[byDate.length - 1]
    if (dismissed.includes(key)) return []
    if (injuries.some((i) => !i.deletedAt && i.bodyRegion === first.bodyRegion && sidesOverlap(i.side, first.side))) return []
    return [{ key, name: latest.name, bodyRegion: first.bodyRegion!, side: first.side ?? 'none', since: first.date, detail: latest.detail }]
  })
}
