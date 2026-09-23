import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Paperclip } from 'lucide-react'
import { db, type MedicalDocument } from '../../db/db'
import { isOpenInjury, useInjuries, useMeta } from '../../db/hooks'
import { save } from '../../db/repo'
import { Chips, DateRow, Field, Group } from '../../components/ui'
import { dayKey, formatMediumDate, fromDayKey } from '../../lib/dates'
import { useBack, useGo } from '../../lib/nav'
import { formatBytes, requestPersistence } from '../../lib/platform'
import { toast } from '../../lib/toast'
import { InjuryPicker, SheetForm } from '../log/shared'
import { DOCUMENT_ACCEPT, DOCUMENT_KINDS, DocumentTile, MAX_DOCUMENT_BYTES } from './kinds'

type Draft = Pick<MedicalDocument, 'title' | 'kind' | 'date' | 'injuryId' | 'notes'>

/** "MRI_left_elbow_2026-01-31.pdf" → "MRI left elbow 2026-01-31" */
const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim()

export function DocumentFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const back = useBack('/documents', 'sheet-down')
  const go = useGo()
  const injuries = useInjuries()
  const lastInjuryId = useMeta<string>('lastInjuryId')
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File>()
  const [error, setError] = useState<string>()
  const [draft, setDraft] = useState<Draft>({ title: '', kind: 'imaging', date: dayKey(Date.now()), injuryId: params.get('injury') ?? undefined })
  const [existing, setExisting] = useState<MedicalDocument>()

  useEffect(() => {
    if (id) db.documents.get(id).then((d) => d && (setExisting(d), setDraft(d)))
  }, [id])

  // Default the injury to the one used last, like the other forms.
  useEffect(() => {
    if (id || params.get('injury') || !injuries) return
    const open = injuries.filter(isOpenInjury)
    const pick = open.find((i) => i.id === lastInjuryId) ?? open[0]
    if (pick) setDraft((d) => (d.injuryId === undefined ? { ...d, injuryId: pick.id } : d))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!injuries, lastInjuryId])

  if (!injuries || (id && !existing)) return null
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  function pick(f?: File) {
    setError(undefined)
    if (!f) return
    if (f.size > MAX_DOCUMENT_BYTES) return setError(`That file is ${formatBytes(f.size)}. The limit is ${formatBytes(MAX_DOCUMENT_BYTES)}.`)
    setFile(f)
    setDraft((d) => ({ ...d, title: d.title || titleFromFile(f.name) }))
  }

  async function submit() {
    const values = { ...draft, title: draft.title.trim(), notes: draft.notes?.trim() || undefined }
    if (existing) {
      await save(db.documents, { ...existing, ...values })
      toast('Document updated')
      return back()
    }
    const fileBytes = await file!.arrayBuffer() // read before the transaction: IndexedDB transactions can't await other work
    const newId = await db.transaction('rw', db.documents, db.files, async () => {
      const docId = await save(db.documents, { ...values, fileName: file!.name, mimeType: file!.type || 'application/octet-stream', size: file!.size })
      await db.files.put({ id: docId, bytes: fileBytes, type: file!.type })
      return docId
    })
    void requestPersistence()
    toast('Document added')
    go(`/documents/${newId}`, 'sheet-down', { replace: true })
  }

  return (
    <SheetForm title={existing ? 'Edit Document' : 'Add Document'} canSave={!!draft.title.trim() && (!!existing || !!file)} onSubmit={submit} onClose={back}>
      {!existing && (
        <div>
          <input ref={input} type="file" accept={DOCUMENT_ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} aria-label="Document file" />
          <button type="button" onClick={() => input.current?.click()} className="card cell cell-press !py-4">
            {file ? <DocumentTile kind={draft.kind} /> : <span className="flex h-[1.875rem] w-[1.875rem] items-center justify-center rounded-lg bg-accent-soft text-accent"><Paperclip size={18} /></span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{file ? file.name : 'Choose File or Take Photo'}</span>
              <span className="block text-[0.875rem] text-muted">{file ? formatBytes(file.size) : 'PDF or image, up to 25 MB'}</span>
            </span>
            {file && <span className="text-[0.9375rem] text-accent">Change</span>}
          </button>
          {error && <p className="section-footer !text-danger">{error}</p>}
        </div>
      )}

      <Field label="Title">
        <input className="input" value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="MRI left elbow" />
      </Field>

      <div>
        <span className="section-label block">Type</span>
        <Chips options={DOCUMENT_KINDS} value={draft.kind} onChange={(v) => set('kind', v)} />
      </div>

      <Group>
        <DateRow label="Date on Document" type="date" value={draft.date} max={dayKey(Date.now())} display={formatMediumDate(fromDayKey(draft.date))} onChange={(v) => set('date', v)} />
      </Group>

      <InjuryPicker injuries={injuries.filter((i) => isOpenInjury(i) || i.id === draft.injuryId)} value={draft.injuryId} onChange={(v) => set('injuryId', v)} noneLabel="Not injury-specific" />

      <Field label="Notes">
        <textarea className="input min-h-20" value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Optional — e.g. what the report says, questions for your doctor" />
      </Field>
    </SheetForm>
  )
}
