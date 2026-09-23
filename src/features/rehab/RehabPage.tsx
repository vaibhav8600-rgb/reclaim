import { Dumbbell, Library, Plus } from 'lucide-react'
import { useExerciseMap, useInjuryMap, usePrescriptions, useSessions } from '../../db/hooks'
import { ENTRY_INSET, EntryRow } from '../../components/EntryRow'
import { MLink } from '../../components/MLink'
import { EmptyState, GlassButton, Group, IconTile, NavBar, Row, Section } from '../../components/ui'
import { PlanRow, WeekCard } from './components'

export function RehabPage() {
  const prescriptions = usePrescriptions()
  const sessions = useSessions()
  const exercises = useExerciseMap()
  const injuries = useInjuryMap()
  if (!prescriptions || !sessions) return null

  const active = prescriptions.filter((p) => p.active)
  const paused = prescriptions.filter((p) => !p.active)
  const byName = (a: (typeof prescriptions)[number], b: (typeof prescriptions)[number]) =>
    (exercises.get(a.exerciseId)?.name ?? '').localeCompare(exercises.get(b.exerciseId)?.name ?? '')

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Rehab" trailing={<GlassButton label="Add exercise" to="/rehab/library"><Plus size={24} strokeWidth={2.2} /></GlassButton>} />

      {prescriptions.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="Add your physio exercises"
          body="Build your plan from the exercise library or add your own — sets, reps and how often, as your physio prescribed."
          action={<MLink to="/rehab/library" className="btn btn-primary"><Library size={19} /> Browse Exercises</MLink>}
        />
      ) : (
        <>
          <Section>
            <WeekCard />
          </Section>

          <Section prominent title="Plan" action={<MLink to="/rehab/library" className="text-accent">Library</MLink>}>
            {active.length ? (
              <Group inset="3.625rem">
                {[...active].sort(byName).map((p) => (
                  <PlanRow key={p.id} p={p} exercise={exercises.get(p.exerciseId)} injury={p.injuryId ? injuries.get(p.injuryId) : undefined} />
                ))}
              </Group>
            ) : (
              <p className="px-1 text-muted">Everything in your plan is paused.</p>
            )}
          </Section>

          {paused.length > 0 && (
            <Section title="Paused">
              <Group inset="3.625rem">
                {[...paused].sort(byName).map((p) => (
                  <PlanRow key={p.id} p={p} exercise={exercises.get(p.exerciseId)} injury={p.injuryId ? injuries.get(p.injuryId) : undefined} />
                ))}
              </Group>
            </Section>
          )}
        </>
      )}

      {sessions.length > 0 && (
        <Section prominent title="Recent Sessions" action={<MLink to="/timeline" className="text-accent">Show All</MLink>}>
          <Group inset={ENTRY_INSET}>
            {sessions.slice(0, 5).map((s) => (
              <EntryRow key={s.id} entry={{ kind: 'session', at: s.recordedAt, item: s }} injuries={injuries} />
            ))}
          </Group>
        </Section>
      )}

      <Section>
        <Group inset="3.625rem">
          <Row icon={<IconTile icon={Library} color="indigo" />} title="Exercise Library" to="/rehab/library" />
        </Group>
      </Section>
    </div>
  )
}
