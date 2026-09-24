import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Check, Plus, X } from 'lucide-react'
import { db, type Exercise, type SessionItem } from '../../db/db'
import { useExerciseMap, useExercises } from '../../db/hooks'
import { alive, getMeta, restore, save, setMeta, softDelete } from '../../db/repo'
import { Field, Group, PickerRow } from '../../components/ui'
import { formatTime } from '../../lib/dates'
import { haptic } from '../../lib/haptics'
import { useBack } from '../../lib/nav'
import { requestPersistence } from '../../lib/platform'
import { DRAFT_KEY, itemDone, itemsFromPlan, type SessionDraft } from '../../lib/rehab'
import { toast } from '../../lib/toast'
import { DeleteRow, SheetForm } from '../log/shared'
import { CompactScale } from './components'
import { ExerciseAnimation, hasAnimation } from './ExerciseAnimation'

export function SessionPage() {
  const [params] = useSearchParams()
  const editId = params.get('id') ?? undefined
  const injuryParam = params.get('injury') ?? undefined
  const back = useBack('/rehab', 'sheet-down')
  const exercises = useExerciseMap()
  const library = useExercises()
  const [s, setS] = useState<SessionDraft>()
  const recordedAt = useRef<number>(undefined)
  const touched = useRef(false)

  useEffect(() => {
    ;(async () => {
      if (editId) {
        const x = await db.sessions.get(editId)
        if (x) {
          recordedAt.current = x.recordedAt
          setS({ id: x.id, startedAt: x.startedAt, injuryId: x.injuryId, painBefore: x.painBefore, painAfter: x.painAfter, items: x.items, notes: x.notes })
        }
        return
      }
      const draft = await getMeta<SessionDraft>(DRAFT_KEY)
      if (draft) return setS(draft)
      const plan = (await db.prescriptions.toArray()).filter(alive)
      setS({ startedAt: Date.now(), injuryId: injuryParam, items: itemsFromPlan(plan, injuryParam) })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId])

  // New sessions are saved as a draft on every change, so nothing is lost if the app closes.
  useEffect(() => {
    if (s && touched.current && !editId) void setMeta(DRAFT_KEY, s)
  }, [s, editId])

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
    update((d) => ({ ...d, items: [...d.items, { exerciseId, sets: Array.from({ length: 3 }, () => ({ amount: e?.mode === 'time' ? 30 : 10, done: false })) }] }))
  }

  async function finish() {
    haptic()
    await save(db.sessions, {
      id: s!.id,
      startedAt: s!.startedAt,
      recordedAt: recordedAt.current ?? Date.now(),
      injuryId: s!.injuryId,
      painBefore: s!.painBefore,
      painAfter: s!.painAfter,
      items: s!.items,
      notes: s!.notes?.trim() || undefined,
      source: 'user',
    })
    if (!editId) await db.meta.delete(DRAFT_KEY)
    void requestPersistence()
    toast(editId ? 'Session updated' : `Session saved · ${doneCount} ${doneCount === 1 ? 'exercise' : 'exercises'}`)
    back()
  }

  function close() {
    if (!editId && touched.current) toast('Session kept as a draft')
    back()
  }

  async function discard() {
    if (!confirm('Discard this session? Sets you ticked off will be lost.')) return
    await db.meta.delete(DRAFT_KEY)
    back()
  }

  async function remove() {
    await softDelete(db.sessions, editId!)
    toast('Session deleted', { label: 'Undo', onClick: () => restore(db.sessions, editId!) })
    back()
  }

  return (
    <SheetForm title={editId ? 'Edit Session' : 'Rehab Session'} canSave={doneCount > 0} onSubmit={finish} onClose={close}>
      <p className="-mt-2 px-1 text-[0.875rem] text-muted">
        Started {formatTime(s.startedAt)} · {doneCount} of {s.items.length} exercises done
      </p>

      <CompactScale label="Pain Before" value={s.painBefore} onChange={(v) => update((d) => ({ ...d, painBefore: v }))} />

      {s.items.length === 0 && (
        <p className="card p-4 text-muted">Nothing planned yet. Add an exercise below, or build your plan from the Rehab tab.</p>
      )}

      {s.items.map((item, index) => (
        <ItemCard
          key={item.exerciseId}
          item={item}
          exercise={exercises.get(item.exerciseId)}
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

      <Field label="Notes">
        <textarea className="input min-h-20" value={s.notes ?? ''} onChange={(e) => update((d) => ({ ...d, notes: e.target.value }))} placeholder="Optional — how it felt, what was hard" />
      </Field>

      {editId ? <DeleteRow label="Delete Session" onDelete={remove} /> : touched.current && <DeleteRow label="Discard Session" onDelete={discard} />}
    </SheetForm>
  )
}

function ItemCard({ item, exercise, onChange, onRemove }: {
  item: SessionItem
  exercise?: Exercise
  onChange: (fn: (i: SessionItem) => SessionItem) => void
  onRemove: () => void
}) {
  const timed = exercise?.mode === 'time'
  const name = exercise?.name ?? 'Removed exercise'
  const showLoad = item.sets.some((x) => x.load !== undefined)
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
      <Group>
        {item.sets.map((set, k) => (
          <div key={k} className="cell !py-2">
            <span className="w-12 text-[0.875rem] text-muted">Set {k + 1}</span>
            <NumField label={`${name} set ${k + 1} ${timed ? 'seconds' : 'reps'}`} value={set.amount} unit={timed ? 's' : 'reps'} onChange={(v) => setAt(k, { amount: v ?? 0 })} />
            {showLoad && <NumField label={`${name} set ${k + 1} load`} value={set.load} unit="kg" onChange={(v) => setAt(k, { load: v })} />}
            <span className="flex-1" />
            <button
              type="button"
              aria-label={`${name} set ${k + 1} done`}
              aria-pressed={set.done}
              onClick={() => {
                if (!set.done) haptic()
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
