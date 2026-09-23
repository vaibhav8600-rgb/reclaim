import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Sparkles } from 'lucide-react'
import type { AiOutput } from '../../../shared/ai'
import { db, type Injury } from '../../db/db'
import { useInjuries } from '../../db/hooks'
import { getMeta, save } from '../../db/repo'
import { EmptyState } from '../../components/ui'
import { kindInfo, sideLabel, symptomLabel } from '../../lib/constants'
import { dayKey, formatDay } from '../../lib/dates'
import { useBack, useGo } from '../../lib/nav'
import { toast } from '../../lib/toast'
import { CompactScale } from '../rehab/components'
import { SheetForm } from './shared'

export interface NoteSuggestions {
  noteId: string
  result: AiOutput<'structure-note'>
}

type SymptomDraft = AiOutput<'structure-note'>['symptoms'][number] & { include: boolean }
type MeasurementDraft = AiOutput<'structure-note'>['measurements'][number] & { include: boolean }

const HOUR = { morning: 9, afternoon: 14, evening: 19, night: 22 } as const

/** Review AI-suggested entries from a note. Nothing is saved until the user confirms. */
export function NoteReviewPage() {
  const [params] = useSearchParams()
  const noteId = params.get('note') ?? ''
  const back = useBack('/', 'sheet-down')
  const go = useGo()
  const injuries = useInjuries()
  const [noteAt, setNoteAt] = useState<number>()
  const [symptoms, setSymptoms] = useState<SymptomDraft[]>()
  const [measurements, setMeasurements] = useState<MeasurementDraft[]>([])
  const [activities, setActivities] = useState<string[]>([])

  useEffect(() => {
    ;(async () => {
      const [note, stored] = await Promise.all([db.journal.get(noteId), getMeta<NoteSuggestions>('noteSuggestions')])
      if (!note || stored?.noteId !== noteId) return setSymptoms([])
      setNoteAt(note.recordedAt)
      // A suggestion without a severity can't be saved until the user picks one.
      setSymptoms(stored.result.symptoms.map((s) => ({ ...s, include: s.severity !== undefined })))
      setMeasurements(stored.result.measurements.map((m) => ({ ...m, include: true })))
      setActivities(stored.result.activities)
    })()
  }, [noteId])

  if (!symptoms || !injuries) return null
  const known = new Map(injuries.map((i) => [i.id, i]))
  const chosen = symptoms.filter((s) => s.include && s.severity !== undefined).length + measurements.filter((m) => m.include).length

  const at = (timeOfDay?: keyof typeof HOUR) => {
    if (!noteAt || !timeOfDay) return noteAt ?? Date.now()
    const d = new Date(noteAt)
    d.setHours(HOUR[timeOfDay], 0, 0, 0)
    return Math.min(d.getTime(), Date.now())
  }

  async function submit() {
    for (const s of symptoms!) {
      if (!s.include || s.severity === undefined) continue
      await save(db.symptoms, {
        type: s.type,
        severity: s.severity,
        injuryId: s.injuryId && known.has(s.injuryId) ? s.injuryId : undefined,
        trigger: s.trigger,
        notes: `From your note: “${s.evidence}”`,
        recordedAt: at(s.timeOfDay),
        source: 'user_confirmed',
      })
    }
    for (const m of measurements) {
      if (!m.include) continue
      await save(db.measurements, {
        kind: m.kind,
        value: m.value,
        unit: kindInfo(m.kind).unit || m.unit,
        side: m.side,
        injuryId: m.injuryId && known.has(m.injuryId) ? m.injuryId : undefined,
        notes: `From your note: “${m.evidence}”`,
        recordedAt: at(),
        source: 'user_confirmed',
      })
    }
    await db.meta.delete('noteSuggestions')
    toast(`Added ${chosen} ${chosen === 1 ? 'entry' : 'entries'}`)
    go('/timeline', 'sheet-down', { replace: true })
  }

  const nothing = symptoms.length === 0 && measurements.length === 0

  return (
    <SheetForm title="Review Entries" canSave={chosen > 0} onSubmit={submit} onClose={back}>
      {nothing ? (
        <EmptyState icon={Sparkles} title="Nothing to add" body="The note didn’t mention symptoms or measurements that could become entries. It’s saved as a note." />
      ) : (
        <>
          <p className="flex items-start gap-2 px-1 text-[0.9375rem] text-muted">
            <Sparkles size={17} className="mt-0.5 shrink-0 text-accent" />
            Suggested from your note{noteAt ? ` (${formatDay(noteAt).toLowerCase()}, ${dayKey(noteAt)})` : ''}. Check each one — untick anything that’s wrong. Nothing is saved until you tap ✓.
          </p>

          {symptoms.map((s, i) => (
            <SuggestionCard
              key={`s${i}`}
              include={s.include}
              onToggle={(v) => setSymptoms((all) => all!.map((x, k) => (k === i ? { ...x, include: v } : x)))}
              title={`${symptomLabel(s.type)}${s.injuryId && known.has(s.injuryId) ? ` · ${known.get(s.injuryId)!.name}` : ''}`}
              meta={[s.timeOfDay && s.timeOfDay[0].toUpperCase() + s.timeOfDay.slice(1), s.trigger].filter(Boolean).join(' · ')}
              evidence={s.evidence}
            >
              {s.severityEstimated && s.severity !== undefined && (
                <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[0.75rem] font-semibold text-accent">
                  <Sparkles size={12} /> AI estimate — adjust if needed
                </p>
              )}
              <CompactScale
                label={s.severity === undefined ? 'Choose Intensity' : 'Intensity'}
                value={s.severity}
                onChange={(v) => setSymptoms((all) => all!.map((x, k) => (k === i ? { ...x, severity: v, severityEstimated: false, include: v !== undefined } : x)))}
              />
            </SuggestionCard>
          ))}

          {measurements.map((m, i) => (
            <SuggestionCard
              key={`m${i}`}
              include={m.include}
              onToggle={(v) => setMeasurements((all) => all.map((x, k) => (k === i ? { ...x, include: v } : x)))}
              title={`${kindInfo(m.kind).label} ${m.value} ${kindInfo(m.kind).unit || m.unit}`}
              meta={[sideLabel(m.side), injuryName(known, m.injuryId)].filter(Boolean).join(' · ')}
              evidence={m.evidence}
            />
          ))}

          {activities.length > 0 && (
            <div>
              <span className="section-label block">Also Mentioned</span>
              <div className="flex flex-wrap gap-1.5">
                {activities.map((a) => <span key={a} className="chip !min-h-8 !text-[0.875rem]">{a}</span>)}
              </div>
              <p className="section-footer">Kept in your note; not saved as entries.</p>
            </div>
          )}
        </>
      )}
    </SheetForm>
  )
}

const injuryName = (known: Map<string, Injury>, id?: string) => (id ? known.get(id)?.name : undefined)

function SuggestionCard({ include, onToggle, title, meta, evidence, children }: {
  include: boolean
  onToggle: (v: boolean) => void
  title: string
  meta?: string
  evidence: string
  children?: ReactNode
}) {
  return (
    <div className={`card p-4 transition-opacity ${include ? '' : 'opacity-60'}`}>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-accent)]" checked={include} onChange={(e) => onToggle(e.target.checked)} aria-label={`Include ${title}`} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          {meta && <span className="block text-[0.875rem] text-muted">{meta}</span>}
          <span className="mt-1 block text-[0.875rem] text-muted italic">“{evidence}”</span>
        </span>
      </label>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}
