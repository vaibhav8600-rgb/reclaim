import { useEffect, useMemo, useState } from 'react'
import { Heart } from 'lucide-react'
import { db } from '../../db/db'
import { useLiveQuery } from 'dexie-react-hooks'
import { restore, save } from '../../db/repo'
import { EmptyState, Group, NavBar, Row, Section } from '../../components/ui'
import { MLink } from '../../components/MLink'
import { activityId, formatHours } from '../../lib/daily'
import { formatMediumDate, fromDayKey } from '../../lib/dates'
import { isEmptyImport, parseHealthExport, type HealthImport } from '../../lib/healthImport'
import { useGo } from '../../lib/nav'
import { toast } from '../../lib/toast'

export const HEALTH_KEY = 'healthImportKey'
const MAX_HASH = 200_000

/** Save what the Shortcut sent. Deterministic ids: importing the same data twice changes nothing. */
async function apply(h: HealthImport) {
  for (const day of new Set([...h.steps.keys(), ...h.exercise.keys()])) {
    const id = activityId(day)
    const existing = await db.activity.get(id)
    if (existing?.deletedAt) await restore(db.activity, id)
    await save(db.activity, { id, date: day, steps: h.steps.get(day) ?? existing?.steps, activeMinutes: h.exercise.get(day) ?? existing?.activeMinutes, distance: existing?.distance, source: 'device' })
  }
  for (const w of h.weights) {
    const id = `health-weight-${w.at}`
    if ((await db.measurements.get(id))?.deletedAt) continue // deleted on purpose: stays deleted
    await save(db.measurements, { id, kind: 'weight', value: w.kg, unit: 'kg', method: 'Apple Health', recordedAt: w.at, source: 'device' })
  }
  const logged = (await db.sleep.toArray()).filter((s) => !s.deletedAt && !s.id.startsWith('health-sleep-'))
  for (const n of h.nights) {
    const id = `health-sleep-${n.bedAt}`
    if ((await db.sleep.get(id))?.deletedAt) continue
    // A night already logged by hand isn't doubled.
    if (logged.some((s) => Math.abs(s.wakeAt - n.wakeAt) < 3 * 3_600_000)) continue
    await save(db.sleep, { id, bedAt: n.bedAt, wakeAt: n.wakeAt, source: 'device' })
  }
}

const describe = (h: HealthImport) =>
  [
    h.steps.size && `${h.steps.size} ${h.steps.size === 1 ? 'day' : 'days'} of steps`,
    h.exercise.size && `${h.exercise.size} ${h.exercise.size === 1 ? 'day' : 'days'} of exercise`,
    h.weights.length && `${h.weights.length} ${h.weights.length === 1 ? 'weight' : 'weights'}`,
    h.nights.length && `${h.nights.length} ${h.nights.length === 1 ? 'night' : 'nights'} of sleep`,
  ].filter(Boolean).join(' · ')

/**
 * Where the Apple Health Shortcut lands. With the personal key in the link, it imports straight away (the daily
 * automation); otherwise it shows what came in and waits for a tap, so a link from anywhere else can't slip data in.
 */
export function HealthImportPage() {
  const go = useGo()
  // null once loaded and never set up (undefined only while loading)
  const key = useLiveQuery(async () => ((await db.meta.get(HEALTH_KEY))?.value as string | undefined) ?? null, [])
  const params = useMemo(() => new URLSearchParams(window.location.hash.slice(1, MAX_HASH)), [])
  const data = useMemo(() => parseHealthExport(params.get('d') ?? ''), [params])
  const [state, setState] = useState<'review' | 'saving' | 'done'>('review')
  const trusted = !!key && params.get('k') === key

  async function importNow() {
    setState('saving')
    await apply(data)
    history.replaceState(null, '', window.location.pathname) // the data leaves the address bar
    setState('done')
    toast(`Imported from Apple Health: ${describe(data)}`)
    go('/', 'pop', { replace: true })
  }

  useEffect(() => {
    if (trusted && !isEmptyImport(data) && state === 'review') void importNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trusted])

  if (key === undefined) return null // wait for the key before deciding whether to ask
  if (isEmptyImport(data)) {
    return (
      <div className="space-y-7 pb-4">
        <NavBar title="Apple Health" back="/settings" />
        <EmptyState icon={Heart} title="Nothing to import" body="The link didn’t carry any steps, weight or sleep. Check the Shortcut’s steps in Settings → Apple Health." action={<MLink to="/settings/health" className="btn btn-primary">Setup Guide</MLink>} />
      </div>
    )
  }

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Import from Apple Health" back="/" />
      <Section footer={data.skipped ? `${data.skipped} ${data.skipped === 1 ? 'line wasn’t' : 'lines weren’t'} understood and will be skipped.` : 'Steps and weights you deleted stay deleted; nights you logged by hand aren’t doubled.'}>
        <div className="card p-4">
          <p className="font-semibold">{describe(data)}</p>
          <p className="text-[0.875rem] text-muted">Check it looks right, then import.</p>
        </div>
      </Section>
      <Section title="Preview">
        <Group>
          {[...data.steps].sort(([a], [b]) => b.localeCompare(a)).slice(0, 7).map(([day, n]) => <Row key={`s${day}`} title={`${n.toLocaleString()} steps`} value={formatMediumDate(fromDayKey(day))} />)}
          {data.weights.slice(-5).reverse().map((w) => <Row key={`w${w.at}`} title={`${w.kg} kg`} value={formatMediumDate(w.at)} />)}
          {data.nights.slice(-5).reverse().map((n) => <Row key={`n${n.bedAt}`} title={`Sleep ${formatHours((n.wakeAt - n.bedAt) / 3_600_000)}`} value={formatMediumDate(n.wakeAt)} />)}
        </Group>
      </Section>
      <Section>
        <button type="button" className="btn btn-primary w-full" disabled={state !== 'review'} onClick={importNow}>{state === 'review' ? 'Import' : 'Importing…'}</button>
      </Section>
    </div>
  )
}
