import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, Sparkles } from 'lucide-react'
import type { ExtractedFact } from '../../../shared/ai'
import { db, type MedicalDocument } from '../../db/db'
import { alive } from '../../db/repo'
import { EmptyState } from '../../components/ui'
import { MLink } from '../../components/MLink'
import { formatMediumDate, fromDayKey } from '../../lib/dates'
import { effectiveFlag, factValue } from '../../lib/facts'
import { confirmFacts, needsReview } from '../../lib/health'
import { useBack, useGo } from '../../lib/nav'
import { toast } from '../../lib/toast'
import { SheetForm } from '../log/shared'
import { injuryPlace } from '../../lib/constants'
import { kindOf } from '../documents/kinds'
import { FACT_KIND_INFO, FACT_ORDER, FlagPill } from './kinds'

/**
 * Check the facts the AI read — from one record (/health/review/:id) or every record waiting (/health/review),
 * each with its summary, so a bulk import is reviewed in one pass. Nothing joins the Health Profile until ✓.
 */
export function ReviewPage() {
  const { id } = useParams()
  const back = useBack('/health', 'sheet-down')
  const go = useGo()
  const docs = useLiveQuery(
    async () => (id ? [await db.documents.get(id)].filter((d): d is MedicalDocument => !!d && alive(d) && !!d.aiSummary?.facts) : (await db.documents.toArray()).filter((d) => alive(d) && needsReview(d)).sort((a, b) => b.date.localeCompare(a.date))),
    [id],
  )
  const savedCounts = useLiveQuery(async () => {
    const counts = new Map<string, number>()
    for (const f of (await db.facts.toArray()).filter(alive)) if (f.documentId) counts.set(f.documentId, (counts.get(f.documentId) ?? 0) + 1)
    return counts
  }, [])
  /** Ticks per record, taken once so records finishing review don't reset the others. */
  const [kept, setKept] = useState<Record<string, boolean[]>>()
  useEffect(() => {
    if (docs && !kept) setKept(Object.fromEntries(docs.map((d) => [d.id, d.aiSummary!.facts!.map(() => true)])))
  }, [docs, kept])

  if (!docs || !savedCounts) return null
  if (!docs.length || !kept) {
    return (
      <SheetForm title="Review Facts" canSave={false} onSubmit={() => {}} onClose={back}>
        <EmptyState icon={FileText} title="Nothing to review" body="Records appear here after AI reads them." />
      </SheetForm>
    )
  }
  const shown = docs.filter((d) => kept[d.id])
  const total = shown.reduce((n, d) => n + d.aiSummary!.facts!.length, 0)
  const count = shown.reduce((n, d) => n + kept[d.id].filter(Boolean).length, 0)
  const replacing = shown.reduce((n, d) => n + (savedCounts.get(d.id) ?? 0), 0)

  async function submit() {
    for (const d of shown) await confirmFacts(d, d.aiSummary!.facts!.filter((_, i) => kept![d.id][i]))
    toast(count ? `Saved ${count} ${count === 1 ? 'fact' : 'facts'} to your Health Profile` : 'Marked as reviewed')
    go('/health', 'sheet-down', { replace: true })
  }

  const toggle = (docId: string, i: number, v: boolean) => setKept((k) => ({ ...k, [docId]: k![docId].map((x, j) => (j === i ? v : x)) }))
  const setAll = (docId: string, v: boolean) => setKept((k) => ({ ...k, [docId]: k![docId].map(() => v) }))

  return (
    <SheetForm title={shown.length > 1 ? `Review ${shown.length} Records` : 'Review Facts'} canSave onSubmit={submit} onClose={back}>
      <p className="flex items-start gap-2 px-1 text-[0.9375rem] text-muted">
        <Sparkles size={17} className="mt-0.5 shrink-0 text-accent" />
        <span>Read by AI. Check each fact against its record and untick anything that’s wrong. Nothing is saved until you tap ✓.</span>
      </p>

      {shown.map((d) => (
        <RecordReview key={d.id} doc={d} kept={kept[d.id]} onToggle={(i, v) => toggle(d.id, i, v)} onAll={(v) => setAll(d.id, v)} />
      ))}

      <p className="section-footer">
        {count} of {total} will be saved{replacing ? `, replacing the ${replacing} saved from ${shown.length > 1 ? 'these records' : 'this record'} before` : ''}. You can edit or delete any of them later.
      </p>
    </SheetForm>
  )
}

