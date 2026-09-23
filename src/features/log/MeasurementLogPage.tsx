import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useBack } from '../../lib/nav'
import { db, type Measurement } from '../../db/db'
import { isOpenInjury, useInjuries } from '../../db/hooks'
import { restore, save, softDelete } from '../../db/repo'
import { Chips, Field, Group, Segmented } from '../../components/ui'
import { MEASUREMENT_KINDS, SIDES, kindInfo } from '../../lib/constants'
import { haptic } from '../../lib/haptics'
import { requestPersistence } from '../../lib/platform'
import { toast } from '../../lib/toast'
import { DeleteRow, InjuryPicker, SheetForm, WhenRow } from './shared'

interface Draft extends Omit<Partial<Measurement>, 'value'> {
  value: string
}

export function MeasurementLogPage() {
  const [params] = useSearchParams()
  const id = params.get('id') ?? undefined
  const presetInjury = params.get('injury') ?? undefined
  const back = useBack('/', 'sheet-down')
  const injuries = useInjuries()
  const [draft, setDraft] = useState<Draft>({
    kind: presetInjury ? 'grip' : 'weight',
    unit: 'kg',
    side: 'left',
    injuryId: presetInjury,
    recordedAt: Date.now(),
    value: '',
  })
  const [loaded, setLoaded] = useState(!id)

  useEffect(() => {
    if (!id) return
    db.measurements.get(id).then((m) => {
      if (m) setDraft({ ...m, value: String(m.value) })
      setLoaded(true)
    })
  }, [id])

  if (!loaded || !injuries) return null
  const info = kindInfo(draft.kind!)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const value = parseFloat(draft.value.replace(',', '.'))
  const valid = Number.isFinite(value) && (info.value !== 'other' || !!(draft.method?.trim() && draft.unit?.trim()))
  const choices = injuries.filter((i) => isOpenInjury(i) || i.id === draft.injuryId)

  function pickKind(kind: string) {
    const k = kindInfo(kind)
    setDraft((d) => ({ ...d, kind, unit: k.unit, injuryId: k.recovery ? d.injuryId ?? presetInjury : undefined }))
  }

  async function submit() {
    haptic()
    await save(db.measurements, {
      id,
      kind: draft.kind!,
      value,
      unit: (draft.unit ?? info.unit).trim(),
      side: info.sided ? draft.side : undefined,
      method: draft.method?.trim() || undefined,
      injuryId: info.recovery ? draft.injuryId : undefined,
      recordedAt: draft.recordedAt!,
      notes: draft.notes?.trim() || undefined,
      source: draft.source ?? 'user',
    })
    void requestPersistence()
    toast(`${info.value === 'other' ? draft.method : info.label} ${value} ${draft.unit} ${id ? 'updated' : 'saved'}`)
    back()
  }

  async function remove() {
    await softDelete(db.measurements, id!)
    toast('Measurement deleted', { label: 'Undo', onClick: () => restore(db.measurements, id!) })
    back()
  }

  return (
    <SheetForm title={id ? 'Edit Measurement' : 'Measurement'} canSave={valid} onSubmit={submit} onClose={back}>
      <div>
        <span className="section-label block">Type</span>
        <Chips options={MEASUREMENT_KINDS} value={draft.kind} onChange={pickKind} />
      </div>

      {info.value === 'other' && (
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Name">
            <input className="input" value={draft.method ?? ''} onChange={(e) => set('method', e.target.value)} placeholder="Balance" />
          </Field>
          <Field label="Unit">
            <input className="input" value={draft.unit ?? ''} onChange={(e) => set('unit', e.target.value)} placeholder="sec" />
          </Field>
        </div>
      )}

      <div>
        <span className="section-label block">Value</span>
        <label className="card flex items-baseline gap-2 px-5 py-3">
          <input
            className="font-rounded w-full min-w-0 bg-transparent text-[2.5rem] font-semibold outline-none placeholder:text-faint"
            inputMode="decimal"
            value={draft.value}
            onChange={(e) => set('value', e.target.value)}
            placeholder="0"
            aria-label="Value"
          />
          <span className="shrink-0 text-[1.25rem] font-medium text-muted">{draft.unit}</span>
        </label>
      </div>

      {info.sided && (
        <Segmented options={SIDES.filter((s) => s.value === 'left' || s.value === 'right')} value={draft.side === 'right' ? 'right' : 'left'} onChange={(v) => set('side', v)} />
      )}

      {info.recovery && <InjuryPicker injuries={choices} value={draft.injuryId} onChange={(v) => set('injuryId', v)} noneLabel="Not injury-specific" />}

      <Group>
        <WhenRow value={draft.recordedAt!} onChange={(v) => set('recordedAt', v)} />
      </Group>

      {info.value !== 'other' && (
        <Field label="Method" hint="Measure the same way each time so readings are comparable.">
          <input className="input" value={draft.method ?? ''} onChange={(e) => set('method', e.target.value)} placeholder={info.value === 'weight' ? 'Morning, before breakfast' : info.value === 'rom' ? 'Elbow extension, goniometer' : 'Dynamometer, standing'} />
        </Field>
      )}

      <Field label="Notes">
        <textarea className="input min-h-20" value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Optional" />
      </Field>

      {id && <DeleteRow label="Delete Measurement" onDelete={remove} />}
    </SheetForm>
  )
}
