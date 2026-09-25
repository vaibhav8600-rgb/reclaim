import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { dailyTotals } from '../../lib/nutrition'
import { Printer, Sparkles } from 'lucide-react'
import type { AiOutput } from '../../../shared/ai'
import { db } from '../../db/db'
import { isOpenInjury, useInjuries, useProfile } from '../../db/hooks'
import { alive } from '../../db/repo'
import { AiAction } from '../../components/ai'
import { PainChart } from '../../components/PainChart'
import { Chips, NavBar, Section, Segmented } from '../../components/ui'
import { runAi } from '../../lib/ai'
import { buildAiContext } from '../../lib/aiContext'
import { injuryPlace, kindInfo, sideLabel, statusLabel, symptomLabel } from '../../lib/constants'
import { dayKey, daysAgo, daysBetween, formatMediumDate, fromDayKey } from '../../lib/dates'
import { checkInTrend, toleranceLabel } from '../../lib/checkin'
import { reachLabel, reachTrend } from '../../lib/reach'
import { itemDone, plannedPerWeek, startOfWeek } from '../../lib/rehab'
import { dailySeries } from '../../lib/stats'
import { kindOf } from '../documents/kinds'

const RANGES = [
  { value: '14', label: '14 Days' },
  { value: '30', label: '30 Days' },
  { value: '90', label: '90 Days' },
] as const
const WEEK = 7 * 86_400_000

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)
const f1 = (n?: number) => (n === undefined ? '—' : n.toFixed(1))

/**
 * A printable summary for a clinician. Everything here is computed on the device;
 * the optional AI section is clearly labelled.
 */