/** One record: what it is, its AI summary, then its facts by kind. */
function RecordReview({ doc, kept, onToggle, onAll }: { doc: MedicalDocument; kept: boolean[]; onToggle: (i: number, v: boolean) => void; onAll: (v: boolean) => void }) {
  const s = doc.aiSummary!
  const facts = s.facts!
  const all = kept.every(Boolean)
  return (
    <section className="space-y-3" aria-label={doc.title}>
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <MLink to={`/documents/${doc.id}`} className="block font-semibold text-accent">{doc.title}</MLink>
            <p className="text-[0.875rem] text-muted">{kindOf(doc.kind).label} · {formatMediumDate(fromDayKey(doc.date))}</p>
          </div>
          {facts.length > 1 && (
            <button type="button" className="shrink-0 text-[0.9375rem] text-accent" onClick={() => onAll(!all)}>{all ? 'Untick All' : 'Tick All'}</button>
          )}
        </div>
        {s.summary && <p className="mt-2 text-[0.9375rem] leading-relaxed">{s.summary}</p>}
        {s.readable !== 'yes' && (
          <p className="mt-2 text-[0.875rem] text-danger">{s.readable === 'no' ? 'The AI couldn’t read this record.' : 'The AI could only read part of this record — some facts may be missing.'}</p>
        )}
      </div>

      {FACT_ORDER.map((kind) => {
        const rows = facts.map((f, i) => [f, i] as const).filter(([f]) => f.kind === kind)
        if (!rows.length) return null
        return (
          <div key={kind}>
            <span className="section-label block">{FACT_KIND_INFO[kind].plural}</span>
            <div className="card rows overflow-hidden" style={{ ['--inset' as string]: '3rem' }}>
              {rows.map(([f, i]) => <FactCheck key={i} fact={f} kept={kept[i]} onChange={(v) => onToggle(i, v)} />)}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function FactCheck({ fact, kept, onChange }: { fact: ExtractedFact; kept: boolean; onChange: (v: boolean) => void }) {
  const value = fact.kind === 'lab' || fact.kind === 'vital' ? factValue(fact) : undefined
  const flag = effectiveFlag(fact)
  return (
    <label className={`cell cursor-pointer !items-start transition-opacity ${kept ? '' : 'opacity-55'}`}>
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent)]" checked={kept} onChange={(e) => onChange(e.target.checked)} aria-label={`Keep ${fact.name}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="font-medium">{fact.name}</span>
          {(value || flag) && (
            <span className="flex shrink-0 items-center gap-1.5">
              {value && <span className="font-semibold tabular-nums">{value}</span>}
              <FlagPill flag={flag} />
            </span>
          )}
        </span>
        {fact.range && <span className="block text-[0.8125rem] text-muted">Range {fact.range}</span>}
        {fact.kind === 'condition' && fact.bodyRegion && <span className="block text-[0.8125rem] text-muted">{injuryPlace({ bodyRegion: fact.bodyRegion, side: fact.side ?? 'none' })}</span>}
        {fact.detail && !(value && fact.value === undefined) && <span className="block text-[0.875rem] text-muted">{fact.detail}</span>}
        <span className="mt-0.5 block text-[0.8125rem] text-faint italic">“{fact.evidence}”{fact.page && <span className="not-italic"> · page {fact.page}</span>}</span>
      </span>
    </label>
  )
}
