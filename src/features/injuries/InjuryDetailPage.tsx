import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useGo } from '../../lib/nav'
import { MLink } from '../../components/MLink'
import { useLiveQuery } from 'dexie-react-hooks'
import { Activity, Plus, Ruler } from 'lucide-react'
import { db, type InjuryStatus } from '../../db/db'
import { useDocuments, useEntries, useExerciseMap, useInjuryMap, usePrescriptions, useSymptomsSince } from '../../db/hooks'
import { DocumentRow } from '../documents/kinds'
import { PlanRow } from '../rehab/components'
import { restore, save, softDelete } from '../../db/repo'
import { ENTRY_INSET, EntryRow } from '../../components/EntryRow'
import { PainChart } from '../../components/PainChart'
import { GlassButton, Group, NavBar, PickerRow, Row, Section, Segmented } from '../../components/ui'
import { INJURY_STATUSES, injuryPlace } from '../../lib/constants'
import { daysAgo, daysBetween, formatMediumDate, fromDayKey } from '../../lib/dates'
import { dailySeries, windowAverage } from '../../lib/stats'
import { toast } from '../../lib/toast'

const RANGES = [
  { value: '14', label: '14D' },
  { value: '30', label: '30D' },
  { value: '90', label: '90D' },
] as const

export function InjuryDetailPage() {
  const { id = '' } = useParams()
  const go = useGo()
  const injury = useLiveQuery(() => db.injuries.get(id), [id])
  const injuryMap = useInjuryMap()
  const [range, setRange] = useState<(typeof RANGES)[number]['value']>('30')
  const days = Number(range)
  const symptoms = useSymptomsSince(daysAgo(days - 1), id)
  const series = useMemo(() => (symptoms ? dailySeries(symptoms, days) : []), [symptoms, days])
  const recent = useEntries({ injuryId: id, limit: 10 })
  const plan = usePrescriptions()?.filter((p) => p.injuryId === id)
  const exercises = useExerciseMap()
  const documents = useDocuments(id)

  if (injury === undefined || !symptoms || !recent) return null
  if (!injury || injury.deletedAt) return <NavBar title="Injury Not Found" back="/injuries" />

  const avg = windowAverage(symptoms, 0, Infinity)
  const dayN = daysBetween(fromDayKey(injury.startDate), Date.now()) + 1

  async function setStatus(status: InjuryStatus) {
    await save(db.injuries, { ...injury!, status })
  }

  async function remove() {
    if (!confirm(`Delete “${injury!.name}”? Entries you logged against it stay in your timeline.`)) return
    await softDelete(db.injuries, id)
    go('/injuries', 'pop', { replace: true })
    toast('Injury deleted', { label: 'Undo', onClick: () => restore(db.injuries, id) })
  }

  const details = [
    ['Diagnosis', injury.diagnosis],
    ['How It Happened', injury.mechanism],
    ['Notes', injury.notes],
  ].filter(([, v]) => v)

  return (
    <div className="space-y-7 pb-4">
      <NavBar
        title={injury.name}
        subtitle={`${injuryPlace(injury)} · Day ${dayN}`}
        back="/injuries"
        trailing={<GlassButton label="Edit injury" to={`/injuries/${id}/edit`}><span className="px-1.5">Edit</span></GlassButton>}
      />

      <Section>
        <Group>
          <PickerRow label="Status" value={injury.status} options={INJURY_STATUSES} onChange={setStatus} />
          <Row title="Started" value={formatMediumDate(fromDayKey(injury.startDate))} />
        </Group>
      </Section>

      <Section prominent title="Pain">
        <div className="card p-4">
          <Segmented options={[...RANGES]} value={range} onChange={setRange} />
          <div className="mt-4 mb-1 flex items-center gap-1.5 text-[0.8125rem] font-semibold text-muted uppercase">
            <Activity size={15} strokeWidth={2.4} className="text-tile-pink" /> Average
          </div>
          <p className="font-rounded text-[2.25rem] leading-none font-semibold">
            <span data-testid="range-avg">{avg === null ? '—' : avg.toFixed(1)}</span>
            <span className="ml-1.5 text-[0.9375rem] font-medium text-muted" data-testid="range-count">
              {symptoms.length} {symptoms.length === 1 ? 'log' : 'logs'} in {days} days
            </span>
          </p>
          <div className="mt-3 -mx-1">
            <PainChart points={series} />
          </div>
        </div>
      </Section>

      <Section>
        <div className="grid grid-cols-2 gap-3">
          <MLink to={`/log/symptom?injury=${id}`} className="btn btn-soft"><Plus size={20} /> Symptom</MLink>
          <MLink to={`/log/measurement?injury=${id}`} className="btn btn-quiet"><Ruler size={19} /> Measure</MLink>
        </div>
      </Section>

      {!!plan?.length && (
        <Section prominent title="Rehab Plan" action={<MLink to={`/rehab/session?injury=${id}`} className="text-accent">Start Session</MLink>}>
          <Group inset="3.625rem">
            {plan.map((p) => <PlanRow key={p.id} p={p} exercise={exercises.get(p.exerciseId)} />)}
          </Group>
        </Section>
      )}

      <Section prominent title="Documents" action={<MLink to={`/documents/new?injury=${id}`} className="text-accent">Add</MLink>}>
        {documents?.length ? (
          <Group inset="3.625rem">
            {documents.map((d) => <DocumentRow key={d.id} doc={d} />)}
          </Group>
        ) : (
          <p className="px-1 text-muted">Scans, reports and letters about this injury.</p>
        )}
      </Section>

      {details.length > 0 && (
        <Section title="Details">
          <Group>
            {details.map(([k, v]) => (
              <div key={k} className="cell !block">
                <p className="text-[0.8125rem] text-muted">{k}</p>
                <p className="whitespace-pre-wrap">{v}</p>
              </div>
            ))}
          </Group>
        </Section>
      )}

      <Section prominent title="Recent" action={<MLink to="/timeline" className="text-accent">Show All</MLink>}>
        {recent.entries.length ? (
          <Group inset={ENTRY_INSET}>
            {recent.entries.map((e) => (
              <EntryRow key={`${e.kind}-${e.item.id}`} entry={e} injuries={injuryMap} hideInjury />
            ))}
          </Group>
        ) : (
          <p className="px-1 text-muted">Nothing logged for this injury yet.</p>
        )}
      </Section>

      <Section>
        <Group>
          <button onClick={remove} className="cell cell-press justify-center text-danger">Delete Injury</button>
        </Group>
      </Section>
    </div>
  )
}
