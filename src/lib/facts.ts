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
