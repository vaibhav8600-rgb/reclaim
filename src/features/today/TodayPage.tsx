import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router'
import { MLink } from '../../components/MLink'
import { useLiveQuery } from 'dexie-react-hooks'
import { Activity, ArrowDownRight, ArrowUpRight, Bandage, ChevronRight, ClipboardList, CloudDownload, ClipboardCheck, CloudUpload, HeartPulse, Plus, Ruler, ShieldCheck, Smartphone, Sparkles, UserRound } from 'lucide-react'
import { db } from '../../db/db'
import { isOpenInjury, useEntries, useInjuries, useInjuryMap, useMeta, usePrescriptions, useProfile, useSymptomsSince } from '../../db/hooks'
import { alive, setMeta } from '../../db/repo'
import { ENTRY_INSET, EntryRow } from '../../components/EntryRow'
import { PainChart } from '../../components/PainChart'
import { Avatar, GlassButton, Group, IconTile, NavBar, Section, SeverityBadge, Tip } from '../../components/ui'
import { kindInfo, severityWord } from '../../lib/constants'
import { daysAgo, formatLongDate, relativeAge, startOfDay } from '../../lib/dates'
import { GOOGLE_CLIENT_ID } from '../../lib/google'
import { AtAGlance } from './AtAGlance'
import { isIOS, isStandalone } from '../../lib/platform'
import { checkInDue } from '../../lib/checkin'
import { NERVE_SYMPTOMS, SAFETY_CHECK_AT, safetyCheckDue } from '../../lib/safety'
import { dailySeries, round1, windowAverage } from '../../lib/stats'
import { WeekCard } from '../rehab/components'
import { FlareCard, FlareSuggestion, MorningCheck } from '../rehab/recovery'
import type { StoredSummary } from '../insights/InsightsPage'

export function TodayPage() {
  const { openLog } = useOutletContext<{ openLog: () => void }>()
  const profile = useProfile()
  const injuries = useInjuries()
  const injuryMap = useInjuryMap()
  const open = injuries?.filter(isOpenInjury) ?? []
  const today = useEntries({ from: startOfDay(Date.now()) })
  // undefined while loading: the restore link waits for the answer instead of flashing in and out.
  const driveLinked = useLiveQuery(async () => !!(await db.meta.get('drive')), [])
  const setupDone = useLiveQuery(async () => !!(await db.meta.get('setupDone'))?.value, [])

  if (!injuries || !today || driveLinked === undefined || setupDone === undefined) return null
  // A first-run welcome until setup is done or skipped, or goals already exist (e.g. restored from a backup).
  const needsSetup = !setupDone && !(profile?.height || profile?.proteinTarget || profile?.waterTarget || profile?.stepsTarget || profile?.sleepTarget)
  const initial = profile?.name?.trim()[0]?.toUpperCase()

  return (
    <div className="space-y-7 pb-4">
      <NavBar
        title="Today"
        subtitle={formatLongDate(Date.now())}
        trailing={
          <GlassButton label="Profile and settings" to="/settings">
            {profile?.photo ? <span className="-mx-2.5"><Avatar photo={profile.photo} size={44} /></span> : initial ? <span className="font-rounded text-[1.0625rem]">{initial}</span> : <UserRound size={21} />}
          </GlassButton>
        }
      />

      <Nudges hasData={injuries.length > 0} regions={open.map((i) => i.bodyRegion)} />

      {needsSetup && (
        <Section>
          <div className="card p-4">
            <p className="flex items-start gap-3">
              <IconTile icon={Sparkles} color="green" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Welcome to Reclaim</span>
                <span className="block text-[0.9375rem] text-muted">Tell it a little about you — a minute, all optional — and it sets starting goals for you.</span>
              </span>
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <MLink to="/welcome" className="btn btn-primary w-full">Set Up</MLink>
              {/* After Sign Out (or on a new iPhone), the way back to an encrypted Drive backup */}
              {GOOGLE_CLIENT_ID && !driveLinked && <MLink to="/settings/drive" className="btn btn-quiet w-full"><CloudDownload size={19} /> Restore from Google Drive</MLink>}
            </div>
          </div>
        </Section>
      )}

      <AtAGlance profile={profile} />

      {injuries.length === 0 ? (
        <Section prominent title="Recovery">
          <div className="card flex items-center gap-3 p-4">
            <IconTile icon={Bandage} color="pink" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">What are you recovering from?</span>
              <span className="block text-[0.875rem] text-muted">Add an injury to track pain and get a recovery plan.</span>
            </span>
            <MLink to="/injuries/new" className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-[0.9375rem] font-semibold text-accent-ink">Add Injury</MLink>
          </div>
        </Section>
      ) : (
        <PainCard injuryIds={open.map((i) => i.id)} names={new Map(open.map((i) => [i.id, i.name]))} />
      )}

      {injuries.length > 0 && <InsightsToday />}

      {open.length > 0 && <PlanToday />}

      <RehabToday hasInjuries={injuries.length > 0} />

      <LatestMeasurements />

      <Section
        prominent
        title="Logged Today"
        action={today.entries.length > 0 ? <MLink to="/timeline" className="text-accent">Show All</MLink> : undefined}
      >
        {today.entries.length ? (
          <Group inset={ENTRY_INSET}>
            {today.entries.map((e) => (
              <EntryRow key={`${e.kind}-${e.item.id}`} entry={e} injuries={injuryMap} />
            ))}
          </Group>
        ) : (
          <button onClick={openLog} className="card cell cell-press !py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent"><Plus size={20} strokeWidth={2.4} /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Nothing logged yet</span>
              <span className="block text-[0.875rem] text-muted">Tap + anytime. A pain log takes two taps.</span>
            </span>
          </button>
        )}
      </Section>
    </div>
  )
}

