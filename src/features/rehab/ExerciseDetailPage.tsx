import { useMemo } from 'react'
import { useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, TrendingUp } from 'lucide-react'
import { db } from '../../db/db'
import { isOpenInjury, useInjuries, useInjuryMap, usePrescriptions, useSessions } from '../../db/hooks'
import { LineChart, niceMax } from '../../components/LineChart'
import { MLink } from '../../components/MLink'
import { GlassButton, Group, NavBar, Row, Section } from '../../components/ui'
import { formatShortDate } from '../../lib/dates'
import { exerciseProgress, formatFrequency, formatTarget } from '../../lib/rehab'
import { AdjustNotes } from './AdjustNotes'
import { ExerciseAnimation, hasAnimation } from './ExerciseAnimation'

export function ExerciseDetailPage() {
  const { id = '' } = useParams()
  const exercise = useLiveQuery(() => db.exercises.get(id), [id])
  const prescriptions = usePrescriptions()
  const sessions = useSessions()
  const injuries = useInjuryMap()
  const open = useInjuries()?.filter(isOpenInjury) ?? []
  const progress = useMemo(() => (sessions ? exerciseProgress(sessions, id) : undefined), [sessions, id])

  if (exercise === undefined || !prescriptions || !progress) return null
  if (!exercise || exercise.deletedAt) return <NavBar title="Exercise Not Found" back="/rehab" />

  const plan = prescriptions.find((p) => p.exerciseId === id)
  const recent = progress.points.slice(-20)
  const unit = progress.metric === 'load' ? 'kg' : exercise.mode === 'time' ? 's' : 'reps'
  const metricLabel = progress.metric === 'load' ? 'Heaviest Load' : exercise.mode === 'time' ? 'Total Time' : 'Total Reps'
  const max = niceMax(Math.max(...recent.map((p) => p.value), 1))
  const first = recent[0]
  const last = recent[recent.length - 1]

  return (
    <div className="space-y-7 pb-4">
      <NavBar
        title={exercise.name}
        subtitle={[exercise.bodyRegion, exercise.equipment].filter(Boolean).join(' · ')}
        back="/rehab"
        trailing={!exercise.builtin ? <GlassButton label="Edit exercise" to={`/rehab/exercises/${id}/edit`}><span className="px-1.5">Edit</span></GlassButton> : undefined}
      />

      {(exercise.instructions || hasAnimation(id)) && (
        <Section prominent title="How To" footer="General guidance. Follow your clinician's instructions, and stop if pain rises sharply.">
          <div className="card p-4">
            <ExerciseAnimation exerciseId={id} name={exercise.name} />
            {exercise.instructions && <p className={`leading-relaxed ${hasAnimation(id) ? 'mt-3 border-t border-line pt-3' : ''}`}>{exercise.instructions}</p>}
            <AdjustNotes exerciseId={id} injuries={open} className="mt-3" />
          </div>
        </Section>
      )}

      {plan ? (
        <Section title="Your Plan" footer={plan.notes}>
          <Group>
            <Row title="Target" value={formatTarget(plan, exercise.mode)} />
            <Row title="How Often" value={formatFrequency(plan)} />
            {plan.injuryId && <Row title="For" value={injuries.get(plan.injuryId)?.name ?? 'Removed injury'} />}
            {!plan.active && <Row title="Status" value="Paused" />}
            <Row title="Edit Plan" tone="accent" to={`/rehab/plan/${plan.id}/edit`} />
          </Group>
        </Section>
      ) : (
        <Section>
          <MLink to={`/rehab/plan/new?exercise=${id}`} className="btn btn-primary w-full"><Plus size={20} /> Add to Plan</MLink>
        </Section>
      )}

      <Section prominent title="Progress">
        <div className="card p-4">
          <div className="mb-1 flex items-center gap-1.5 text-[0.8125rem] font-semibold text-muted uppercase">
            <TrendingUp size={15} strokeWidth={2.4} className="text-tile-green" /> {metricLabel}
          </div>
          <p className="font-rounded text-[2.25rem] leading-none font-semibold">
            <span data-testid="progress-latest">{last ? last.value : '—'}</span>
            <span className="ml-1 text-[0.9375rem] font-medium text-muted">{last ? unit : ''}</span>
          </p>
          {first && last && recent.length > 1 && (
            <p className="mt-1 text-[0.9375rem] text-muted" data-testid="progress-summary">
              {first.value} → {last.value} {unit} over {recent.length} sessions
            </p>
          )}
          <div className="mt-3 -mx-1">
            <LineChart
              points={recent.map((p) => ({ key: p.sessionId, value: p.value, caption: formatShortDate(p.ms) }))}
              max={max}
              ticks={[0, max / 2, max]}
              format={(v) => String(+v.toFixed(1))}
              startLabel={first ? formatShortDate(first.ms) : ''}
              endLabel={last ? formatShortDate(last.ms) : ''}
              summary={last ? `${metricLabel} over the last ${recent.length} sessions, latest ${last.value} ${unit}.` : 'No sessions yet.'}
              empty="Complete a session to see progress"
            />
          </div>
        </div>
      </Section>
    </div>
  )
}
