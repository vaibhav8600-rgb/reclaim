import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { useProfile } from '../../db/hooks'
import { Chips, Group, NavBar, Section } from '../../components/ui'
import { formatShortDate } from '../../lib/dates'
import { startOfWeek } from '../../lib/rehab'
import { weekReview, type WeekRow } from '../../lib/week'

const DAY = 86_400_000
const WORD = { better: 'Better', worse: 'Worse', same: 'Same' } as const
const TONE = { better: 'text-tile-green', worse: 'text-danger', same: 'text-muted' } as const
const GROUPS: WeekRow['group'][] = ['Recovery', 'Activity', 'Sleep and weight', 'Food and water']

/** The week in review: every area, against the week before. On a Sunday it's this week; otherwise last week. */
export function WeekPage() {
  const thisWeek = startOfWeek(Date.now())
  const [which, setWhich] = useState<'this' | 'last'>(new Date().getDay() === 0 ? 'this' : 'last')
  const from = which === 'this' ? thisWeek : thisWeek - 7 * DAY
  const profile = useProfile()
  const rows = useLiveQuery(async () => {
    const since = from - 7 * DAY
    const [injuries, symptoms, sessions, prescriptions, activity, sleep, measurements, meals, water, checkins] = await Promise.all([
      db.injuries.toArray(),
      db.symptoms.where('recordedAt').aboveOrEqual(since).toArray(),
      db.sessions.where('recordedAt').aboveOrEqual(since).toArray(),
      db.prescriptions.toArray(),
      db.activity.toArray(),
      db.sleep.where('wakeAt').aboveOrEqual(since).toArray(),
      db.measurements.where('kind').equals('weight').toArray(),
      db.meals.where('recordedAt').aboveOrEqual(since).toArray(),
      db.water.where('recordedAt').aboveOrEqual(since).toArray(),
      db.checkins.where('recordedAt').aboveOrEqual(since).toArray(),
    ])
    return weekReview({ injuries, symptoms, sessions, prescriptions, activity, sleep, measurements, meals, water, checkins, profile: profile ?? undefined }, from)
  }, [from, profile])
  if (!rows) return null

  const label = `${formatShortDate(from)} – ${formatShortDate(from + 6 * DAY)}`
  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Your Week" subtitle={label} back="/" />
      <Section>
        <Chips options={[{ value: 'this', label: 'This Week' }, { value: 'last', label: 'Last Week' }]} value={which} onChange={setWhich} />
      </Section>
      {rows.length === 0 && <p className="px-5 text-muted">Nothing logged that week yet.</p>}
      {GROUPS.map((g) => {
        const list = rows.filter((r) => r.group === g)
        if (!list.length) return null
        return (
          <Section key={g} title={g}>
            <Group>
              {list.map((r) => (
                <div key={r.id} className="cell" data-testid={`week-${r.id}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block">{r.label}</span>
                    <span className="block text-[0.9375rem] font-semibold">{r.now}</span>
                    {r.before && <span className="block text-[0.8125rem] text-muted">Week before: {r.before}</span>}
                  </span>
                  {r.dir && <span className={`shrink-0 text-[0.875rem] font-semibold ${TONE[r.dir]}`}>{WORD[r.dir]}</span>}
                </div>
              ))}
            </Group>
          </Section>
        )
      })}
      <p className="section-footer px-5">From your log, compared with the week before. For what the numbers might mean, ask in Insights.</p>
    </div>
  )
}
