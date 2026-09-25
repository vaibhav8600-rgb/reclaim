import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useBack } from '../../lib/nav'
import { db, type Symptom } from '../../db/db'
import { isOpenInjury, useInjuries } from '../../db/hooks'
import { getMeta, restore, save, setMeta, softDelete } from '../../db/repo'
import { SeverityPicker } from '../../components/SeverityPicker'
import { Chips, Field, Group } from '../../components/ui'
import { SYMPTOM_TYPES, TRIGGER_SUGGESTIONS, symptomLabel } from '../../lib/constants'
import { haptic } from '../../lib/haptics'
import { requestPersistence } from '../../lib/platform'
import { NERVE_SYMPTOMS } from '../../lib/safety'
import { toast } from '../../lib/toast'
import { DeleteRow, InjuryPicker, SheetForm, WhenRow } from './shared'

export function SymptomLogPage() {
  const [params] = useSearchParams()
  const id = params.get('id') ?? undefined
  const back = useBack('/', 'sheet-down')
  const injuries = useInjuries()
  const [draft, setDraft] = useState<Partial<Symptom>>({
    type: 'pain',
    injuryId: params.get('injury') ?? undefined,
    recordedAt: Date.now(),
  })
  const [loaded, setLoaded] = useState(!id)

  useEffect(() => {
    if (!id) return
    db.symptoms.get(id).then((s) => {
      if (s) setDraft(s)
      setLoaded(true)
    })
  }, [id])

  // New entry with no injury given: default to the last-used open injury, like Quick Log.
  useEffect(() => {
    if (id || params.get('injury') || !injuries) return
    getMeta<string>('lastInjuryId').then((last) => {
      const open = injuries.filter(isOpenInjury)
      const pick = open.find((i) => i.id === last) ?? open[0]
      if (pick) setDraft((d) => (d.injuryId === undefined ? { ...d, injuryId: pick.id } : d))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!injuries])

  if (!loaded || !injuries) return null
  const set = <K extends keyof Symptom>(k: K, v: Symptom[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const choices = injuries.filter((i) => isOpenInjury(i) || i.id === draft.injuryId)

  async function submit() {
    haptic()
    await save(db.symptoms, {
      id,
      type: draft.type!,
      severity: draft.severity!,
      injuryId: draft.injuryId,
      recordedAt: draft.recordedAt!,
      trigger: draft.trigger?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
      source: draft.source ?? 'user',
    })
    if (draft.injuryId) setMeta('lastInjuryId', draft.injuryId)
    void requestPersistence()
    toast(`${symptomLabel(draft.type!)} ${draft.severity} ${id ? 'updated' : 'logged'}`)
    back()
  }

  async function remove() {
    await softDelete(db.symptoms, id!)
    toast('Entry deleted', { label: 'Undo', onClick: () => restore(db.symptoms, id!) })
    back()
  }

  return (
    <SheetForm title={id ? 'Edit Symptom' : 'Log Symptom'} canSave={draft.severity !== undefined} onSubmit={submit} onClose={back}>
      <InjuryPicker injuries={choices} value={draft.injuryId} onChange={(v) => set('injuryId', v)} />

      <div>
        <span className="section-label block">Symptom</span>
        <Chips options={SYMPTOM_TYPES} value={draft.type} onChange={(v) => set('type', v)} />
        {NERVE_SYMPTOMS.includes(draft.type ?? '') && (
          <p className="section-footer" data-testid="nerve-note">Numbness, tingling or weakness can be a warning sign. After you save, Today asks a few quick safety questions.</p>
        )}
      </div>

      <div>
        <span className="section-label block">Intensity</span>
        <SeverityPicker value={draft.severity} onChange={(n) => set('severity', n)} />
      </div>

      <Group>
        <WhenRow value={draft.recordedAt!} onChange={(v) => set('recordedAt', v)} />
      </Group>

      <Field label="What Set It Off?">
        <input className="input" value={draft.trigger ?? ''} onChange={(e) => set('trigger', e.target.value)} placeholder="Optional — e.g. 8 hours at the laptop" />
      </Field>
      <div className="-mt-3 flex flex-wrap gap-1.5">
        {TRIGGER_SUGGESTIONS.map((t) => (
          <button key={t} type="button" className="chip !min-h-8 !text-[0.875rem]" aria-pressed={draft.trigger === t} onClick={() => set('trigger', draft.trigger === t ? '' : t)}>
            {t}
          </button>
        ))}
      </div>

      <Field label="Notes">
        <textarea className="input min-h-24" value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Optional — what it felt like, what helped" />
      </Field>

      {id && <DeleteRow label="Delete Entry" onDelete={remove} />}
    </SheetForm>
  )
}
