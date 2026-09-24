import { useState } from 'react'
import { useOutletContext } from 'react-router'
import { CalendarDays, Plus } from 'lucide-react'
import { useEntries, useInjuryMap, type Entry } from '../../db/hooks'
import { ENTRY_INSET, EntryRow } from '../../components/EntryRow'
import { Chips, EmptyState, Group, NavBar, Section } from '../../components/ui'
import { dayKey, formatDay } from '../../lib/dates'

type Filter = 'all' | Entry['kind']
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'symptom', label: 'Symptoms' },
  { value: 'measurement', label: 'Measurements' },
  { value: 'session', label: 'Rehab' },
  { value: 'meal', label: 'Meals' },
  { value: 'sleep', label: 'Sleep' },
  { value: 'activity', label: 'Activity' },
  { value: 'note', label: 'Notes' },
  { value: 'document', label: 'Records' },
  { value: 'injury', label: 'Injuries' },
]

export function TimelinePage() {
  const { openLog } = useOutletContext<{ openLog: () => void }>()
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(100)
  const result = useEntries({ limit, kind: filter === 'all' ? undefined : filter })
  const injuries = useInjuryMap()
  if (!result) return null

  const entries = result.entries
  const days: { key: string; at: number; items: Entry[] }[] = []
  for (const e of entries) {
    const key = dayKey(e.at)
    const last = days[days.length - 1]
    if (last?.key === key) last.items.push(e)
    else days.push({ key, at: e.at, items: [e] })
  }

  return (
    <div>
      <NavBar title="Timeline" />
      <Section className="mb-5">
        <Chips options={FILTERS} value={filter} onChange={setFilter} />
      </Section>

      {days.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Your recovery story starts here"
          body="Every symptom, measurement, meal and note you log appears here, day by day."
          action={<button onClick={openLog} className="btn btn-primary"><Plus size={20} /> Log Something</button>}
        />
      ) : (
        <div className="space-y-5">
          {days.map((d) => (
            <section key={d.key} className="day-section">
              <h2 className="sticky bg-bg/95 top-[calc(env(safe-area-inset-top)+3.25rem)] z-10 px-5 py-1.5 text-[0.9375rem] font-semibold">
                {formatDay(d.at)}
              </h2>
              <div className="px-4 pt-1">
                <Group inset={ENTRY_INSET}>
                  {d.items.map((e) => (
                    <EntryRow key={`${e.kind}-${e.item.id}`} entry={e} injuries={injuries} />
                  ))}
                </Group>
              </div>
            </section>
          ))}
          {result.truncated && (
            <div className="px-4">
              <button className="btn btn-quiet w-full" onClick={() => setLimit((l) => l + 200)}>Show Older Entries</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
