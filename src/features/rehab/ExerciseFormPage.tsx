import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { db, type Exercise, type ExerciseMode } from '../../db/db'
import { save, softDelete } from '../../db/repo'
import { Field, Group, PickerRow, Segmented } from '../../components/ui'
import { BODY_REGIONS } from '../../lib/constants'
import { useBack, useGo } from '../../lib/nav'
import { toast } from '../../lib/toast'
import { DeleteRow, SheetForm } from '../log/shared'

type Draft = Pick<Exercise, 'name' | 'bodyRegion' | 'mode' | 'equipment' | 'instructions'>

export function ExerciseFormPage() {
  const { id } = useParams()
  const back = useBack('/rehab/library', 'sheet-down')
  const go = useGo()
  const [draft, setDraft] = useState<Draft>({ name: '', bodyRegion: '', mode: 'reps', equipment: '', instructions: '' })
  const [loaded, setLoaded] = useState(!id)

  useEffect(() => {
    if (!id) return
    db.exercises.get(id).then((e) => {
      if (e) setDraft(e)
      setLoaded(true)
    })
  }, [id])

  if (!loaded) return null
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  async function submit() {
    const savedId = await save(db.exercises, {
      id,
      name: draft.name.trim(),
      bodyRegion: draft.bodyRegion,
      mode: draft.mode,
      equipment: draft.equipment?.trim() || undefined,
      instructions: draft.instructions?.trim() || undefined,
    })
    toast(id ? 'Exercise updated' : 'Exercise added')
    if (id) back()
    else go(`/rehab/exercises/${savedId}`, 'sheet-down', { replace: true })
  }

  async function remove() {
    if (!confirm(`Delete “${draft.name}”? It will be removed from your plan; past sessions keep their history.`)) return
    await softDelete(db.exercises, id!)
    const plans = await db.prescriptions.where('exerciseId').equals(id!).toArray()
    await Promise.all(plans.map((p) => softDelete(db.prescriptions, p.id)))
    toast('Exercise deleted')
    go('/rehab/library', 'sheet-down', { replace: true })
  }

  return (
    <SheetForm title={id ? 'Edit Exercise' : 'New Exercise'} canSave={!!(draft.name.trim() && draft.bodyRegion)} onSubmit={submit} onClose={back}>
      <Field label="Name">
        <input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Towel wring" />
      </Field>
      <Group>
        <PickerRow label="Body Region" value={draft.bodyRegion || undefined} options={BODY_REGIONS.map((r) => ({ value: r, label: r }))} onChange={(v) => set('bodyRegion', v)} />
        <div className="cell">
          <Segmented<ExerciseMode> options={[{ value: 'reps', label: 'Reps' }, { value: 'time', label: 'Timed Hold' }]} value={draft.mode} onChange={(v) => set('mode', v)} />
        </div>
      </Group>
      <Field label="Equipment">
        <input className="input" value={draft.equipment ?? ''} onChange={(e) => set('equipment', e.target.value)} placeholder="Optional — e.g. towel, band" />
      </Field>
      <Field label="How To" hint="Write it the way your physio explained it.">
        <textarea className="input min-h-28" value={draft.instructions ?? ''} onChange={(e) => set('instructions', e.target.value)} />
      </Field>
      {id && <DeleteRow label="Delete Exercise" onDelete={remove} />}
    </SheetForm>
  )
}
