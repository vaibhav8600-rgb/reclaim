import { useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardList, Droplet, ShieldCheck, Sparkles, Utensils } from 'lucide-react'
import type { AiOutput } from '../../../shared/ai'
import { db, type Exercise, type Prescription } from '../../db/db'
import { isOpenInjury, useExerciseMap, useFacts, useInjuries, usePrescriptions, useProfile, useSessions } from '../../db/hooks'
import { alive, save, setMeta } from '../../db/repo'
import { AiAction } from '../../components/ai'
import { MLink } from '../../components/MLink'
import { EmptyState, Group, IconTile, NavBar, Row, Section, Toggle } from '../../components/ui'
import { runAi } from '../../lib/ai'
import { buildPlanContext } from '../../lib/aiContext'
import { daysAgo, relativeAge } from '../../lib/dates'
import { EXERCISE_GUIDES, GUIDELINES, type GuidelineId } from '../../lib/guide'
import { useGo } from '../../lib/nav'
import { clampDose, dailyTargets, weeklyCheck, type Check } from '../../lib/plan'
import { formatFrequency, formatTarget } from '../../lib/rehab'
import { toast } from '../../lib/toast'
import { ExerciseAnimation } from '../rehab/ExerciseAnimation'

export interface StoredPlan {
  result: AiOutput<'recovery-plan'>
  at: number
  acceptedAt?: number
}

const VERDICT: Record<Check['verdict'], { label: string; tone: string }> = {
  progress: { label: 'Ready to Progress', tone: 'bg-accent-soft text-accent' },
  hold: { label: 'Keep Going', tone: 'bg-fill text-muted' },
  ease: { label: 'Ease Off', tone: 'bg-sev-1 text-sev-1-ink' },
  new: { label: 'Not Started', tone: 'bg-fill text-muted' },
}

/**
 * A draft recovery plan: exercises the AI chose from the vetted library (doses kept inside its ranges), daily
 * protein and water targets from published ranges (never the AI's), a weekly check of each exercise from the
 * logs, and safety rules. Nothing changes until "Use This Plan".
 */