export function ReportPage() {
  const [params, setParams] = useSearchParams()
  const injuries = useInjuries()
  const profile = useProfile()
  const days = Number(params.get('days') ?? 30)
  const [narrative, setNarrative] = useState<Partial<AiOutput<'report-narrative'>>>()
  const [writing, setWriting] = useState(false)
  const chosen = params.get('injury') ?? injuries?.find(isOpenInjury)?.id
  const injury = injuries?.find((i) => i.id === chosen)
  const from = daysAgo(days - 1)

  const data = useLiveQuery(async () => {
    if (!chosen) return undefined
    const [symptoms, measurements, sessions, prescriptions, exercises, documents, meals, checkins] = await Promise.all([
      db.symptoms.where('recordedAt').aboveOrEqual(from).toArray(),
      db.measurements.where('injuryId').equals(chosen).toArray(),
      db.sessions.where('recordedAt').aboveOrEqual(from).toArray(),
      db.prescriptions.where('injuryId').equals(chosen).toArray(),
      db.exercises.toArray(),
      db.documents.where('injuryId').equals(chosen).toArray(),
      db.meals.where('recordedAt').aboveOrEqual(from).toArray(),
      db.checkins.where('recordedAt').aboveOrEqual(from).toArray(),
    ])
    return {
      symptoms: symptoms.filter((s) => alive(s) && s.injuryId === chosen),
      measurements: measurements.filter(alive).sort((a, b) => a.recordedAt - b.recordedAt),
      sessions: sessions.filter(alive),
      prescriptions: prescriptions.filter(alive),
      exercises: new Map(exercises.map((e) => [e.id, e])),
      documents: documents.filter(alive).sort((a, b) => b.date.localeCompare(a.date)),
      meals: meals.filter(alive),
      checkins: checkins.filter(alive),
    }
  }, [chosen, from])

  const pain = useMemo(() => data?.symptoms.filter((s) => s.type === 'pain') ?? [], [data])
  if (!injuries) return null

  const setParam = (k: string, v: string) => setParams((p) => (p.set(k, v), p), { replace: true })

  if (!injury || !data) {
    return (
      <div>
        <NavBar title="Clinician Report" back="/insights" />
        <p className="px-5 text-muted">Add an injury first — the report is built around one injury.</p>
      </div>
    )
  }

  // Pain by week (oldest first) and by time of day
  const weeks = Array.from({ length: Math.ceil(days / 7) }, (_, w) => {
    const end = Date.now() - w * WEEK
    const start = end - WEEK
    return { start, end, avg: avg(pain.filter((s) => s.recordedAt > start && s.recordedAt <= end).map((s) => s.severity)), logs: pain.filter((s) => s.recordedAt > start && s.recordedAt <= end).length }
  }).reverse()
  const byHour = (a: number, b: number) => avg(pain.filter((s) => new Date(s.recordedAt).getHours() >= a && new Date(s.recordedAt).getHours() < b).map((s) => s.severity))
  const triggers = [...pain.reduce((m, s) => (s.trigger ? m.set(s.trigger, [...(m.get(s.trigger) ?? []), s.severity]) : m), new Map<string, number[]>())].sort((a, b) => b[1].length - a[1].length).slice(0, 5)
  const reached = data.symptoms.filter((s) => s.reach !== undefined).sort((a, b) => a.recordedAt - b.recordedAt)
  const reachTrendWord = { spreading: 'spreading further down', centralising: 'moving back towards the spine', steady: 'about the same' }
  const fn = checkInTrend(data.checkins)
  const fromTo = (x: { first: number; latest: number; count: number } | undefined, show: (v: number) => string = (v) => `${v}/10`) =>
    x && (x.count > 1 ? `${show(x.first)} → ${show(x.latest)}` : show(x.latest))
  const other = [...data.symptoms.filter((s) => s.type !== 'pain').reduce((m, s) => m.set(s.type, [...(m.get(s.type) ?? []), s.severity]), new Map<string, number[]>())]

  // Rehab
  const plan = data.prescriptions.filter((p) => p.active)
  const planIds = new Set(plan.map((p) => p.exerciseId))
  const rehabWeeks = [3, 2, 1, 0].map((w) => {
    const start = startOfWeek(Date.now()) - w * WEEK
    const done = data.sessions.filter((s) => s.recordedAt >= start && s.recordedAt < start + WEEK).reduce((n, s) => n + s.items.filter((i) => planIds.has(i.exerciseId) && itemDone(i)).length, 0)
    return { start, done, planned: plan.reduce((n, p) => n + plannedPerWeek(p), 0) }
  })
  const relevantSessions = data.sessions.filter((s) => s.items.some((i) => planIds.has(i.exerciseId) && itemDone(i)))
  const painBefore = avg(relevantSessions.flatMap((s) => (s.painBefore === undefined ? [] : [s.painBefore])))
  const painAfter = avg(relevantSessions.flatMap((s) => (s.painAfter === undefined ? [] : [s.painAfter])))

  // Measurements: first vs latest per kind/side (whole history, so change is visible)
  const series = [...data.measurements.reduce((m, x) => m.set(`${x.kind}|${x.side ?? ''}|${x.method ?? ''}|${x.unit}`, [...(m.get(`${x.kind}|${x.side ?? ''}|${x.method ?? ''}|${x.unit}`) ?? []), x]), new Map<string, typeof data.measurements>())]

  // Nutrition: protein on the days anything was logged (a day without logs isn't a day without food)
  const mealDays = dailyTotals(data.meals, days).filter((d) => d.meals)
  const proteinAvg = mealDays.length ? Math.round(mealDays.reduce((a, d) => a + d.protein, 0) / mealDays.length) : undefined
  const goal = profile?.proteinTarget

  async function generate() {
    setWriting(true)
    try {
      setNarrative(await runAi('report-narrative', { context: await buildAiContext({ days, injuryId: injury!.id }) }, setNarrative))
    } finally {
      setWriting(false)
    }
  }

  return (
    <div className="report pb-6">
      <div className="no-print">
        <NavBar title="Clinician Report" back="/insights" />
        <Section className="space-y-3">
          <Chips options={injuries.map((i) => ({ value: i.id, label: i.name }))} value={injury.id} onChange={(v) => setParam('injury', v)} />
          <Segmented options={[...RANGES]} value={String(days) as (typeof RANGES)[number]['value']} onChange={(v) => setParam('days', v)} />
          <div className="grid grid-cols-2 gap-3">
            <AiAction label={narrative ? 'Redo Summary' : 'Add AI Summary'} runningLabel="Writing…" run={generate} className="btn btn-soft w-full" />
            <button className="btn btn-primary" onClick={() => window.print()}>
              <Printer size={18} /> Print or PDF
            </button>
          </div>
          <p className="section-footer !px-1">On iPhone: Print, then pinch out on the preview and Share to save it as a PDF.</p>
        </Section>
      </div>

      <article className="report-body mx-4 mt-6 space-y-5 rounded-[1.375rem] bg-surface p-5">
        <header className="border-b border-line pb-3">
          <p className="text-[0.8125rem] font-semibold tracking-wide text-muted uppercase">Recovery Summary</p>
          <h1 className="text-[1.5rem] font-bold">{injury.name}</h1>
          <p className="text-[0.9375rem] text-muted">
            {profile?.name ? `${profile.name} · ` : ''}
            {formatMediumDate(from)} – {formatMediumDate(Date.now())} ({days} days)
          </p>
        </header>

        <ReportSection title="Condition">
          <Facts
            rows={[
              ['Area', injuryPlace(injury)],
              ['Started', `${formatMediumDate(fromDayKey(injury.startDate))} (${daysBetween(fromDayKey(injury.startDate), Date.now())} days ago)`],
              ['Status', statusLabel(injury.status)],
              ['Diagnosis', injury.diagnosis],
              ['How it started', injury.mechanism],
            ]}
          />
        </ReportSection>

        <ReportSection title="Pain (0–10, self-reported)">
          <Facts
            rows={[
              ['Average over period', `${f1(avg(pain.map((s) => s.severity)))} (${pain.length} logs)`],
              ['First week → last week', `${f1(weeks[0]?.avg)} → ${f1(weeks[weeks.length - 1]?.avg)}`],
              ['By time of day', `Morning ${f1(byHour(5, 12))} · Afternoon ${f1(byHour(12, 17))} · Evening ${f1(byHour(17, 24))}`],
              ['Highest logged', pain.length ? String(Math.max(...pain.map((s) => s.severity))) : '—'],
            ]}
          />
          <div className="mt-3 -mx-1">
            <PainChart points={dailySeries(pain, days)} />
          </div>
          {triggers.length > 0 && (
            <p className="mt-2 text-[0.9375rem]">
              <span className="font-semibold">Common triggers noted: </span>
              {triggers.map(([t, v]) => `${t} (${v.length}×, avg ${f1(avg(v))})`).join('; ')}
            </p>
          )}
        </ReportSection>

        {other.length > 0 && (
          <ReportSection title="Other Symptoms">
            <Facts rows={other.map(([t, v]) => [symptomLabel(t), `${v.length} logs, average ${f1(avg(v))}`])} />
          </ReportSection>
        )}

        {reached.length > 0 && injury && (
          <ReportSection title="How Far Symptoms Reach">
            <Facts
              rows={[
                ['Latest', reachLabel(injury.bodyRegion, reached[reached.length - 1].reach)],
                ['Trend', reachTrend(reached) && `${reachTrendWord[reachTrend(reached)!]} (${reached.length} logs)`],
              ]}
            />
          </ReportSection>
        )}

        {data.checkins.length > 0 && (
          <ReportSection title={`Everyday Function (${data.checkins.length} weekly ${data.checkins.length === 1 ? 'check-in' : 'check-ins'})`}>
            <Facts
              rows={[
                ['Pain and interference (PEG, 0–10, lower is better)', fromTo(fn.peg)],
                ['Own activities (PSFS, 0–10, higher is better)', fromTo(fn.psfs)],
                ['Sitting before pain', fromTo(fn.sit, (v) => toleranceLabel(v) ?? `${v} min`)],
                ['Walking before pain', fromTo(fn.walk, (v) => toleranceLabel(v) ?? `${v} min`)],
                ['Nights woken by pain', fromTo(fn.nights, (v) => `${v} a week`)],
              ]}
            />
          </ReportSection>
        )}

        {plan.length > 0 && (
          <ReportSection title="Rehabilitation">
            <Facts
              rows={[
                ...plan.map((p): [string, string] => {
                  const ex = data.exercises.get(p.exerciseId)
                  const loads = [...data.sessions]
                    .sort((a, b) => a.recordedAt - b.recordedAt)
                    .flatMap((s) => s.items.filter((i) => i.exerciseId === p.exerciseId && itemDone(i)).map((i) => Math.max(0, ...i.sets.filter((x) => x.done).map((x) => x.load ?? 0))))
                    .filter((l) => l > 0)
                  const target = `${p.sets} × ${p.target}${ex?.mode === 'time' ? 's' : ''}${p.load ? ` @ ${p.load} kg` : ''}`
                  return [ex?.name ?? 'Exercise', loads.length > 1 ? `${target} · load ${loads[0]} → ${loads[loads.length - 1]} kg` : target]
                }),
                ['Weekly adherence (last 4 weeks)', rehabWeeks.map((w) => `${w.done}/${w.planned}`).join(' · ')],
                ['Pain before → after sessions', `${f1(painBefore)} → ${f1(painAfter)} (${relevantSessions.length} sessions)`],
              ]}
            />
          </ReportSection>
        )}

        {series.length > 0 && (
          <ReportSection title="Measurements">
            <Facts
              rows={series.map(([, ms]) => {
                const a = ms[0]
                const b = ms[ms.length - 1]
                const label = `${a.kind === 'other' ? a.method : kindInfo(a.kind).label}${sideLabel(a.side) ? ` (${sideLabel(a.side)})` : ''}`
                return [label, ms.length > 1 ? `${a.value} → ${b.value} ${b.unit} (${dayKey(a.recordedAt)} → ${dayKey(b.recordedAt)})` : `${b.value} ${b.unit} (${dayKey(b.recordedAt)})`]
              })}
            />
          </ReportSection>
        )}

        {proteinAvg !== undefined && (
          <ReportSection title="Nutrition (self-logged)">
            <Facts
              rows={[
                ['Protein per day', `${proteinAvg} g on average (${mealDays.length} of ${days} days logged)`],
                ['Daily goal', goal ? `${goal} g · reached on ${mealDays.filter((d) => d.protein >= goal).length} of ${mealDays.length} logged days` : undefined],
              ]}
            />
          </ReportSection>
        )}

        {data.documents.length > 0 && (
          <ReportSection title="Documents">
            <ul className="space-y-1.5 text-[0.9375rem]">
              {data.documents.map((d) => (
                <li key={d.id}>
                  <span className="font-semibold">{d.title}</span> — {kindOf(d.kind).label}, {formatMediumDate(fromDayKey(d.date))}
                  {d.aiSummary && <span className="text-muted"> · AI summary: {d.aiSummary.summary}</span>}
                </li>
              ))}
            </ul>
          </ReportSection>
        )}

        {narrative && (
          <ReportSection title="Summary (AI-drafted from the log above)">
            <p className="leading-relaxed">{narrative.summary ?? '…'}</p>
            {!!narrative.keyChanges?.length && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.9375rem]">
                {narrative.keyChanges.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            )}
            {!!narrative.questions?.length && (
              <>
                <h3 className="mt-3 font-semibold">Questions I’d like to discuss</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-[0.9375rem]">
                  {narrative.questions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </>
            )}
            <p className="mt-2 flex items-center gap-1 text-[0.75rem] text-faint"><Sparkles size={12} className={writing ? 'animate-pulse' : ''} /> {writing ? 'Writing…' : 'Drafted by AI from the patient’s own log; not a clinical assessment.'}</p>
          </ReportSection>
        )}

        <footer className="border-t border-line pt-3 text-[0.75rem] text-faint">
          Prepared with Reclaim from the patient’s self-reported log on {formatMediumDate(Date.now())}. Not a medical record.
        </footer>
      </article>
    </div>
  )
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 text-[1.0625rem] font-bold">{title}</h2>
      {children}
    </section>
  )
}

function Facts({ rows }: { rows: [string, string | undefined][] }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,38%)_1fr] gap-x-3 gap-y-1.5 text-[0.9375rem]">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
    </dl>
  )
}
