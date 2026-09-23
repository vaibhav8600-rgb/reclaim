import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useBack, useGo } from '../../lib/nav'
import { db, type Injury } from '../../db/db'
import { save } from '../../db/repo'
import { DateRow, Field, Group, PickerRow, Segmented } from '../../components/ui'
import { SheetForm } from '../log/shared'
import { BODY_REGIONS, INJURY_STATUSES, SIDES } from '../../lib/constants'
import { dayKey, formatMediumDate, fromDayKey } from '../../lib/dates'
import { requestPersistence } from '../../lib/platform'
import { toast } from '../../lib/toast'

type Draft = Omit<Injury, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>

const empty = (): Draft => ({
  name: '',
  bodyRegion: '',
  side: 'left',
  startDate: dayKey(Date.now()),
  status: 'active',
  diagnosis: '',
  mechanism: '',
  notes: '',
})

export function InjuryFormPage() {
  const { id } = useParams()
  const go = useGo()
  const back = useBack('/', 'sheet-down')
  const [draft, setDraft] = useState<Draft>(empty)
  const [loaded, setLoaded] = useState(!id)

  useEffect(() => {
    if (!id) return
    db.injuries.get(id).then((i) => {
      if (i) setDraft(i)
      setLoaded(true)
    })
  }, [id])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  async function submit() {
    const savedId = await save(db.injuries, { ...draft, id, name: draft.name.trim() })
    void requestPersistence()
    toast(id ? 'Injury updated' : 'Injury added')
    go(`/injuries/${savedId}`, 'sheet-down', { replace: true })
  }

  if (!loaded) return null

  return (
    <SheetForm title={id ? 'Edit Injury' : 'New Injury'} canSave={!!(draft.name.trim() && draft.bodyRegion && draft.startDate)} onSubmit={submit} onClose={back}>
      <Field label="Name" hint="Whatever you'd call it — e.g. “Tennis elbow” or “ACL reconstruction”.">
        <input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Left elbow pain" />
      </Field>

      <div>
        <span className="section-label block">Where</span>
        <Group>
          <PickerRow label="Body Region" value={draft.bodyRegion || undefined} options={BODY_REGIONS.map((r) => ({ value: r, label: r }))} onChange={(v) => set('bodyRegion', v)} />
          <div className="cell">
            <Segmented options={SIDES} value={draft.side} onChange={(v) => set('side', v)} />
          </div>
        </Group>
      </div>

      <Group>
        <DateRow label="Started" type="date" value={draft.startDate} max={dayKey(Date.now())} display={formatMediumDate(fromDayKey(draft.startDate))} onChange={(v) => set('startDate', v)} />
        <PickerRow label="Status" value={draft.status} options={INJURY_STATUSES} onChange={(v) => set('status', v)} />
      </Group>

      <Field label="Diagnosis" hint="As your clinician described it, if you have one.">
        <input className="input" value={draft.diagnosis ?? ''} onChange={(e) => set('diagnosis', e.target.value)} placeholder="Lateral epicondylitis" />
      </Field>

      <Field label="How It Happened">
        <textarea className="input min-h-22" value={draft.mechanism ?? ''} onChange={(e) => set('mechanism', e.target.value)} placeholder="Gradual onset after long hours at the laptop" />
      </Field>

      <Field label="Notes">
        <textarea className="input min-h-22" value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </SheetForm>
  )
}
