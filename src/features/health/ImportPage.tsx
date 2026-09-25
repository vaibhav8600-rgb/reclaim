import { useRef, useState } from 'react'
import { FileText, Files, X } from 'lucide-react'
import { MAX_DOCUMENT_BYTES_FOR_AI } from '../../../shared/ai'
import { db } from '../../db/db'
import { isOpenInjury, useInjuries } from '../../db/hooks'
import { save } from '../../db/repo'
import { dayKey } from '../../lib/dates'
import { queueForReading } from '../../lib/health'
import { useBack, useGo } from '../../lib/nav'
import { photosToPdf } from '../../lib/pdf'
import { formatBytes, requestPersistence } from '../../lib/platform'
import { toast } from '../../lib/toast'
import { Group, Toggle } from '../../components/ui'
import { InjuryPicker, SheetForm } from '../log/shared'
import { DOCUMENT_ACCEPT, MAX_DOCUMENT_BYTES, titleFromFile } from '../documents/kinds'

/**
 * Add many records at once: reports, prescriptions, scan reports. They're saved straight away with placeholder
 * details; AI then files each one under the title, type and date printed on it, and finds its facts.
 */
export function ImportPage() {
  const back = useBack('/health', 'sheet-down')
  const go = useGo()
  const injuries = useInjuries()
  const input = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [refused, setRefused] = useState<string[]>([])
  const [injuryId, setInjuryId] = useState<string>()
  const [saving, setSaving] = useState(false)
  // Several photos of one report: saved as one PDF record, a page per photo, in the order chosen
  const [onePdf, setOnePdf] = useState(false)

  if (!injuries) return null

  function add(list: FileList | null) {
    const picked = [...(list ?? [])]
    setRefused(picked.filter((f) => f.size > MAX_DOCUMENT_BYTES).map((f) => `${f.name} is ${formatBytes(f.size)} (limit ${formatBytes(MAX_DOCUMENT_BYTES)})`))
    const known = new Set(files.map((f) => `${f.name}|${f.size}`))
    setFiles([...files, ...picked.filter((f) => f.size <= MAX_DOCUMENT_BYTES && !known.has(`${f.name}|${f.size}`))])
    if (input.current) input.current.value = '' // choosing the same file again still fires
  }

  const photos = files.filter((f) => f.type.startsWith('image/'))
  const combine = onePdf && photos.length > 1
  const count = combine ? files.length - photos.length + 1 : files.length

  async function submit() {
    setSaving(true)
    const ids: string[] = []
    let records: File[] = files
    if (combine) {
      try {
        const pdf = await photosToPdf(photos, MAX_DOCUMENT_BYTES_FOR_AI)
        const name = `${titleFromFile(photos[0].name) || 'Report'} (${photos.length} pages).pdf`
        records = [new File([pdf], name, { type: 'application/pdf' }), ...files.filter((f) => !photos.includes(f))]
      } catch {
        setSaving(false)
        return toast('Couldn’t put those photos together. Try adding them as separate records.')
      }
    }
    for (const file of records) {
      const bytes = await file.arrayBuffer() // read before the transaction: IndexedDB transactions can't await other work
      ids.push(
        await db.transaction('rw', db.documents, db.files, async () => {
          const id = await save(db.documents, { title: titleFromFile(file.name) || 'Record', kind: 'other', date: dayKey(Date.now()), injuryId, fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size })
          await db.files.put({ id, bytes, type: file.type })
          return id
        }),
      )
    }
    await queueForReading(ids)
    void requestPersistence()
    toast(`Added ${ids.length} ${ids.length === 1 ? 'record' : 'records'}`)
    go('/health', 'sheet-down', { replace: true })
  }

  return (
    <SheetForm title="Add Records" canSave={files.length > 0 && !saving} onSubmit={submit} onClose={back}>
      <div>
        <input ref={input} type="file" multiple accept={DOCUMENT_ACCEPT} className="hidden" onChange={(e) => add(e.target.files)} aria-label="Record files" />
        <button type="button" onClick={() => input.current?.click()} className="card cell cell-press !py-4">
          <span className="flex h-[1.875rem] w-[1.875rem] items-center justify-center rounded-lg bg-accent-soft text-accent"><Files size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{files.length ? 'Add More' : 'Choose Files or Take Photos'}</span>
            <span className="block text-[0.875rem] text-muted">Reports, prescriptions, scan reports — PDFs or photos, up to 25 MB each</span>
          </span>
        </button>
        {refused.map((r) => <p key={r} className="section-footer !text-danger">{r}</p>)}
      </div>

      {files.length > 0 && (
        <div>
          <span className="section-label block">{count} {count === 1 ? 'Record' : 'Records'}</span>
          <div className="card rows overflow-hidden" style={{ ['--inset' as string]: '3.625rem' }}>
            {files.map((f, i) => (
              <div key={`${f.name}|${f.size}`} className="cell">
                <span className="icon-tile" style={{ background: 'var(--color-tile-gray)' }}><FileText size={18} strokeWidth={2.2} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{f.name}</span>
                  <span className="block text-[0.875rem] text-muted">{formatBytes(f.size)}</span>
                </span>
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="-mr-2 flex h-11 w-11 items-center justify-center text-faint" aria-label={`Remove ${f.name}`}>
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
          {photos.length > 1 && (
            <Group className="mt-3">
              <Toggle label="Photos Are Pages of One Report" checked={onePdf} onChange={setOnePdf} />
            </Group>
          )}
          {combine && <p className="section-footer">The {photos.length} photos become one record, a page each, in the order above — and AI reads them together.</p>}
          <p className="section-footer">After you tap ✓, AI can read each record for its title, type and date, and the lab results, medicines, diagnoses and scan findings in it. You check everything before it joins your Health Profile.</p>
        </div>
      )}

      <InjuryPicker injuries={injuries.filter(isOpenInjury)} value={injuryId} onChange={setInjuryId} noneLabel="Not injury-specific" />
    </SheetForm>
  )
}
