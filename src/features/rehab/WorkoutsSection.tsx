import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil } from 'lucide-react'
import { db } from '../../db/db'
import { isOpenInjury, useExerciseMap, useInjuries, useMeta } from '../../db/hooks'
import { alive, save } from '../../db/repo'
import { MLink } from '../../components/MLink'
import { Section } from '../../components/ui'
import { cautionsFor, STARTER_WORKOUTS } from '../../lib/fitness'
import { WORKOUT_DRAFT_KEY, type SessionDraft } from '../../lib/rehab'
import { toast } from '../../lib/toast'

/** Saved workouts to start in a tap, a workout in progress to resume, and starter workouts to add. */
export function Workouts() {
  const workouts = useLiveQuery(async () => (await db.workouts.toArray()).filter(alive).sort((a, b) => a.name.localeCompare(b.name)), [])
  const exercises = useExerciseMap()
  const open = useInjuries()?.filter(isOpenInjury) ?? []
  const draft = useMeta<SessionDraft>(WORKOUT_DRAFT_KEY)
  if (!workouts) return null
  const starters = STARTER_WORKOUTS.filter((w) => !workouts.some((x) => x.name === w.name))

  async function addStarter(w: (typeof STARTER_WORKOUTS)[number]) {
    await save(db.workouts, { name: w.name, items: w.items, restSeconds: w.restSeconds })
    toast(`${w.name} added`)
  }

  return (
    <Section
      prominent
      title="Workouts"
      action={<MLink to="/rehab/workouts/new" className="text-accent">New</MLink>}
      footer={open.length ? 'Fitness alongside your rehab. Exercises that load one of your injuries heavily say “ask your physio first”.' : 'Fitness alongside your rehab: strength, cardio and mobility, with a rest timer and personal bests.'}
    >
      <div className="space-y-3">
        {draft?.workoutId && (
          <MLink to={`/rehab/session?workout=${draft.workoutId}`} className="btn btn-primary w-full">Resume {draft.name ?? 'Workout'}</MLink>
        )}
        {workouts.length > 0 && (
          <div className="card rows overflow-hidden">
            {workouts.map((w) => {
              const flagged = w.items.filter((i) => cautionsFor(i.exerciseId, open).some((c) => c.level === 'avoid')).length
              const names = w.items.map((i) => exercises.get(i.exerciseId)?.name).filter(Boolean)
              return (
                <div key={w.id} className="cell">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{w.name}</span>
                    <span className="block truncate text-[0.875rem] text-muted">{flagged ? <span className="text-danger">{flagged} to ask your physio about · </span> : ''}{names.join(', ')}</span>
                  </span>
                  <MLink to={`/rehab/workouts/${w.id}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-muted" aria-label={`Edit ${w.name}`}><Pencil size={15} /></MLink>
                  <MLink to={`/rehab/session?workout=${w.id}`} className="shrink-0 rounded-full bg-accent-soft px-3 py-1.5 text-[0.9375rem] font-semibold text-accent" aria-label={`Start ${w.name}`}>Start</MLink>
                </div>
              )
            })}
          </div>
        )}
        {starters.length > 0 && (
          <div>
            <p className="section-footer !mt-0 mb-2">{workouts.length ? 'More to add:' : 'Start with one of these, then make it your own:'}</p>
            <div className="flex flex-wrap gap-1.5">
              {starters.map((w) => (
                <button key={w.name} type="button" className="chip !min-h-8 !text-[0.875rem]" onClick={() => addStarter(w)}>+ {w.name}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