function PainCard({ injuryIds, names }: { injuryIds: string[]; names: Map<string, string> }) {
  const [picked, setPicked] = useState<string>()
  const injuryId = picked && injuryIds.includes(picked) ? picked : injuryIds.length === 1 ? injuryIds[0] : undefined
  const symptoms = useSymptomsSince(daysAgo(27), injuryId)
  const series = useMemo(() => (symptoms ? dailySeries(symptoms, 14) : []), [symptoms])
  if (!symptoms) return null

  const thisWeek = windowAverage(symptoms, daysAgo(6), Infinity)
  const lastWeek = windowAverage(symptoms, daysAgo(13), daysAgo(6))
  const delta = thisWeek !== null && lastWeek !== null ? round1(thisWeek - lastWeek) : null
  const latest = symptoms.reduce<(typeof symptoms)[number] | undefined>((a, b) => (!a || b.recordedAt > a.recordedAt ? b : a), undefined)
  const detailLink = injuryId ? `/injuries/${injuryId}` : '/timeline'

  return (
    <Section prominent title="Pain">
      {injuryIds.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
          <button className="chip" aria-pressed={!injuryId} onClick={() => setPicked(undefined)}>All</button>
          {injuryIds.map((id) => (
            <button key={id} className="chip" aria-pressed={injuryId === id} onClick={() => setPicked(id)}>{names.get(id)}</button>
          ))}
        </div>
      )}
      <div className="card p-4">
        <MLink to={detailLink} className="mb-3 flex items-center gap-1.5 font-semibold text-tile-pink active:opacity-60">
          <Activity size={18} strokeWidth={2.4} />
          <span className="flex-1">{injuryId ? names.get(injuryId) : 'All injuries'}</span>
          {latest && <span className="text-[0.875rem] font-normal text-muted">{relativeAge(latest.recordedAt)}</span>}
          <ChevronRight size={17} className="text-faint" />
        </MLink>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[0.8125rem] font-semibold text-muted uppercase">7-Day Average</p>
            <p className="font-rounded text-[2.75rem] leading-none font-semibold">
              <span data-testid="pain-avg">{thisWeek === null ? '—' : thisWeek.toFixed(1)}</span>
              <span className="ml-1 text-[1.0625rem] font-medium text-muted">/ 10</span>
            </p>
          </div>
          {latest && (
            <div className="flex items-center gap-2 text-right">
              <div>
                <p className="text-[0.8125rem] font-semibold text-muted uppercase">Latest</p>
                <p className="text-[0.8125rem] text-muted">{severityWord(latest.severity)}</p>
              </div>
              <span data-testid="pain-latest"><SeverityBadge value={latest.severity} /></span>
            </div>
          )}
        </div>
        {delta !== null && (
          <p className={`mt-2 flex items-center gap-1 text-[0.9375rem] font-medium ${delta < 0 ? 'text-accent' : 'text-muted'}`}>
            {delta < 0 ? <ArrowDownRight size={17} /> : delta > 0 ? <ArrowUpRight size={17} /> : null}
            {delta === 0 ? 'Same as the week before' : `${Math.abs(delta)} ${delta < 0 ? 'lower' : 'higher'} than the week before`}
          </p>
        )}
        <div className="mt-4 -mx-1">
          <PainChart points={series} />
        </div>
        <p className="mt-1 text-[0.8125rem] text-faint">Daily average, last 14 days. Touch and drag to see each day.</p>
      </div>
    </Section>
  )
}

