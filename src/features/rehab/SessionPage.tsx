import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Check, Plus, X } from 'lucide-react'
import { db, type Exercise, type Injury, type SessionItem } from '../../db/db'
import { isOpenInjury, useExerciseMap, useExercises, useInjuries, useMeta } from '../../db/hooks'
import { alive, getMeta, restore, save, setMeta, softDelete } from '../../db/repo'
import { Field, Group, PickerRow } from '../../components/ui'
import { formatTime } from '../../lib/dates'
import { haptic } from '../../lib/haptics'
import { useBack } from '../../lib/nav'
import { requestPersistence } from '../../lib/platform'
import { newBests } from '../../lib/fitness'
import { DRAFT_KEY, FLARE_KEY, flareItems, itemDone, itemsFromPlan, sessionStats, WORKOUT_DRAFT_KEY, type Flare, type SessionDraft } from '../../lib/rehab'
import { toast } from '../../lib/toast'
import { DeleteRow, SheetForm } from '../log/shared'
import { AdjustNotes } from './AdjustNotes'
import { CompactScale } from './components'
import { RestTimer } from './RestTimer'
import { ExerciseAnimation, hasAnimation } from './ExerciseAnimation'

export function SessionPage() {
  const [params] = useSearchParams()
  const editId = params.get('id') ?? undefined
  const injuryParam = params.get('injury') ?? undefined
  const workoutParam = params.get('workout') ?? undefined
  const back = useBack('/rehab', 'sheet-down')
  const exercises = useExerciseMap()
  const library = useExercises()
  const open = useInjuries()?.filter(isOpenInjury) ?? []
  const flare = useMeta<Flare | null>(FLARE_KEY)
  const [s, setS] = useState<SessionDraft>()
  const recordedAt = useRef<number>(undefined)
  const touched = useRef(false)
  const [restUntil, setRestUntil] = useState<number>()
  // A workout (fitness) keeps its own draft, so it never overwrites a rehab session in progress.
  const workout = !!workoutParam || s?.kind === 'workout'
  const draftKey = workout ? WORKOUT_DRAFT_KEY : DRAFT_KEY

  useEffect(() => {
    ;(async () => {
      if (editId) {
        const x = await db.sessions.get(editId)
        if (x) {
          recordedAt.current = x.recordedAt
          setS({ id: x.id, startedAt: x.startedAt, injuryId: x.injuryId, painBefore: x.painBefore, painAfter: x.painAfter, items: x.items, notes: x.notes, kind: x.kind, workoutId: x.workoutId, name: x.name, effort: x.effort })
        }
        return
      }
      const draft = await getMeta<SessionDraft>(workoutParam ? WORKOUT_DRAFT_KEY : DRAFT_KEY)
      if (draft && (!workoutParam || draft.workoutId === workoutParam)) return setS(draft)
      const flaring = !!(await getMeta<Flare | null>(FLARE_KEY))
      if (workoutParam) {
        const w = await db.workouts.get(workoutParam)
        const items = (w?.items ?? []).map((i) => ({ exerciseId: i.exerciseId, sets: Array.from({ length: i.sets }, () => ({ amount: i.target, load: i.load, done: false })) }))
        return setS({ startedAt: Date.now(), kind: 'workout', workoutId: workoutParam, name: w?.name ?? 'Workout', restSeconds: w?.restSeconds ?? 90, items: flaring ? flareItems(items) : items })
      }
      const plan = (await db.prescriptions.toArray()).filter(alive)
      const items = itemsFromPlan(plan, injuryParam)
      // During a flare-up, a new session starts at half the usual sets.
      setS({ startedAt: Date.now(), injuryId: injuryParam, items: flaring ? flareItems(items) : items })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId])

  // New sessions are saved as a draft on every change, so nothing is lost if the app closes.
  useEffect(() => {
    if (s && touched.current && !editId) void setMeta(draftKey, s)
  }, [s, editId, draftKey])

  if (!s || !library) return null

  const update = (fn: (d: SessionDraft) => SessionDraft) => {
    touched.current = true
    setS((d) => fn(d!))
  }
  const updateItem = (index: number, fn: (i: SessionItem) => SessionItem) =>
    update((d) => ({ ...d, items: d.items.map((it, k) => (k === index ? fn(it) : it)) }))
  const doneCount = s.items.filter(itemDone).length
  const available = library.filter((e) => !s.items.some((i) => i.exerciseId === e.id))

  function addExercise(exerciseId: string) {
    const e = exercises.get(exerciseId)
    const amount = e?.category === 'cardio' ? 1200 : e?.mode === 'time' ? 30 : 10
    update((d) => ({ ...d, items: [...d.items, { exerciseId, sets: Array.from({ length: e?.category === 'cardio' ? 1 : 3 }, () => ({ amount, done: false })) }] }))
  }

  async function finish() {
    haptic()
    const before = (await db.sessions.toArray()).filter((x) => x.id !== s!.id)
    const session = {
      id: s!.id,
      startedAt: s!.startedAt,
      recordedAt: recordedAt.current ?? Date.now(),
      injuryId: s!.injuryId,
      painBefore: s!.painBefore,
      painAfter: s!.painAfter,
      items: s!.items,
      notes: s!.notes?.trim() || undefined,
      ...(workout && { kind: 'workout' as const, workoutId: s!.workoutId, name: s!.name, effort: s!.effort }),
      source: 'user' as const,
    }
    await save(db.sessions, session)
    if (!editId) await db.meta.delete(draftKey)
    void requestPersistence()
    const bests = editId ? [] : newBests(before, session, exercises)
    if (bests.length) toast(`New personal best! ${bests.join(' · ')}`)
    else if (workout) toast(editId ? 'Workout updated' : `Workout saved · ${sessionStats(session).minutes} min`)
    else toast(editId ? 'Session updated' : `Session saved · ${doneCount} ${doneCount === 1 ? 'exercise' : 'exercises'}`)
    back()
  }

  function close() {
    if (!editId && touched.current) toast('Session kept as a draft')
    back()
  }

  async function discard() {
    if (!confirm('Discard this session? Sets you ticked off will be lost.')) return
    await db.meta.delete(draftKey)
    back()
  }

  async function remove() {
    await softDelete(db.sessions, editId!)
    toast('Session deleted', { label: 'Undo', onClick: () => restore(db.sessions, editId!) })
    back()
  }

  return (
    <SheetForm title={workout ? (s.name ?? 'Workout') : editId ? 'Edit Session' : 'Rehab Session'} canSave={doneCount > 0} onSubmit={finish} onClose={close}>
      <p className="-mt-2 px-1 text-[0.875rem] text-muted">
        Started {formatTime(s.startedAt)} · {doneCount} of {s.items.length} exercises done
      </p>
      {flare && !editId && (
        <p className="card px-4 py-3 text-[0.9375rem]" data-testid="flare-session">
          <span className="font-semibold">Flare-up: </span>half the usual sets today. Keep pain during at 3/10 or below, and skip anything that sharpens it.
        </p>
      )}

      <CompactScale label="Pain Before" value={s.painBefore} onChange={(v) => update((d) => ({ ...d, painBefore: v }))} />

      {s.items.length === 0 && (
        <p className="card p-4 text-muted">{workout ? 'No exercises yet. Add some below.' : 'Nothing planned yet. Add an exercise below, or build your plan from the Rehab tab.'}</p>
      )}

      {s.items.map((item, index) => (
        <ItemCard
          key={item.exerciseId}
          item={item}
          exercise={exercises.get(item.exerciseId)}
          injuries={open}
          workout={workout}
          onSetDone={() => workout && setRestUntil(Date.now() + (s.restSeconds ?? 90) * 1000)}
          onChange={(fn) => updateItem(index, fn)}
          onRemove={() => update((d) => ({ ...d, items: d.items.filter((_, k) => k !== index) }))}
        />
      ))}

      {available.length > 0 && (
        <Group>
          <PickerRow label="Add Exercise" value={undefined} placeholder="Choose" options={available.map((e) => ({ value: e.id, label: e.name }))} onChange={addExercise} />
        </Group>
      )}

      <CompactScale label="Pain After" value={s.painAfter} onChange={(v) => update((d) => ({ ...d, painAfter: v }))} />

      {workout && (
        <div>
          <CompactScale label="How Hard Was It?" min={1} value={s.effort} onChange={(v) => update((d) => ({ ...d, effort: v }))} />
          <p className="section-footer">1 = very easy · 5 = hard but steady · 10 = all-out. Around 5–7 builds fitness without overdoing it.</p>
        </div>
      )}

      {restUntil && <RestTimer until={restUntil} onAdd={(sec) => setRestUntil((u) => (u ?? Date.now()) + sec * 1000)} onDone={() => setRestUntil(undefined)} />}

      <Field label="Notes">
        <textarea className="input min-h-20" value={s.notes ?? ''} onChange={(e) => update((d) => ({ ...d, notes: e.target.value }))} placeholder="Optional — how it felt, what was hard" />
      </Field>

      {editId ? <DeleteRow label="Delete Session" onDelete={remove} /> : touched.current && <DeleteRow label="Discard Session" onDelete={discard} />}
    </SheetForm>
  )
}

function ItemCard({ item, exercise, injuries, workout, onSetDone, onChange, onRemove }: {
  item: SessionItem
  exercise?: Exercise
  injuries: Injury[]
  workout: boolean
  onSetDone: () => void
  onChange: (fn: (i: SessionItem) => SessionItem) => void
  onRemove: () => void
}) {
  const timed = exercise?.mode === 'time'
  // Cardio in minutes (stored as seconds, like every timed exercise)
  const minutes = exercise?.category === 'cardio'
  const name = exercise?.name ?? 'Removed exercise'
  const showLoad = item.sets.some((x) => x.load !== undefined) || (workout && !timed)
  const setAt = (k: number, patch: Partial<SessionItem['sets'][number]>) =>
    onChange((i) => ({ ...i, sets: i.sets.map((x, j) => (j === k ? { ...x, ...patch } : x)) }))
  const done = item.sets.filter((x) => x.done).length
  const [showHow, setShowHow] = useState(false)

  return (
    <section aria-label={name}>
      <div className="flex items-end justify-between px-1 pb-1.5">
        <div className="min-w-0">
          <h3 className="truncate text-[1.0625rem] font-semibold">{name}</h3>
          <p className="text-[0.8125rem] text-muted">{done} of {item.sets.length} sets</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasAnimation(item.exerciseId) && (
            <button type="button" onClick={() => setShowHow((v) => !v)} aria-expanded={showHow} className="h-7 rounded-full bg-fill px-3 text-[0.8125rem] font-semibold text-accent">
              {showHow ? 'Hide' : 'How to'}
            </button>
          )}
          <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="flex h-7 w-7 items-center justify-center rounded-full bg-fill text-muted">
            <X size={14} strokeWidth={2.6} />
          </button>
        </div>
      </div>
      {showHow && <div className="card mb-2 p-3"><ExerciseAnimation exerciseId={item.exerciseId} name={name} compact /></div>}
      <AdjustNotes exerciseId={item.exerciseId} injuries={injuries} className="mb-2" />
      <Group>
        {item.sets.map((set, k) => (
          <div key={k} className="cell !py-2">
            <span className="w-12 text-[0.875rem] text-muted">Set {k + 1}</span>
            {minutes ? (
              <NumField label={`${name} set ${k + 1} minutes`} value={Math.round(set.amount / 6) / 10} unit="min" onChange={(v) => setAt(k, { amount: Math.round((v ?? 0) * 60) })} />
            ) : (
              <NumField label={`${name} set ${k + 1} ${timed ? 'seconds' : 'reps'}`} value={set.amount} unit={timed ? 's' : 'reps'} onChange={(v) => setAt(k, { amount: v ?? 0 })} />
            )}
            {showLoad && <NumField label={`${name} set ${k + 1} load`} value={set.load} unit="kg" onChange={(v) => setAt(k, { load: v })} />}
            <span className="flex-1" />
            <button
              type="button"
              aria-label={`${name} set ${k + 1} done`}
              aria-pressed={set.done}
              onClick={() => {
                if (!set.done) {
                  haptic()
                  onSetDone()
                }
                setAt(k, { done: !set.done })
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 ${set.done ? 'bg-tile-green text-white' : 'border-2 border-line text-transparent'}`}
            >
              {set.done && <Check size={20} strokeWidth={3} className="animate-check" />}
            </button>
          </div>
        ))}
        <div className="cell !py-2">
          <button type="button" className="flex items-center gap-1 text-[0.9375rem] font-medium text-accent" onClick={() => onChange((i) => ({ ...i, sets: [...i.sets, { ...(i.sets[i.sets.length - 1] ?? { amount: timed ? 30 : 10 }), done: false }] }))}>
            <Plus size={17} /> Add Set
          </button>
          <span className="flex-1" />
          <label className="flex items-center gap-1.5 text-[0.875rem] text-muted">
            Pain during
            <select
              className="rounded-lg bg-fill px-2 py-1 text-ink"
              value={item.painDuring ?? ''}
              onChange={(e) => onChange((i) => ({ ...i, painDuring: e.target.value === '' ? undefined : Number(e.target.value) }))}
              aria-label={`${name} pain during`}
            >
              <option value="">—</option>
              {Array.from({ length: 11 }, (_, n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      </Group>
    </section>
  )
}

/** Small numeric field that allows typing decimals like "2.5". */
function NumField({ label, value, unit, onChange }: { label: string; value: number | undefined; unit: string; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => {
    if (parseFloat(text.replace(',', '.')) !== value) setText(value === undefined ? '' : String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <label className="flex items-baseline gap-1 rounded-lg bg-fill px-2 py-1">
      <input
        aria-label={label}
        inputMode="decimal"
        className="font-rounded w-9 bg-transparent text-center font-semibold outline-none"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const n = parseFloat(e.target.value.replace(',', '.'))
          onChange(Number.isFinite(n) ? n : undefined)
        }}
      />
      <span className="text-[0.75rem] text-muted">{unit}</span>
    </label>
  )
}
