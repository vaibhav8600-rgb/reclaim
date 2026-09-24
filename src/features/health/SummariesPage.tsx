import { FileText, Sparkles } from 'lucide-react'
import { useDocuments } from '../../db/hooks'
import { MLink } from '../../components/MLink'
import { EmptyState, NavBar, Section } from '../../components/ui'
import { formatMediumDate, fromDayKey } from '../../lib/dates'
import { kindOf } from '../documents/kinds'

/** Every record's AI summary in one place, newest first — no opening records one by one. */
export function SummariesPage() {
  const docs = useDocuments()
  if (!docs) return null
  const read = docs.filter((d) => d.aiSummary)

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Record Summaries" subtitle={read.length ? `${read.length} ${read.length === 1 ? 'record' : 'records'}` : undefined} back="/health" />
      {!read.length ? (
        <EmptyState icon={FileText} title="No summaries yet" body="When AI reads your records, each one’s summary appears here." />
      ) : (
        <Section className="space-y-3" footer="AI summaries — check anything important against the original record.">
          {read.map((d) => {
            const s = d.aiSummary!
            return (
              <article key={d.id} className="card p-4">
                <MLink to={`/documents/${d.id}`} className="block font-semibold text-accent">{d.title}</MLink>
                <p className="text-[0.875rem] text-muted">{kindOf(d.kind).label} · {formatMediumDate(fromDayKey(d.date))}</p>
                <p className="mt-2 flex items-start gap-2 text-[0.9375rem] leading-relaxed">
                  <Sparkles size={15} className="mt-1 shrink-0 text-accent" />
                  <span>{s.summary}</span>
                </p>
                {s.findings.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[0.9375rem]">
                    {s.findings.map((f, i) => (
                      <li key={i}><span className="font-semibold">{f.label}:</span> {f.detail}</li>
                    ))}
                  </ul>
                )}
              </article>
            )
          })}
        </Section>
      )}
    </div>
  )
}