function LatestMeasurements() {
  const latest = useLiveQuery(async () => {
    const rows = (await db.measurements.orderBy('recordedAt').reverse().toArray()).filter(alive)
    const seen = new Map<string, (typeof rows)[number]>()
    for (const m of rows) {
      if (m.kind === 'weight') continue // weight has its own row in At a Glance
      const key = `${m.kind}|${m.kind === 'other' ? m.method : ''}|${m.side ?? ''}`
      if (!seen.has(key)) seen.set(key, m)
    }
    return [...seen.values()].slice(0, 4)
  }, [])
  if (!latest?.length) return null
  return (
    <Section prominent title="Measurements">
      <div className="grid grid-cols-2 gap-3">
        {latest.map((m) => {
          const info = kindInfo(m.kind)
          return (
            <MLink key={m.id} to={`/log/measurement?id=${m.id}`} className="card p-3.5 active:opacity-70">
              <p className="flex items-center gap-1.5 truncate text-[0.875rem] font-semibold text-tile-blue">
                <Ruler size={15} strokeWidth={2.4} />
                {info.value === 'other' ? m.method || 'Other' : info.label}
                {m.side && m.side !== 'none' ? ` · ${m.side[0].toUpperCase()}` : ''}
              </p>
              <p className="font-rounded mt-1.5 text-[1.75rem] leading-tight font-semibold">
                {m.value}
                <span className="ml-0.5 text-[0.9375rem] font-medium text-muted">{m.unit}</span>
              </p>
              <p className="text-[0.8125rem] text-muted">{relativeAge(m.recordedAt)}</p>
            </MLink>
          )
        })}
      </div>
    </Section>
  )
}

/** Gentle nudges that protect the person and the data: the warning-sign check, install to Home Screen, keep a backup. */
function Nudges({ hasData, regions }: { hasData: boolean; regions: string[] }) {
  const dismissedInstall = useMeta<boolean>('dismissedInstall')
  const lastBackupAt = useMeta<number>('lastBackupAt')
  const firstEntryAt = useLiveQuery(async () => (await db.symptoms.orderBy('recordedAt').first())?.recordedAt, [])
  const toReview = useLiveQuery(async () => (await db.documents.toArray()).filter((d) => !d.deletedAt && d.aiSummary?.facts?.length && !d.aiSummary.reviewedAt).length, [])

  const safetyCheckAt = useMeta<number>(SAFETY_CHECK_AT)
  const lastNerveAt = useLiveQuery(async () => {
    const recent = await db.symptoms.where('recordedAt').above(daysAgo(3)).toArray()
    return Math.max(0, ...recent.filter((s) => !s.deletedAt && NERVE_SYMPTOMS.includes(s.type)).map((s) => s.recordedAt)) || undefined
  }, [])
  const safety = safetyCheckDue(regions, safetyCheckAt, lastNerveAt)
  // null once loaded with none yet (undefined while loading)
  const lastCheckInAt = useLiveQuery(async () => (await db.checkins.orderBy('recordedAt').reverse().filter((c) => !c.deletedAt).first())?.recordedAt ?? null, [])
  // One health prompt at a time: the safety check first.
  const checkIn = !safety && lastCheckInAt !== undefined && checkInDue(regions.length > 0, lastCheckInAt ?? undefined)

  const showInstall = isIOS() && !isStandalone() && dismissedInstall !== true
  const backupDue = hasData && firstEntryAt !== undefined && (lastBackupAt ?? firstEntryAt) < daysAgo(7)

  if (!safety && !checkIn && !showInstall && !backupDue && !toReview) return null
  return (
    <Section className="space-y-3">
      {safety && (
        <Tip
          icon={ShieldCheck}
          color="orange"
          title={safety === 'nerve' ? 'You logged numbness, tingling or weakness' : 'Weekly safety check'}
          body="A few yes-or-no questions about warning signs that need a doctor. About 30 seconds."
          to="/safety"
        />
      )}
      {checkIn && (
        <Tip
          icon={ClipboardCheck}
          color="green"
          title="Weekly check-in"
          body="How pain affected your week — sitting, walking, sleep and the things you find hard. About a minute."
          to="/checkin"
        />
      )}
      {showInstall && (
        <Tip
          icon={Smartphone}
          color="gray"
          title="Add Reclaim to your Home Screen"
          body="Tap Share, then “Add to Home Screen”. It opens full screen, works offline, and Safari won't clear your data."
          onDismiss={() => setMeta('dismissedInstall', true)}
        />
      )}
      {!!toReview && (
        <Tip
          icon={HeartPulse}
          color="pink"
          title={`${toReview} ${toReview === 1 ? 'record is' : 'records are'} ready to review`}
          body="Check the lab results, medicines and findings the AI read before they join your Health Profile."
          to="/health/review"
        />
      )}
      {backupDue && (
        <Tip
          icon={CloudUpload}
          color="blue"
          title={lastBackupAt ? `Last backup ${relativeAge(lastBackupAt)}` : 'Back up your recovery data'}
          body="Your data lives only on this iPhone. Save a backup to Files or Google Drive."
          to="/settings#backup"
        />
      )}
    </Section>
  )
}

