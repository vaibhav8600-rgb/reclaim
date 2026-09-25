import { useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardList, FileText, FolderHeart, HeartPulse, Plus, Sparkles } from 'lucide-react'
import type { AiOutput } from '../../../shared/ai'
import { db, type HealthFact } from '../../db/db'
import { isOpenInjury, useDocuments, useFacts, useInjuries, useMeta } from '../../db/hooks'
import { setMeta } from '../../db/repo'
import { AiAction } from '../../components/ai'
import { runAi } from '../../lib/ai'
import { buildHealthContext } from '../../lib/aiContext'
import { MLink } from '../../components/MLink'
import { EmptyState, GlassButton, Group, IconTile, NavBar, Row, Section } from '../../components/ui'
import { formatMediumDate, fromDayKey, relativeAge } from '../../lib/dates'
import { factKey, factValue, medicineList, type Medicine } from '../../lib/facts'
import { needsReading, needsReview, readDocuments, useReadProgress } from '../../lib/health'
import { DocumentTile } from '../documents/kinds'
import { FACT_KIND_INFO, FACT_ORDER, FlagPill } from './kinds'
import { InjurySuggestions } from './InjurySuggestions'

export function HealthPage() {
  const docs = useDocuments()
  const facts = useFacts()
  if (!docs || !facts) return null

  const toRead = docs.filter(needsReading).sort((a, b) => a.createdAt - b.createdAt) // in the order they were added
  const toReview = docs.filter(needsReview)
  const empty = !docs.length && !facts.length

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Health Profile" back="/injuries" trailing={<GlassButton label="Add records" to="/documents/import"><Plus size={24} strokeWidth={2.2} /></GlassButton>} />

      {empty ? (
        <EmptyState
          icon={HeartPulse}
          title="Your medical history in one place"
          body="Add reports, prescriptions and scan reports. AI reads them into lab results, medicines and diagnoses, and you check each one before it’s saved."
          action={<MLink to="/documents/import" className="btn btn-primary"><Plus size={20} /> Add Records</MLink>}
        />
      ) : (
        <>
          <ReadCard ids={toRead.map((d) => d.id)} />

          {toReview.length > 0 && (
            <Section prominent title="To Review" footer="Check what the AI read before it joins your profile.">
              <Group inset="3.625rem">
                {toReview.length > 1 && (
                  <Row icon={<IconTile icon={Sparkles} color="green" />} title={`Review All ${toReview.length} Records`} subtitle="Every record’s summary and facts on one screen" to="/health/review" />
                )}
                {toReview.map((d) => (
                  <Row
                    key={d.id}
                    icon={<DocumentTile kind={d.kind} />}
                    title={d.title}
                    subtitle={`${d.aiSummary!.facts!.length} ${d.aiSummary!.facts!.length === 1 ? 'fact' : 'facts'} found · ${formatMediumDate(fromDayKey(d.date))}`}
                    to={`/health/review/${d.id}`}
                  />
                ))}
              </Group>
            </Section>
          )}

          <InjurySuggestions />

          <NextStep hasFacts={facts.length > 0} />

          {facts.length > 0 && <Overview />}

          {FACT_ORDER.map((kind) => {
            const list = facts.filter((f) => f.kind === kind)
            if (!list.length) return null
            if (kind === 'medication') return <Medicines key={kind} facts={list} />
            return (
              <Section key={kind} prominent title={FACT_KIND_INFO[kind].plural}>
                <Group inset="3.625rem">{kind === 'lab' ? <LabRows facts={list} /> : list.map((f) => <FactRow key={f.id} fact={f} />)}</Group>
              </Section>
            )
          })}

          <Section footer="Read from your records by AI and checked by you. Your clinician’s copies remain the reference.">
            <Group inset="3.625rem">
              <Row icon={<IconTile icon={Plus} color="gray" />} title="Add a Fact by Hand" to="/health/facts/new" />
              <Row icon={<IconTile icon={FileText} color="blue" />} title="Record Summaries" value={docs.filter((d) => d.aiSummary).length || undefined} to="/health/summaries" />
              <Row icon={<IconTile icon={FolderHeart} color="indigo" />} title="Medical Records" value={docs.length || undefined} to="/documents" />
            </Group>
          </Section>
        </>
      )}
    </div>
  )
}

