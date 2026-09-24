import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Cloud, CloudOff, Download, HeartPulse, Share, Sparkles } from 'lucide-react'
import type { AiOutput } from '../../../shared/ai'
import { db } from '../../db/db'
import { useInjuryMap } from '../../db/hooks'
import { alive, restore, save, softDelete } from '../../db/repo'
import { AiAction } from '../../components/ai'
import { GlassButton, Group, IconTile, NavBar, Row, Section } from '../../components/ui'
import { formatMediumDate, fromDayKey } from '../../lib/dates'
import { useGo } from '../../lib/nav'
import { formatBytes, isTouch } from '../../lib/platform'
import { readDocument } from '../../lib/health'
import { documentBlob } from '../../lib/sync'
import { toast } from '../../lib/toast'
import { kindOf } from './kinds'

export function DocumentDetailPage() {
  const { id = '' } = useParams()
  const go = useGo()
  const doc = useLiveQuery(() => db.documents.get(id), [id])
  const savedFacts = useLiveQuery(async () => (await db.facts.where('documentId').equals(id).toArray()).filter(alive).length, [id])
  const injuries = useInjuryMap()
  const [blob, setBlob] = useState<Blob>()
  const [error, setError] = useState<string>()
  const [url, setUrl] = useState<string>()
  /** The summary as it streams in, before it's saved. */
  const [writing, setWriting] = useState<Partial<AiOutput<'summarize-document'>>>()

  useEffect(() => {
    if (!doc || doc.deletedAt) return
    let objectUrl: string | undefined
    documentBlob(doc)
      .then((b) => {
        setBlob(b)
        setUrl((objectUrl = URL.createObjectURL(b)))
      })
      .catch((e: Error) => setError(e.message))
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // Only when the document itself changes, not on every metadata update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, doc?.deletedAt])

  if (doc === undefined) return null
  if (!doc || doc.deletedAt) return <NavBar title="Document Not Found" back="/documents" />

  const file = () => new File([blob!], doc.fileName, { type: doc.mimeType })
  const canShare = !!blob && isTouch() && navigator.canShare?.({ files: [file()] })

  async function share() {
    try {
      await navigator.share({ files: [file()], title: doc!.title })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast("Couldn't open the share sheet")
    }
  }

  function download() {
    const a = Object.assign(document.createElement('a'), { href: url!, download: doc!.fileName })
    document.body.append(a)
    a.click()
    a.remove()
  }

  async function summarize() {
    try {
      await readDocument(doc!, { onPartial: setWriting })
    } finally {
      setWriting(undefined)
    }
  }

  async function remove() {
    await softDelete(db.documents, id)
    go('/documents', 'pop', { replace: true })
    toast('Document deleted', { label: 'Undo', onClick: () => restore(db.documents, id) })
  }

  const k = kindOf(doc.kind)
  const isImage = doc.mimeType.startsWith('image/')
  const isPdf = doc.mimeType === 'application/pdf'

  return (
    <div className="space-y-7 pb-4">
      <NavBar
        title={doc.title}
        subtitle={`${k.label} · ${formatMediumDate(fromDayKey(doc.date))}`}
        back="/documents"
        trailing={<GlassButton label="Edit document" to={`/documents/${id}/edit`}><span className="px-1.5">Edit</span></GlassButton>}
      />

      <Section>
        <div className="card overflow-hidden">
          {error ? (
            <p className="p-5 text-muted">{error}</p>
          ) : !url ? (
            <p className="p-5 text-muted">Opening…</p>
          ) : isImage ? (
            <img src={url} alt={doc.title} className="block max-h-[70vh] w-full object-contain" />
          ) : isPdf ? (
            <iframe src={url} title={doc.title} className="block h-[65vh] w-full bg-white" />
          ) : (
            <p className="p-5 text-muted">No preview for this file type. Use Share to open it.</p>
          )}
        </div>
      </Section>

      <Section>
        <Group inset="3.625rem">
          {canShare && <Row icon={<IconTile icon={Share} color="blue" />} title="Share or Open In…" tone="accent" onClick={share} />}
          {!!url && <Row icon={<IconTile icon={Download} color="gray" />} title="Save a Copy" tone="accent" onClick={download} />}
        </Group>
      </Section>

      <Section prominent title="AI Summary">
        {doc.aiSummary ? (
          <>
            <div className="card p-4">
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[0.75rem] font-semibold text-accent">
                <Sparkles size={13} /> AI summary — check against the original
              </p>
              {doc.aiSummary.readable !== 'yes' && (
                <p className="mb-2 text-[0.875rem] text-danger">
                  {doc.aiSummary.readable === 'no' ? 'The AI couldn’t read this document.' : 'The AI could only read part of this document.'}
                </p>
              )}
              <p className="leading-relaxed">{doc.aiSummary.summary}</p>
              {doc.aiSummary.findings.length > 0 && (
                <>
                  <h3 className="mt-3 text-[0.8125rem] font-semibold text-muted uppercase">Findings</h3>
                  <ul className="mt-1 space-y-1.5 text-[0.9375rem]">
                    {doc.aiSummary.findings.map((f, i) => (
                      <li key={i}>
                        <span className="font-semibold">{f.label}:</span> {f.detail}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {doc.aiSummary.questions.length > 0 && (
                <>
                  <h3 className="mt-3 text-[0.8125rem] font-semibold text-muted uppercase">Questions for your clinician</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[0.9375rem]">
                    {doc.aiSummary.questions.map((q, i) => <li key={i}>{q}</li>)}
                  </ul>
                </>
              )}
              <button className="mt-3 text-[0.9375rem] text-danger" onClick={() => save(db.documents, { ...doc, aiSummary: undefined })}>
                Remove Summary
              </button>
            </div>
            {doc.aiSummary.facts ? (
              <Group inset="3.625rem" className="mt-3">
                <Row
                  icon={<IconTile icon={HeartPulse} color="pink" />}
                  title={doc.aiSummary.reviewedAt ? 'Health Profile' : `Review ${doc.aiSummary.facts.length} ${doc.aiSummary.facts.length === 1 ? 'Fact' : 'Facts'}`}
                  subtitle={doc.aiSummary.reviewedAt ? (savedFacts ? `${savedFacts} ${savedFacts === 1 ? 'fact' : 'facts'} saved from this record` : 'Nothing saved from this record') : 'Lab results, medicines and findings the AI read'}
                  to={doc.aiSummary.reviewedAt ? '/health' : `/health/review/${doc.id}`}
                />
              </Group>
            ) : (
              <div className="mt-3">
                {/* Summaries from before 0.6 have no facts: reading again adds the record to the Health Profile. */}
                <AiAction label="Find Facts for Health Profile" runningLabel="Reading the document…" run={summarize} disabled={!blob} />
              </div>
            )}
          </>
        ) : (
          <>
            {writing && (
              <div className="card animate-pop mb-3 p-4" aria-live="polite">
                <p className="leading-relaxed">{writing.summary ?? '…'}</p>
                {!!writing.findings?.length && (
                  <ul className="mt-2 space-y-1.5 text-[0.9375rem]">
                    {writing.findings.map((f, i) => (
                      <li key={i}>
                        <span className="font-semibold">{f?.label}</span>{f?.detail ? `: ${f.detail}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 flex items-center gap-1.5 text-[0.75rem] text-faint"><Sparkles size={12} className="animate-pulse" /> Writing…</p>
              </div>
            )}
            <AiAction label="Summarize with AI" runningLabel="Reading the document…" run={summarize} disabled={!blob} />
            <p className="section-footer">Sends this file to Gemini through your Reclaim server. It also finds the lab results, medicines and findings in it, for you to check. PDFs up to 3 MB; photos are resized first.</p>
          </>
        )}
      </Section>

      <Section title="Details" footer={doc.notes}>
        <Group>
          {doc.injuryId && <Row title="For" value={injuries.get(doc.injuryId)?.name ?? 'Removed injury'} />}
          <Row title="File" value={`${formatBytes(doc.size)}`} subtitle={doc.fileName} />
          <Row
            title="Backup"
            value={
              <span className="flex items-center gap-1.5">
                {doc.driveFileId ? <Cloud size={16} /> : <CloudOff size={16} />}
                {doc.driveFileId ? 'Encrypted in Drive' : 'This iPhone only'}
              </span>
            }
          />
        </Group>
      </Section>

      <Section>
        <Group>
          <button onClick={remove} className="cell cell-press justify-center text-danger">Delete Document</button>
        </Group>
      </Section>
    </div>
  )
}
