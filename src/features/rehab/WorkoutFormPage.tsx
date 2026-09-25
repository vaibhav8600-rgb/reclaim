import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { X } from 'lucide-react'
import { db, type Workout } from '../../db/db'
import { isOpenInjury, useExerciseMap, useExercises, useInjuries } from '../../db/hooks'
import { restore, save, softDelete } from '../../db/repo'
import { Chips, Field, Group, PickerRow, Stepper } from '../../components/ui'
import { useBack } from '../../lib/nav'
import { toast } from '../../lib/toast'
import { DeleteRow, SheetForm } from '../log/shared'
import { AdjustNotes } from './AdjustNotes'

type Draft = Pick<Workout, 'name' | 'items' | 'restSeconds'>
const REST = [30, 60, 90, 120, 180]

/** Make or change a workout: its exercises (sets, reps or minutes, weight) and the rest between sets. */
export function WorkoutFormPage() {
  const { id } = useParams()
  const back = useBack('/rehab', 'sheet-down')
  const exercises = useExerciseMap()
  const library = useExercises()
  const open = useInjuries()?.filter(isOpenInjury) ?? []
  const [d, setD] = useState<Draft>()

  useEffect(() => {
    if (id) void db.workouts.get(id).then((w) => w && setD({ name: w.name, items: w.items, restSeconds: w.restSeconds }))
    else setD({ name: '', items: [], restSeconds: 90 })
  }, [id])

  if (!d || !library) return null
  const setItem = (i: number, patch: Partial<Draft['items'][number]>) => setD({ ...d, items: d.items.map((x, k) => (k === i ? { ...x, ...patch } : x)) })
  const available = library.filter((e) => !d.items.some((i) => i.exerciseId === e.id)).sort((a, b) => (a.category ?? 'rehab').localeCompare(b.category ?? 'rehab') || a.name.localeCompare(b.name))

  function add(exerciseId: string) {
    const e = exercises.get(exerciseId)
    const cardio = e?.category === 'cardio'
    setD({ ...d!, items: [...d!.items, { exerciseId, sets: cardio ? 1 : 3, target: cardio ? 1200 : e?.mode === 'time' ? 30 : 10 }] })
  }

  async function submit() {
    await save(db.workouts, { id, name: d!.name.trim(), items: d!.items, restSeconds: d!.restSeconds })
    toast(id ? 'Workout updated' : 'Workout saved')
    back()
  }

  async function remove() {
    await softDelete(db.workouts, id!)
    toast('Workout deleted', { label: 'Undo', onClick: () => restore(db.workouts, id!) })
    back()
  }

  return (
    <SheetForm title={id ? 'Edit Workout' : 'New Workout'} canSave={!!d.name.trim() && d.items.length > 0} onSubmit={submit} onClose={back}>
      <Field label="Name">
        <input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Upper body, Morning walk" maxLength={80} aria-label="Workout name" />
      </Field>

      {d.items.map((item, i) => {
        const e = exercises.get(item.exerciseId)
        const cardio = e?.category === 'cardio'
        const timed = e?.mode === 'time'
        return (
          <section key={item.exerciseId} aria-label={e?.name}>
            <div className="flex items-end justify-between px-1 pb-1.5">
              <h3 className="truncate text-[1.0625rem] font-semibold">{e?.name ?? 'Removed exercise'}</h3>
              <button type="button" onClick={() => setD({ ...d, items: d.items.filter((_, k) => k !== i) })} aria-label={`Remove ${e?.name ?? 'exercise'}`} className="flex h-7 w-7 items-center justify-center rounded-full bg-fill text-muted">
                <X size={14} strokeWidth={2.6} />
              </button>
            </div>
            <AdjustNotes exerciseId={item.exerciseId} injuries={open} className="mb-2" />
            <Group>
              <Stepper label="Sets" value={item.sets} min={1} max={10} onChange={(v) => setItem(i, { sets: v })} />
              {cardio ? (
                <Stepper label="Minutes" value={Math.round(item.target / 60)} min={1} max={180} step={5} onChange={(v) => setItem(i, { target: v * 60 })} />
              ) : (
                <Stepper label={timed ? 'Seconds' : 'Reps'} value={item.target} min={1} max={timed ? 600 : 100} step={timed ? 5 : 1} onChange={(v) => setItem(i, { target: v })} />
              )}
              {!timed && <Stepper label="Weight" unit="kg" value={item.load ?? 0} min={0} max={300} step={2.5} onChange={(v) => setItem(i, { load: v || undefined })} />}
            </Group>
          </section>
        )
      })}

      <Group>
        <PickerRow label="Add Exercise" value={undefined} placeholder="Choose" options={available.map((e) => ({ value: e.id, label: `${e.name} (${e.category ?? 'rehab'})` }))} onChange={add} />
      </Group>

      <div>
        <span className="section-label block">Rest Between Sets</span>
        <Chips wrap options={REST.map((s) => ({ value: String(s), label: s < 60 ? `${s} s` : `${s / 60} min` }))} value={String(d.restSeconds)} onChange={(v) => setD({ ...d, restSeconds: Number(v) })} />
        <p className="section-footer">A timer counts it down after each set you tick.</p>
      </div>

      {id && <DeleteRow label="Delete Workout" onDelete={remove} />}
    </SheetForm>
  )
}
