import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Scale } from 'lucide-react'
import { db } from '../../db/db'
import { useProfile } from '../../db/hooks'
import { alive } from '../../db/repo'
import { LineChart } from '../../components/LineChart'
import { MLink } from '../../components/MLink'
import { EmptyState, GlassButton, Group, NavBar, Row, Section } from '../../components/ui'
import { convertUnit, weightKg } from '../../lib/constants'
import { bmi, bmiRange } from '../../lib/daily'
import { daysAgo, formatMediumDate, formatShortDate, relativeAge } from '../../lib/dates'

const round1 = (n: number) => Math.round(n * 10) / 10

/** Weight over time, against a goal, with BMI when the height is known. */
export function WeightPage() {
  const profile = useProfile()
  const readings = useLiveQuery(async () => (await db.measurements.where('kind').equals('weight').toArray()).filter(alive).sort((a, b) => a.recordedAt - b.recordedAt), [])
  if (!readings) return null

  const log = <GlassButton label="Log weight" to="/log/measurement?kind=weight"><Plus size={24} strokeWidth={2.2} /></GlassButton>
  if (!readings.length) {
    return (
      <div className="space-y-7 pb-4">
        <NavBar title="Weight" back="/" trailing={log} />
        <EmptyState icon={Scale} title="No weight logged yet" body="Weigh yourself at the same time each day — first thing in the morning is easiest — and log it here." action={<MLink to="/log/measurement?kind=weight" className="btn btn-primary"><Plus size={20} /> Log Weight</MLink>} />
      </div>
    )
  }

  const latest = readings[readings.length - 1]
  const unit = latest.unit
  const inUnit = (m: { value: number; unit: string }) => convertUnit(m.value, m.unit, unit) // one unit on screen, whatever each was logged in
  const monthAgo = [...readings].reverse().find((m) => m.recordedAt <= daysAgo(30))
  const change = monthAgo ? round1(inUnit(latest) - inUnit(monthAgo)) : undefined
  const kg = weightKg(latest)
  const goal = profile?.weightGoal
  const toGoal = kg !== undefined && goal ? round1(kg - goal) : undefined
  const b = kg !== undefined && profile?.height ? bmi(kg, profile.height) : undefined

  const shown = readings.filter((m) => m.recordedAt >= daysAgo(89))
  const values = shown.map(inUnit)
  const lo = Math.floor(Math.min(...values) - 1)
  const hi = Math.ceil(Math.max(...values) + 1)

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Weight" back="/" trailing={log} />

      <Section>
        <div className="card p-4">
          <p className="font-rounded text-[2.75rem] leading-none font-semibold">
            <span data-testid="weight-latest">{latest.value}</span>
            <span className="ml-1 text-[1.0625rem] font-medium text-muted">{unit}</span>
          </p>
          <p className="mt-1 text-[0.875rem] text-muted">{relativeAge(latest.recordedAt)}{latest.method ? ` · ${latest.method}` : ''}</p>
          {change !== undefined && (
            <p className="mt-2 text-[0.9375rem] font-medium">{change === 0 ? 'Same as a month ago' : `${Math.abs(change)} ${unit} ${change < 0 ? 'less' : 'more'} than a month ago`}</p>
          )}
          {toGoal !== undefined && (
            <p className="text-[0.9375rem] text-muted" data-testid="weight-goal">
              {Math.abs(toGoal) < 0.1 ? `At your goal of ${goal} kg` : `${Math.abs(toGoal)} kg ${toGoal > 0 ? 'above' : 'below'} your goal of ${goal} kg`}
            </p>
          )}
        </div>
      </Section>

      <Section prominent title="Last 90 Days">
        <div className="card px-2 pt-3 pb-2">
          <LineChart
            points={shown.map((m) => ({ key: m.id, value: inUnit(m), caption: formatShortDate(m.recordedAt) }))}
            min={lo}
            max={hi}
            ticks={[lo, Math.round((lo + hi) / 2), hi]}
            format={(v) => String(round1(v))}
            startLabel={formatShortDate(shown[0].recordedAt)}
            endLabel={formatShortDate(latest.recordedAt)}
            summary={`Weight over the last 90 days: from ${values[0]} to ${values[values.length - 1]} ${unit}.`}
          />
        </div>
      </Section>

      <Section title="Body Mass Index" footer="BMI doesn’t tell muscle from fat. For people of South Asian background, WHO suggests health risks start rising from a BMI of 23.">
        <Group>
          {b !== undefined ? (
            <Row title="BMI" value={<span className="font-semibold text-ink" data-testid="bmi">{b}</span>} subtitle={`WHO range ${bmiRange(b)}`} />
          ) : (
            <Row title="Add your height to see BMI" tone="accent" to="/goals" />
          )}
          <Row title="Goal Weight" value={goal ? `${goal} kg` : 'Not set'} to="/goals" />
        </Group>
      </Section>

      <Section title="Recent">
        <Group>
          {[...readings].reverse().slice(0, 10).map((m) => (
            <Row key={m.id} title={`${m.value} ${m.unit}`} subtitle={[formatMediumDate(m.recordedAt), m.method].filter(Boolean).join(' · ')} to={`/log/measurement?id=${m.id}`} />
          ))}
        </Group>
      </Section>
    </div>
  )
}