/** Rehab: a flare-up or the morning-after check when there is one, then progress (or a prompt to add exercises). */
function RehabToday({ hasInjuries }: { hasInjuries: boolean }) {
  const prescriptions = usePrescriptions()
  if (!prescriptions || !hasInjuries) return null
  return (
    <Section prominent title="Rehab" action={<MLink to="/rehab" className="text-accent">Plan</MLink>}>
      <div className="space-y-3">
        <FlareCard />
        <FlareSuggestion />
        <MorningCheck />
        {prescriptions.some((p) => p.active) ? (
          <WeekCard compact />
        ) : (
          <MLink to="/rehab/library" className="card cell cell-press !py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent"><Plus size={20} strokeWidth={2.4} /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Add your physio exercises</span>
              <span className="block text-[0.875rem] text-muted">Track sets, reps and how your body responds.</span>
            </span>
            <ChevronRight size={18} className="text-faint" />
          </MLink>
        )}
      </div>
    </Section>
  )
}

/** The latest AI weekly summary headline, or an invitation to create one. */
function InsightsToday() {
  const summary = useMeta<StoredSummary>('weeklySummary')
  return (
    <Section prominent title="Insights">
      <MLink to="/insights" className="card cell cell-press !items-start !py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Sparkles size={19} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{summary ? summary.result.headline : 'Your weekly summary'}</span>
          <span className="block text-[0.875rem] text-muted">{summary ? `Updated ${relativeAge(summary.at)} · Ask a question` : 'How this week compares, and questions for your clinician'}</span>
        </span>
        <ChevronRight size={18} className="mt-2 text-faint" />
      </MLink>
    </Section>
  )
}

/** The recovery plan: its state, or an invitation to draft one. */
function PlanToday() {
  const plan = useMeta<{ at: number; acceptedAt?: number; result: { exercises: unknown[] } }>('recoveryPlan')
  return (
    <Section prominent title="Recovery Plan">
      <MLink to="/plan" className="card cell cell-press !items-start !py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><ClipboardList size={19} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{plan ? (plan.acceptedAt ? 'Your plan and this week’s check' : 'Your draft plan is ready') : 'Draft a plan for your recovery'}</span>
          <span className="block text-[0.875rem] text-muted">{plan ? `Created ${relativeAge(plan.at)} · update it every week or two` : 'Exercises from a checked library, protein and water targets, and what to watch for'}</span>
        </span>
        <ChevronRight size={18} className="mt-2 text-faint" />
      </MLink>
    </Section>
  )
}

