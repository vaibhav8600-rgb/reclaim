import { Bandage, X } from 'lucide-react'
import { db } from '../../db/db'
import { useFacts, useInjuries, useMeta } from '../../db/hooks'
import { save, setMeta } from '../../db/repo'
import { IconTile, Section } from '../../components/ui'
import { injuryPlace } from '../../lib/constants'
import { formatMediumDate, fromDayKey } from '../../lib/dates'
import { injurySuggestions, type InjurySuggestion } from '../../lib/facts'
import { useGo } from '../../lib/nav'
import { toast } from '../../lib/toast'

const DISMISSED = 'dismissedInjurySuggestions'

/**
 * Conditions in the confirmed records that affect one part of the body and aren't tracked yet, each one tap
 * from becoming an injury to track (and to build the recovery plan around). Nothing is added unasked.
 */
export function InjurySuggestions() {
  const go = useGo()
  const facts = useFacts()
  const injuries = useInjuries()
  const dismissed = useMeta<string[]>(DISMISSED)
  if (!facts || !injuries) return null
  const suggestions = injurySuggestions(facts, injuries, dismissed ?? [])
  if (!suggestions.length) return null

  async function add(s: InjurySuggestion) {
    await save(db.injuries, {
      name: s.name,
      bodyRegion: s.bodyRegion,
      side: s.side,
      startDate: s.since,
      status: 'active',
      diagnosis: s.name,
      notes: s.detail ? `From your records: ${s.detail}` : 'Added from your medical records.',
    })
    toast(`${s.name} added`, { label: 'Plan', onClick: () => go('/plan') })
  }

  return (
    <Section prominent title="From Your Records" footer="Conditions in your records that affect one part of the body. Add one to track pain and progress, and to build your recovery plan around it.">
      <div className="card rows overflow-hidden" style={{ ['--inset' as string]: '3.625rem' }}>
        {suggestions.map((s) => (
          <div key={s.key} className="cell">
            <IconTile icon={Bandage} color="pink" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{s.name}</span>
              <span className="block truncate text-[0.875rem] text-muted">
                {injuryPlace(s)} · in your records since {formatMediumDate(fromDayKey(s.since))}
              </span>
            </span>
            <button type="button" className="h-8 shrink-0 rounded-full bg-accent px-3.5 text-[0.9375rem] font-semibold text-accent-ink" onClick={() => add(s)} aria-label={`Add ${s.name} as an injury`}>
              Add
            </button>
            <button type="button" className="-mr-2 flex h-11 w-9 shrink-0 items-center justify-center text-faint" onClick={() => setMeta(DISMISSED, [...(dismissed ?? []), s.key])} aria-label={`Not now: ${s.name}`}>
              <X size={17} />
            </button>
          </div>
        ))}
      </div>
    </Section>
  )
}
