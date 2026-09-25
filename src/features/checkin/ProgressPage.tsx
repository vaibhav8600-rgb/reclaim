import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardCheck, Plus } from 'lucide-react'
import { db, type CheckIn } from '../../db/db'
import { LineChart } from '../../components/LineChart'
import { MLink } from '../../components/MLink'
import { EmptyState, GlassButton, Group, NavBar, Row, Section } from '../../components/ui'
import { checkInTrend, direction, pegScore, psfsScore, toleranceLabel } from '../../lib/checkin'
import { formatMediumDate, formatShortDate } from '../../lib/dates'
import { GUIDELINES } from '../../lib/guide'

const WORD = { better: 'Better', worse: 'Worse', same: 'About the same' } as const
const TONE = { better: 'text-tile-green', worse: 'text-danger', same: 'text-muted' } as const

/** How everyday life is going, from the weekly check-ins: first against latest, and the trend. */
export function ProgressPage() {
  const checkins = useLiveQuery(async () => (await db.checkins.orderBy('recordedAt').toArray()).filter((c) => !c.deletedAt), [])
  if (!checkins) return null

  const add = <GlassButton label="New check-in" to="/checkin"><Plus size={24} strokeWidth={2.2} /></GlassButton>
  if (!checkins.length) {
    return (
      <div className="space-y-7 pb-4">
        <NavBar title="How You’re Doing" back="/injuries" trailing={add} />
        <EmptyState icon={ClipboardCheck} title="No check-ins yet" body="Once a week, a minute on how pain affects your days — sitting, walking, sleep and the things you find hard. It shows progress the pain score misses." action={<MLink to="/checkin" className="btn btn-primary">Start a Check-in</MLink>} />
      </div>
    )
  }

  const t = checkInTrend(checkins)
  const change = (label: string, x: { first: number; latest: number; count: number } | undefined, better: 'up' | 'down', threshold: number, show: (v: number) => string) => {
    if (!x) return null
    const dir = x.count > 1 ? direction(x.first, x.latest, better, threshold) : undefined
    return (
      <Row
        key={label}
        title={label}
        subtitle={x.count > 1 ? `${show(x.first)} → ${show(x.latest)}` : show(x.latest)}
        value={dir && <span className={`font-semibold ${TONE[dir]}`} data-testid={`trend-${label}`}>{WORD[dir]}</span>}
      />
    )
  }
  const series = (f: (c: CheckIn) => number | undefined) => checkins.flatMap((c) => (f(c) === undefined ? [] : [{ key: c.id, value: f(c)!, caption: formatShortDate(c.recordedAt) }]))
  const peg = series(pegScore)
  const psfs = series(psfsScore)

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="How You’re Doing" subtitle={`${checkins.length} ${checkins.length === 1 ? 'check-in' : 'check-ins'} since ${formatMediumDate(checkins[0].recordedAt)}`} back="/injuries" trailing={add} />

      <Section title="First vs Latest" footer="A change of 2 points or more on the pain-and-life score or your activities is the kind your clinician counts as real.">
        <Group>
          {change('Pain and life', t.peg, 'down', 2, (v) => `${v}/10`)}
          {change('Your activities', t.psfs, 'up', 2, (v) => `${v}/10`)}
          {change('Sitting', t.sit, 'up', 1, (v) => toleranceLabel(v) ?? `${v} min`)}
          {change('Walking', t.walk, 'up', 1, (v) => toleranceLabel(v) ?? `${v} min`)}
          {change('Nights woken', t.nights, 'down', 1, (v) => `${v} a week`)}
        </Group>
      </Section>

      {peg.length > 1 && (
        <Section prominent title="Pain and Life" footer="Pain, and how much it gets in the way of enjoying life and usual activities — lower is better.">
          <div className="card px-2 pt-3 pb-2">
            <LineChart points={peg} max={10} ticks={[0, 5, 10]} startLabel={peg[0].caption} endLabel={peg[peg.length - 1].caption} summary={`Pain and life score from ${peg[0].value} to ${peg[peg.length - 1].value} out of 10.`} />
          </div>
        </Section>
      )}

      {psfs.length > 1 && (
        <Section prominent title="Your Activities" footer="How well you can do the activities you chose — higher is better.">
          <div className="card px-2 pt-3 pb-2">
            <LineChart points={psfs} max={10} ticks={[0, 5, 10]} startLabel={psfs[0].caption} endLabel={psfs[psfs.length - 1].caption} summary={`Activities score from ${psfs[0].value} to ${psfs[psfs.length - 1].value} out of 10.`} />
          </div>
        </Section>
      )}

      <Section title="Check-ins" footer={`Measures: ${GUIDELINES.peg.short}; ${GUIDELINES.psfs.short}.`}>
        <Group>
          {[...checkins].reverse().slice(0, 12).map((c) => (
            <Row key={c.id} title={formatMediumDate(c.recordedAt)} subtitle={[pegScore(c) !== undefined && `Pain and life ${pegScore(c)}`, psfsScore(c) !== undefined && `Activities ${psfsScore(c)}`, c.nightsWoken !== undefined && `Woken ${c.nightsWoken}×`].filter(Boolean).join(' · ')} />
          ))}
        </Group>
      </Section>
    </div>
  )
}