/** Records not read yet, and the reading in progress (it carries on if you leave this screen). */
function ReadCard({ ids }: { ids: string[] }) {
  const p = useReadProgress()
  if (!ids.length && !p.running && !p.skipped.length) return null
  return (
    <Section prominent title="Reading Records">
      <div className="card p-4">
        {p.running && (
          <div aria-live="polite">
            <p className="font-medium">Reading {Math.min(p.done + 1, p.total)} of {p.total}…</p>
            <p className="truncate text-[0.875rem] text-muted">{p.current}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fill" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done} aria-label="Records read">
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(p.done / Math.max(p.total, 1)) * 100}%` }} />
            </div>
            <p className="mt-2 text-[0.8125rem] text-faint">One at a time, about half a minute each. You can leave this screen.</p>
          </div>
        )}
        {ids.length > 0 && (
          // Stays mounted while reading, so an error or a sign-in prompt from the run can show here afterwards.
          <div className={p.running ? 'hidden' : ''}>
            <p className="mb-3 flex items-start gap-2 text-[0.9375rem]">
              <Sparkles size={17} className="mt-0.5 shrink-0 text-accent" />
              <span>
                {ids.length} {ids.length === 1 ? 'record hasn’t' : 'records haven’t'} been read yet. AI finds the lab results, medicines, diagnoses and scan findings in {ids.length === 1 ? 'it' : 'them'} for you to check.
              </span>
            </p>
            <AiAction label={`Read ${ids.length === 1 ? 'Record' : `${ids.length} Records`} with AI`} runningLabel="Starting…" run={() => readDocuments(ids)} className="btn btn-primary w-full" />
          </div>
        )}
        {!p.running && p.skipped.length > 0 && (
          <div className={ids.length ? 'mt-3 border-t border-line pt-3' : ''}>
            <p className="text-[0.875rem] font-semibold text-muted">Couldn’t read</p>
            <ul className="mt-1 space-y-1 text-[0.875rem]">
              {p.skipped.map((s) => (
                <li key={s.id}>
                  <MLink to={`/documents/${s.id}`} className="font-medium text-accent">{s.title}</MLink> — {s.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  )
}

function FactRow({ fact }: { fact: HealthFact }) {
  const value = factValue(fact)
  const info = FACT_KIND_INFO[fact.kind]
  return (
    <Row
      icon={<IconTile icon={info.icon} color={info.color} />}
      title={fact.name}
      subtitle={[fact.kind === 'vital' ? value : fact.detail, formatMediumDate(fromDayKey(fact.date))].filter(Boolean).join(' · ')}
      value={fact.flag ? <FlagPill flag={fact.flag} /> : undefined}
      to={`/health/facts/${fact.id}`}
    />
  )
}

/** One row per medicine (its latest dose), recent ones first; older ones in their own list. */
function Medicines({ facts }: { facts: HealthFact[] }) {
  const { recent, earlier } = medicineList(facts)
  const info = FACT_KIND_INFO.medication
  const rows = (list: Medicine[]) =>
    list.map((m) => (
      <Row
        key={m.latest.id}
        icon={<IconTile icon={info.icon} color={info.color} />}
        title={m.name}
        subtitle={[m.latest.detail, `${formatMediumDate(fromDayKey(m.latest.date))}${m.count > 1 ? ` · on ${m.count} records` : ''}`].filter(Boolean).join(' · ')}
        to={`/health/facts/${m.latest.id}`}
      />
    ))
  return (
    <>
      {recent.length > 0 && (
        <Section prominent title="Medicines" footer="Prescribed in the last 3 months, from records you’ve checked. Ask your doctor before starting or stopping anything.">
          <Group inset="3.625rem">{rows(recent)}</Group>
        </Section>
      )}
      {earlier.length > 0 && (
        <Section prominent title="Earlier Medicines">
          <Group inset="3.625rem">{rows(earlier)}</Group>
        </Section>
      )}
    </>
  )
}

/** One row per test: its latest result, flagged ones first. */
function LabRows({ facts }: { facts: HealthFact[] }) {
  const byTest = new Map<string, HealthFact[]>()
  for (const f of facts) byTest.set(factKey(f.name), [...(byTest.get(factKey(f.name)) ?? []), f]) // newest first already
  const tests = [...byTest.values()].sort((a, b) => Number(!!b[0].flag) - Number(!!a[0].flag) || a[0].name.localeCompare(b[0].name))
  const info = FACT_KIND_INFO.lab
  return tests.map((results) => {
    const latest = results[0]
    return (
      <Row
        key={latest.id}
        icon={<IconTile icon={info.icon} color={info.color} />}
        title={latest.name}
        subtitle={`${formatMediumDate(fromDayKey(latest.date))}${results.length > 1 ? ` · ${results.length} results` : ''}`}
        value={
          <span className="flex items-center gap-2">
            <span className="max-w-36 truncate text-ink tabular-nums">{factValue(latest)}</span>
            <FlagPill flag={latest.flag} />
          </span>
        }
        to={`/health/lab?name=${encodeURIComponent(latest.name)}`}
      />
    )
  })
}

interface StoredOverview {
  result: AiOutput<'health-summary'>
  at: number
}

/** One AI overview across every confirmed record: what's out of range, what changed, what to ask. */
function Overview() {
  const stored = useMeta<StoredOverview>('healthSummary')
  const lastChange = useLiveQuery(async () => (await db.facts.orderBy('updatedAt').last())?.updatedAt ?? 0, [])
  const [writing, setWriting] = useState<Partial<AiOutput<'health-summary'>>>()
  const stale = !!stored && lastChange !== undefined && lastChange > stored.at

  async function run() {
    try {
      const result = await runAi('health-summary', { context: await buildHealthContext() }, setWriting)
      await setMeta('healthSummary', { result, at: Date.now() } satisfies StoredOverview)
    } finally {
      setWriting(undefined)
    }
  }

  const shown = writing ?? stored?.result
  return (
    <Section prominent title="Overview" footer={stale && !writing ? 'Your records have changed since this overview.' : undefined}>
      {shown && (
        <div className="card animate-pop mb-3 p-4" aria-live={writing ? 'polite' : undefined}>
          <p className="flex items-start gap-2 leading-relaxed">
            <Sparkles size={18} className="mt-1 shrink-0 text-accent" />
            <span>{shown.overview || '…'}</span>
          </p>
          <OverviewList title="Needs Attention" items={shown.attention?.map((a) => a && <><span className="font-semibold">{a.label}</span>{a.detail ? `: ${a.detail}` : ''}</>)} />
          <OverviewList title="Changes Over Time" items={shown.trends} />
          <OverviewList title="Questions for Your Doctor" items={shown.questions} />
          <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-2 text-[0.75rem] text-faint">
            {writing ? <><Sparkles size={12} className="animate-pulse" /> Writing…</> : `AI overview of your confirmed records · updated ${relativeAge(stored!.at)}. Not medical advice — check with your clinician.`}
          </p>
        </div>
      )}
      {/* Stays mounted while writing, so an error from the run can still show. */}
      <div className={writing ? 'hidden' : ''}>
        <AiAction
          label={stored ? 'Update Overview' : 'Summarize My Health'}
          runningLabel="Reading your records…"
          run={run}
          className={stored && !stale ? 'btn btn-quiet w-full' : 'btn btn-soft w-full'}
        />
      </div>
      {!stored && !writing && <p className="section-footer">One summary across all your records: results outside their ranges, how repeated tests changed, and questions for your doctor.</p>}
    </Section>
  )
}

function OverviewList({ title, items }: { title: string; items?: ReactNode[] }) {
  const shown = items?.filter(Boolean)
  if (!shown?.length) return null
  return (
    <section className="mt-3">
      <h3 className="text-[0.8125rem] font-semibold text-muted uppercase">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-[0.9375rem]">
        {shown.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </section>
  )
}

/** Once records are in and an injury is tracked: the way on to the recovery plan. */
function NextStep({ hasFacts }: { hasFacts: boolean }) {
  const injuries = useInjuries()
  const plan = useMeta<unknown>('recoveryPlan')
  if (!hasFacts || plan || !injuries?.some(isOpenInjury)) return null
  return (
    <Section>
      <MLink to="/plan" className="card cell cell-press !items-start !py-4">
        <IconTile icon={ClipboardList} color="green" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Next: your recovery plan</span>
          <span className="block text-[0.875rem] text-muted">Exercises from a checked library, protein and water targets — built from your injuries, logs and these records.</span>
        </span>
      </MLink>
    </Section>
  )
}
