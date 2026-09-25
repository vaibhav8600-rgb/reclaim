import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { FACT_KINDS } from '../../../shared/ai'
import { db, type HealthFact } from '../../db/db'
import { restore, save, softDelete } from '../../db/repo'
import { Chips, DateRow, Field, Group, PickerRow, Row } from '../../components/ui'
import { BODY_REGIONS } from '../../lib/constants'
import { dayKey, formatMediumDate, fromDayKey } from '../../lib/dates'
import { rangeFlag } from '../../lib/facts'
import { useBack, useGo } from '../../lib/nav'
import { toast } from '../../lib/toast'
import { DeleteRow, SheetForm } from '../log/shared'
import { FACT_KIND_INFO } from './kinds'

type Draft = Pick<HealthFact, 'kind' | 'name' | 'unit' | 'range' | 'flag' | 'detail' | 'date' | 'bodyRegion' | 'side'> & { value: string }

const FLAGS = [
  { value: 'none' as const, label: 'In Range' },
  { value: 'low' as const, label: 'Low' },
  { value: 'high' as const, label: 'High' },
  { value: 'abnormal' as const, label: 'Abnormal' },
]

/** Add a fact by hand, or correct one the AI read. */
export function FactFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const back = useBack('/health', 'sheet-down')
  const go = useGo()
  const [existing, setExisting] = useState<HealthFact | null>()
  const [draft, setDraft] = useState<Draft>({ kind: (params.get('kind') as HealthFact['kind']) || 'condition', name: '', value: '', date: dayKey(Date.now()) })
  const sourceId = existing?.documentId
  const [sourceTitle, setSourceTitle] = useState<string>()

  useEffect(() => {
    if (!id) return setExisting(null)
    db.facts.get(id).then((f) => {
      setExisting(f && !f.deletedAt ? f : null)
      if (f) setDraft({ ...f, value: f.value === undefined ? '' : String(f.value) })
    })
  }, [id])
  useEffect(() => {
    if (sourceId) db.documents.get(sourceId).then((d) => setSourceTitle(d && !d.deletedAt ? d.title : undefined))
  }, [sourceId])

  if (existing === undefined) return null
  if (id && !existing) return <SheetForm title="Fact Not Found" canSave={false} onSubmit={() => {}} onClose={back}><p className="text-muted">It may have been deleted.</p></SheetForm>

  const numeric = draft.kind === 'lab' || draft.kind === 'vital'
  const number = draft.value.trim() === '' ? undefined : Number(draft.value.replace(',', '.'))
  const valid = !!draft.name.trim() && (number === undefined || Number.isFinite(number))

  /** A changed value or range re-works the flag when the range is simple enough to trust. */
  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => {
      const next = { ...d, [k]: v }
      if (k !== 'value' && k !== 'range') return next
      const n = Number(next.value.replace(',', '.'))
      const computed = next.value.trim() && Number.isFinite(n) && next.range ? rangeFlag(n, next.range) : null
      return computed === null ? next : { ...next, flag: computed }
    })
  }

  async function submit() {
    const values = {
      kind: draft.kind,
      name: draft.name.trim(),
      value: numeric ? number : undefined,
      unit: (numeric && draft.unit?.trim()) || undefined,
      range: (numeric && draft.range?.trim()) || undefined,
      flag: numeric ? draft.flag : undefined,
      detail: draft.detail?.trim() || undefined,
      bodyRegion: draft.kind === 'condition' ? draft.bodyRegion : undefined,
      side: draft.kind === 'condition' && draft.bodyRegion ? draft.side : undefined,
      date: draft.date,
    }
    if (existing) {
      // Checked by the user either way; AI-read facts stay marked as confirmed.
      await save(db.facts, { ...existing, ...values })
      toast('Fact updated')
      return back()
    }
    await save(db.facts, { ...values, source: 'user' })
    toast(`${FACT_KIND_INFO[draft.kind].label} added`)
    go('/health', 'sheet-down', { replace: true })
  }

  async function remove() {
    await softDelete(db.facts, existing!.id)
    toast(`${existing!.name} deleted`, { label: 'Undo', onClick: () => restore(db.facts, existing!.id) })
    back()
  }

  return (
    <SheetForm title={existing ? `Edit ${FACT_KIND_INFO[draft.kind].label}` : 'Add a Fact'} canSave={valid} onSubmit={submit} onClose={back}>
      {!existing && (
        <div>
          <span className="section-label block">Type</span>
          <Chips wrap options={FACT_KINDS.map((k) => ({ value: k, label: FACT_KIND_INFO[k].label }))} value={draft.kind} onChange={(v) => set('kind', v)} />
        </div>
      )}

      <Field label="Name">
        <input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder={PLACEHOLDER[draft.kind]} />
      </Field>

      {numeric && (
        <div>
          <span className="section-label block">Result</span>
          <Group>
            <label className="cell">
              <span className="w-20 shrink-0">Value</span>
              <input className="min-w-0 flex-1 bg-transparent text-right outline-none" inputMode="decimal" value={draft.value} onChange={(e) => set('value', e.target.value)} placeholder="Optional" aria-label="Value" />
            </label>
            <label className="cell">
              <span className="w-20 shrink-0">Unit</span>
              <input className="min-w-0 flex-1 bg-transparent text-right outline-none" value={draft.unit ?? ''} onChange={(e) => set('unit', e.target.value)} placeholder="e.g. ng/mL" aria-label="Unit" />
            </label>
            <label className="cell">
              <span className="w-20 shrink-0">Range</span>
              <input className="min-w-0 flex-1 bg-transparent text-right outline-none" value={draft.range ?? ''} onChange={(e) => set('range', e.target.value)} placeholder="As printed, e.g. 30–100" aria-label="Reference range" />
            </label>
          </Group>
          {(number !== undefined || draft.flag) && (
            <div className="mt-3">
              <Chips wrap options={FLAGS} value={draft.flag ?? 'none'} onChange={(v) => setDraft((d) => ({ ...d, flag: v === 'none' ? undefined : v }))} />
            </div>
          )}
        </div>
      )}

      {draft.kind === 'condition' && (
        <div>
          <Group>
            <PickerRow label="Body Part" value={draft.bodyRegion} placeholder="Not one body part" options={BODY_REGIONS.map((r) => ({ value: r, label: r }))} onChange={(v) => set('bodyRegion', v)} />
          </Group>
          {draft.bodyRegion && (
            <div className="mt-3">
              <Chips options={[{ value: 'left' as const, label: 'Left' }, { value: 'right' as const, label: 'Right' }, { value: 'both' as const, label: 'Both' }]} value={draft.side} onChange={(v) => set('side', v)} />
            </div>
          )}
          <p className="section-footer">A condition of one body part can be added as an injury to track, and gets a recovery plan.</p>
        </div>
      )}

      <Field label={numeric ? 'Result in Words' : 'Details'}>
        <textarea className="input min-h-20" value={draft.detail ?? ''} onChange={(e) => set('detail', e.target.value)} placeholder={DETAIL_PLACEHOLDER[draft.kind]} />
      </Field>

      <Group>
        <DateRow label="Date on Record" type="date" value={draft.date} max={dayKey(Date.now())} display={formatMediumDate(fromDayKey(draft.date))} onChange={(v) => set('date', v)} />
      </Group>

      {existing?.evidence && (
        <div>
          <span className="section-label block">Read From</span>
          <Group>
            {sourceTitle && <Row title={sourceTitle} value={existing.page ? `Page ${existing.page}` : undefined} to={`/documents/${existing.documentId}`} />}
            <p className="cell text-[0.9375rem] text-muted italic">“{existing.evidence}”</p>
          </Group>
        </div>
      )}

      {existing && <DeleteRow label={`Delete ${FACT_KIND_INFO[existing.kind].label}`} onDelete={remove} />}
    </SheetForm>
  )
}

const PLACEHOLDER: Record<HealthFact['kind'], string> = {
  condition: 'e.g. Lateral epicondylitis',
  medication: 'e.g. Naproxen 250 mg',
  allergy: 'e.g. Penicillin',
  lab: 'e.g. Vitamin D (25-OH)',
  imaging: 'e.g. MRI right elbow',
  procedure: 'e.g. PRP injection',
  vital: 'e.g. Blood pressure',
}

const DETAIL_PLACEHOLDER: Record<HealthFact['kind'], string> = {
  condition: 'Side, severity or status, as written',
  medication: 'Dose, how often, how long, what for',
  allergy: 'Reaction, if known',
  lab: 'For results that aren’t a number, e.g. “Nil” or “Positive”',
  imaging: 'The finding, in the report’s words',
  procedure: 'Where, by whom, notes',
  vital: 'e.g. 130/85 for blood pressure',
}
