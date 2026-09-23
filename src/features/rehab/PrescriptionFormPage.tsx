import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Prescription } from '../../db/db'
import { isOpenInjury, useInjuries, useMeta } from '../../db/hooks'
import { restore, save, softDelete } from '../../db/repo'
import { Field, Group, Segmented, Stepper, Toggle } from '../../components/ui'
import { useBack } from '../../lib/nav'
import { requestPersistence } from '../../lib/platform'
import { toast } from '../../lib/toast'
import { DeleteRow, InjuryPicker, SheetForm } from '../log/shared'

type Draft = Omit<Prescription, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'load'> & { load: string }

export function PrescriptionFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const back = useBack('/rehab', 'sheet-down')
  const injuries = useInjuries()
  const lastInjuryId = useMeta<string>('lastInjuryId')
  const [draft, setDraft] = useState<Draft>()
  const exercise = useLiveQuery(() => (draft ? db.exercises.get(draft.exerciseId) : undefined), [draft?.exerciseId])

  useEffect(() => {
    if (id) {
      db.prescriptions.get(id).then((p) => p && setDraft({ ...p, load: p.load ? String(p.load) : '' }))
      return
    }
    const exerciseId = params.get('exercise')
    if (!exerciseId || !injuries) return
    db.exercises.get(exerciseId).then((e) => {
      if (!e) return
      const open = injuries?.filter(isOpenInjury) ?? []
      setDraft({
        exerciseId,
        injuryId: params.get('injury') ?? open.find((i) => i.id === lastInjuryId)?.id ?? open[0]?.id,
        sets: 3,
        target: e.mode === 'time' ? 30 : 10,
        load: '',
        timesPerDay: 1,
        daysPerWeek: 7,
        active: true,
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!injuries])

  if (!draft || !exercise || !injuries) return null
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => d && { ...d, [k]: v })
  const load = parseFloat(draft.load.replace(',', '.'))
  const timed = exercise.mode === 'time'

  async function submit() {
    await save(db.prescriptions, {
      ...draft!,
      id,
      load: Number.isFinite(load) && load > 0 ? load : undefined,
      loadNote: draft!.loadNote?.trim() || undefined,
      notes: draft!.notes?.trim() || undefined,
    })
    void requestPersistence()
    toast(id ? 'Plan updated' : `${exercise!.name} added to your plan`)
    back()
  }

  async function remove() {
    await softDelete(db.prescriptions, id!)
    toast('Removed from plan', { label: 'Undo', onClick: () => restore(db.prescriptions, id!) })
    back()
  }

  return (
    <SheetForm title={id ? 'Edit Plan' : 'Add to Plan'} canSave onSubmit={submit} onClose={back}>
      <div className="px-1">
        <p className="text-[1.25rem] font-bold">{exercise.name}</p>
        <p className="text-muted">{[exercise.bodyRegion, exercise.equipment].filter(Boolean).join(' · ')}</p>
      </div>

      <InjuryPicker injuries={injuries.filter((i) => isOpenInjury(i) || i.id === draft.injuryId)} value={draft.injuryId} onChange={(v) => set('injuryId', v)} />

      <div>
        <span className="section-label block">Prescription</span>
        <Group>
          <Stepper label="Sets" value={draft.sets} min={1} max={10} onChange={(v) => set('sets', v)} />
          <Stepper label={timed ? 'Hold' : 'Reps'} value={draft.target} min={timed ? 5 : 1} max={timed ? 300 : 100} step={timed ? 5 : 1} unit={timed ? 's' : undefined} onChange={(v) => set('target', v)} />
        </Group>
      </div>

      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <Field label="Load (kg)">
          <input className="input" inputMode="decimal" value={draft.load} onChange={(e) => set('load', e.target.value)} placeholder="None" />
        </Field>
        <Field label="Or Note">
          <input className="input" value={draft.loadNote ?? ''} onChange={(e) => set('loadNote', e.target.value)} placeholder="e.g. red band" />
        </Field>
      </div>

      <div>
        <span className="section-label block">How Often</span>
        <Group>
          <div className="cell">
            <Segmented
              options={[{ value: '1', label: 'Once a day' }, { value: '2', label: 'Twice' }, { value: '3', label: '3×' }]}
              value={String(draft.timesPerDay)}
              onChange={(v) => set('timesPerDay', Number(v))}
            />
          </div>
          <Stepper label="Days per Week" value={draft.daysPerWeek} min={1} max={7} onChange={(v) => set('daysPerWeek', v)} />
        </Group>
      </div>

      <Field label="Clinician Notes">
        <textarea className="input min-h-20" value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Optional — e.g. slow on the way down, stop at pain 4" />
      </Field>

      {id && (
        <>
          <Group>
            <Toggle label="Active" checked={draft.active} onChange={(v) => set('active', v)} />
          </Group>
          <DeleteRow label="Remove from Plan" onDelete={remove} />
        </>
      )}
    </SheetForm>
  )
}
