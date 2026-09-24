import { useSearchParams } from 'react-router'
import { useFacts } from '../../db/hooks'
import { LineChart, niceMax } from '../../components/LineChart'
import { Group, NavBar, Row, Section } from '../../components/ui'
import { formatMediumDate, formatShortDate, fromDayKey } from '../../lib/dates'
import { factKey, factValue } from '../../lib/facts'
import { FlagPill } from './kinds'

/** Every result for one lab test, over time. */
export function LabPage() {
  const [params] = useSearchParams()
  const name = params.get('name') ?? ''
  const facts = useFacts()
  if (!facts) return null

  const results = facts.filter((f) => f.kind === 'lab' && factKey(f.name) === factKey(name)) // newest first
  const unit = results[0]?.unit
  // Chart only numbers in the latest result's unit: mixing units (ng/mL vs nmol/L) would mislead.
  const charted = results.filter((f) => f.value !== undefined && f.unit === unit).reverse()
  const max = niceMax(Math.max(...charted.map((f) => f.value!), 1))

  return (
    <div className="space-y-7 pb-4">
      <NavBar title={results[0]?.name ?? name} subtitle={results.length ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : undefined} back="/health" />

      {charted.length >= 2 && (
        <Section prominent title="Over Time" footer={results[0].range ? `Reference range on the latest report: ${results[0].range}${unit ? ` ${unit}` : ''}. Ranges differ between labs.` : undefined}>
          <div className="card px-2 pt-3 pb-2">
            <LineChart
              points={charted.map((f) => ({ key: f.id, value: f.value!, caption: formatShortDate(fromDayKey(f.date)) }))}
              max={max}
              ticks={[0, max / 2, max]}
              format={(v) => String(+v.toFixed(2))}
              startLabel={formatShortDate(fromDayKey(charted[0].date))}
              endLabel={formatShortDate(fromDayKey(charted[charted.length - 1].date))}
              summary={`${results[0].name}: ${charted.map((f) => `${factValue(f)} on ${formatMediumDate(fromDayKey(f.date))}`).join(', ')}.`}
            />
          </div>
        </Section>
      )}

      <Section prominent title="Results">
        <Group>
          {results.map((f) => (
            <Row
              key={f.id}
              title={
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{factValue(f)}</span>
                  <FlagPill flag={f.flag} />
                </span>
              }
              subtitle={[formatMediumDate(fromDayKey(f.date)), f.range && `range ${f.range}`].filter(Boolean).join(' · ')}
              to={`/health/facts/${f.id}`}
            />
          ))}
        </Group>
      </Section>
    </div>
  )
}