export function PlanPage() {
  const go = useGo()
  // null once loaded and there's no plan (undefined only while loading, so nothing flashes)
  const plan = useLiveQuery(async () => ((await db.meta.get('recoveryPlan'))?.value as StoredPlan | undefined) ?? null, [])
  const injuries = useInjuries()
  const exercises = useExerciseMap()
  const prescriptions = usePrescriptions()
  const sessions = useSessions(daysAgo(7))
  const facts = useFacts()
  const profile = useProfile()
  const weight = useLiveQuery(async () => (await db.measurements.where('kind').equals('weight').toArray()).filter((m) => alive(m) && m.unit === 'kg').sort((a, b) => b.recordedAt - a.recordedAt)[0], [])
  const [writing, setWriting] = useState<Partial<AiOutput<'recovery-plan'>>>()
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [setGoals, setSetGoals] = useState(true)

  if (!injuries || !prescriptions || !sessions || !facts || plan === undefined) return null
  const open = injuries.filter(isOpenInjury)
  if (!open.length) {
    return (
      <div className="space-y-7 pb-4">
        <NavBar title="Recovery Plan" back="/" />
        <EmptyState icon={ClipboardList} title="No current injuries" body="Add the injury you’re recovering from, and a plan can be drafted from it, your records and your logs." action={<MLink to="/injuries/new" className="btn btn-primary">Add Injury</MLink>} />
      </div>
    )
  }

  const regions = new Set(open.map((i) => i.bodyRegion))
  const activeByExercise = new Map(prescriptions.filter((p) => p.active).map((p) => [p.exerciseId, p]))
  // Only exercises from the vetted library that suit an open injury; doses clamped to the vetted ranges.
  const items = (plan?.result.exercises ?? [])
    .filter((x, i, all) => all.findIndex((y) => y.exerciseId === x.exerciseId) === i)
    .flatMap((x) => {
      const exercise = exercises.get(x.exerciseId)
      const guide = EXERCISE_GUIDES[x.exerciseId]
      if (!exercise || !alive(exercise) || !guide || !guide.for.some((r) => regions.has(r))) return []
      const injury = open.find((i) => i.id === x.injuryId && guide.for.includes(i.bodyRegion)) ?? open.find((i) => guide.for.includes(i.bodyRegion))
      return [{ exercise, guide, injury, dose: clampDose(guide, x), why: x.why, existing: activeByExercise.get(x.exerciseId) }]
    })
  const toAdd = items.filter((i) => !i.existing && !skipped.has(i.exercise.id))
  const targets = dailyTargets(weight?.value, facts)
  const goalsChange = !!(targets.protein && targets.protein.target !== profile?.proteinTarget) || !!(targets.water && targets.water.target !== profile?.waterTarget)
  const checks = prescriptions.filter((p) => p.active).map((p) => ({ p, exercise: exercises.get(p.exerciseId), check: weeklyCheck(p, sessions) }))
  const refs = new Set<GuidelineId>(['painMonitoring', 'protein', 'water', ...items.flatMap((i) => i.guide.refs)])

  async function create() {
    try {
      const result = await runAi('recovery-plan', { context: await buildPlanContext() }, setWriting)
      await setMeta('recoveryPlan', { result, at: Date.now() } satisfies StoredPlan)
      setSkipped(new Set())
    } finally {
      setWriting(undefined)
    }
  }

  async function accept() {
    for (const i of toAdd) {
      await save(db.prescriptions, { exerciseId: i.exercise.id, injuryId: i.injury?.id, ...i.dose, active: true, notes: `From your recovery plan: ${i.why}` })
    }
    if (setGoals && goalsChange) {
      const me = await db.profile.get('me')
      await save(db.profile, { id: 'me', name: me?.name ?? '', ...(targets.protein && { proteinTarget: targets.protein.target }), ...(targets.water && { waterTarget: targets.water.target }) })
    }
    await setMeta('recoveryPlan', { ...plan!, acceptedAt: Date.now() } satisfies StoredPlan)
    toast(toAdd.length ? `Added ${toAdd.length} ${toAdd.length === 1 ? 'exercise' : 'exercises'} to your rehab plan` : 'Plan saved')
    go('/rehab')
  }

  const shown = writing ?? plan?.result
  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Recovery Plan" subtitle={plan ? `${plan.acceptedAt ? 'In use' : 'Draft'} · created ${relativeAge(plan.at)}` : undefined} back="/" />

      {!shown ? (
        <Section prominent title="Your Plan">
          <div className="card p-4">
            <p className="flex items-start gap-2 text-[0.9375rem]">
              <Sparkles size={17} className="mt-0.5 shrink-0 text-accent" />
              <span>A draft plan from your injuries, pain logs, rehab so far and Health Profile: exercises chosen from Reclaim’s checked library (each from a published clinical guideline), daily protein and water targets, and what to watch for. Show it to your physio before you start.</span>
            </p>
          </div>
        </Section>
      ) : (
        <>
          <Section prominent title="Your Plan">
            <div className="card animate-pop p-4" aria-live={writing ? 'polite' : undefined}>
              <p className="flex items-start gap-2 leading-relaxed">
                <Sparkles size={18} className="mt-1 shrink-0 text-accent" />
                <span>{shown.summary || '…'}</span>
              </p>
              <Bullets title="Focus for the Next 2 Weeks" items={shown.focus} />
              <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-2 text-[0.75rem] text-faint">
                {writing ? <><Sparkles size={12} className="animate-pulse" /> Writing…</> : 'A draft by AI from Reclaim’s checked exercise library. Show it to your physio before you start.'}
              </p>
            </div>
          </Section>

          {!writing && (
            <>
              <Section prominent title="Exercises" footer={items.length ? 'Doses are kept inside each exercise’s usual range. Your physio’s prescription always comes first.' : undefined}>
                {items.length ? (
                  <div className="space-y-3">
                    {items.map((i) => (
                      <div key={i.exercise.id} className={`card p-4 transition-opacity ${!i.existing && skipped.has(i.exercise.id) ? 'opacity-55' : ''}`}>
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <MLink to={`/rehab/exercises/${i.exercise.id}`} className="block font-semibold text-accent">{i.exercise.name}</MLink>
                            <p className="text-[0.875rem] text-muted">{[formatTarget(i.dose, i.exercise.mode), formatFrequency(i.dose), i.injury && `for ${i.injury.name}`].filter(Boolean).join(' · ')}</p>
                          </div>
                          {i.existing ? (
                            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[0.75rem] font-semibold text-accent">In Your Plan</span>
                          ) : (
                            <input
                              type="checkbox"
                              className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-accent)]"
                              checked={!skipped.has(i.exercise.id)}
                              onChange={(e) => setSkipped((s) => { const n = new Set(s); if (e.target.checked) n.delete(i.exercise.id); else n.add(i.exercise.id); return n })}
                              aria-label={`Add ${i.exercise.name}`}
                            />
                          )}
                        </div>
                        <div className="mt-3"><ExerciseAnimation exerciseId={i.exercise.id} name={i.exercise.name} compact /></div>
                        {i.why && <p className="mt-2 text-[0.9375rem]">{i.why}</p>}
                        <p className="mt-2 text-[0.875rem] text-muted"><span className="font-semibold">Progress: </span>{i.guide.progression}</p>
                        {i.guide.caution && <p className="mt-1 text-[0.875rem] text-muted"><span className="font-semibold">Note: </span>{i.guide.caution}</p>}
                        <p className="mt-2 text-[0.75rem] text-faint">Source: {i.guide.refs.map((r) => GUIDELINES[r].short).join(' · ')}</p>
                        {i.existing && <p className="mt-1 text-[0.75rem] text-faint">Already in your rehab plan — kept as it is.</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-1 text-muted">Reclaim’s checked library doesn’t cover your injuries yet, so no exercises were suggested. Your physio can add them in Rehab.</p>
                )}
              </Section>

              {checks.length > 0 && <WeekChecks checks={checks} />}

              <Section prominent title="Daily Targets" footer="Calories aren’t set: they depend on your height, age, sex and activity. A dietitian can work them out with you.">
                <Group inset="3.625rem">
                  <TargetRow icon={Utensils} color="purple" title="Protein" unit="g" value={targets.protein} hold={targets.hold.protein} weight={weight?.value} basis="1.6 g per kg" />
                  <TargetRow icon={Droplet} color="blue" title="Water" unit="ml" value={targets.water} hold={targets.hold.water} weight={weight?.value} basis="about 33 ml per kg" />
                  {goalsChange && <Toggle label="Set These as My Daily Goals" checked={setGoals} onChange={setSetGoals} />}
                </Group>
              </Section>

              <Section prominent title="Keep It Safe">
                <div className="card p-4">
                  <ul className="list-disc space-y-1.5 pl-5 text-[0.9375rem]">
                    <li>Pain during an exercise up to 5/10 is OK if it settles by the next morning. Above that, or if it’s worse the next day, do less.</li>
                    <li>Stop and contact a clinician promptly for sudden severe pain, numbness or weakness that spreads, a hot swollen joint with fever, or loss of bladder or bowel control.</li>
                    {shown.cautions?.filter(Boolean).map((c, n) => <li key={n}>{c}</li>)}
                  </ul>
                </div>
              </Section>

              <Section prominent title="Questions for Your Physio">
                {shown.questions?.length ? (
                  <div className="card p-4">
                    <ul className="list-disc space-y-1 pl-5 text-[0.9375rem]">{shown.questions.map((q, n) => <li key={n}>{q}</li>)}</ul>
                  </div>
                ) : <p className="px-1 text-muted">None suggested.</p>}
              </Section>

              <Section title="Sources" footer="Published clinical guidelines behind the exercises, targets and pain rule. They inform the plan; your clinician decides what’s right for you.">
                <div className="card p-4">
                  <ul className="space-y-2 text-[0.8125rem] text-muted">{[...refs].map((r) => <li key={r}>{GUIDELINES[r].citation}</li>)}</ul>
                </div>
              </Section>

              <Section>
                <div className="space-y-3">
                  {(toAdd.length > 0 || (setGoals && goalsChange)) && (
                    <button type="button" className="btn btn-primary w-full" onClick={accept}>
                      <ShieldCheck size={19} /> Use This Plan
                    </button>
                  )}
                </div>
              </Section>
            </>
          )}
        </>
      )}

      {!shown && checks.length > 0 && <WeekChecks checks={checks} />}

      {/* One AI button, kept mounted while writing so an error from the run can still show. */}
      <Section className={writing ? 'hidden' : ''} footer={plan ? 'Update it every week or two: it uses your latest pain logs, sessions and records.' : undefined}>
        <AiAction label={plan ? 'Update Plan' : 'Create My Plan'} runningLabel="Drafting your plan…" run={create} className={plan ? 'btn btn-quiet w-full' : 'btn btn-primary w-full'} />
      </Section>
    </div>
  )
}

function Bullets({ title, items }: { title: string; items?: ReactNode[] }) {
  const shown = items?.filter(Boolean)
  if (!shown?.length) return null
  return (
    <section className="mt-3">
      <h3 className="text-[0.8125rem] font-semibold text-muted uppercase">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-[0.9375rem]">{shown.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </section>
  )
}

function TargetRow({ icon, color, title, unit, value, hold, weight, basis }: {
  icon: typeof Droplet
  color: string
  title: string
  unit: string
  value?: { target: number; low: number; high: number }
  hold?: string
  weight?: number
  basis: string
}) {
  const n = (v: number) => `${v.toLocaleString()} ${unit}`
  if (hold) return <Row icon={<IconTile icon={icon} color={color} />} title={title} subtitle={hold} />
  if (!value) return <Row icon={<IconTile icon={icon} color={color} />} title={title} subtitle="Log your weight to work this out" to="/log/measurement" />
  // Its own cell rather than a Row: the explanation wraps instead of being cut off.
  return (
    <div className="cell !items-start">
      <IconTile icon={icon} color={color} />
      <span className="min-w-0 flex-1">
        <span className="block">{title}</span>
        <span className="block text-[0.875rem] text-muted">{basis} of {weight} kg (range {value.low.toLocaleString()}–{n(value.high)})</span>
      </span>
      <span className="font-rounded shrink-0 font-semibold tabular-nums">{n(value.target)}</span>
    </div>
  )
}

/** How each exercise in the rehab plan went this week, from the logs (pain-monitoring model). */
function WeekChecks({ checks }: { checks: { p: Prescription; exercise?: Exercise; check: Check }[] }) {
  return (
    <Section prominent title="This Week" footer="From your logs: pain during an exercise up to 5/10 is acceptable if it settles by the next morning. Progress when it’s comfortable; ease off above that.">
      <Group>
        {checks.map(({ p, exercise, check }) => (
          <div key={p.id} className="cell !items-start">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{exercise?.name ?? 'Exercise'}</span>
              <span className="block text-[0.875rem] text-muted">{check.reason}</span>
              {check.verdict === 'progress' && EXERCISE_GUIDES[p.exerciseId] && <span className="mt-0.5 block text-[0.875rem]">Next step: {EXERCISE_GUIDES[p.exerciseId].progression}</span>}
              {check.verdict === 'ease' && <span className="mt-0.5 block text-[0.875rem]">Lower the load or reps, or pause it for a few days and ask your physio.</span>}
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.75rem] font-semibold ${VERDICT[check.verdict].tone}`}>{VERDICT[check.verdict].label}</span>
          </div>
        ))}
      </Group>
    </Section>
  )
}
