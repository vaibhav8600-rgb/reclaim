import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Flame, Sunrise } from 'lucide-react'
import { db } from '../../db/db'
import { useMeta, useSessions } from '../../db/hooks'
import { save, setMeta } from '../../db/repo'
import { MLink } from '../../components/MLink'
import { IconTile } from '../../components/ui'
import { dayKey, startOfDay } from '../../lib/dates'
import { FLARE_KEY, flareDay, morningCheckDue, settledByMorning, type Flare } from '../../lib/rehab'
import { toast } from '../../lib/toast'
import { CompactScale } from './components'

/* The pain-monitoring model and flare-ups: the day-to-day side of recovering safely. */

/** The morning after a session: has the pain settled? Feeds the weekly check (progress / hold / ease). */
export function MorningCheck() {
  const sessions = useSessions(startOfDay(Date.now()) - 2 * 86_400_000)
  const [settled, setSettled] = useState<boolean>()
  if (!sessions) return null
  const due = morningCheckDue(sessions)
  if (!due.length && settled === undefined) return null

  async function answer(n: number | undefined) {
    if (n === undefined) return
    for (const s of due) await save(db.sessions, { ...s, morningPain: n })
    setSettled(settledByMorning({ painBefore: due[0].painBefore, morningPain: n }))
  }

  return (
    <div className="card p-4" data-testid="morning-check">
      <p className="flex items-start gap-3">
        <IconTile icon={Sunrise} color="orange" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{settled === undefined ? 'Morning check' : settled ? 'Settled — carry on' : 'Not settled yet — go easier today'}</span>
          <span className="block text-[0.9375rem] text-muted">
            {settled === undefined
              ? 'How much does it hurt this morning, after yesterday’s rehab?'
              : settled
                ? 'Pain the morning after is back where it was, so your plan can keep building.'
                : 'Fewer sets or a lighter weight today, and keep pain during at 3/10 or below. This week’s check will ease those exercises.'}
          </span>
        </span>
      </p>
      {settled === undefined && <div className="mt-3"><CompactScale label="Pain this morning" value={undefined} onChange={answer} /></div>}
    </div>
  )
}

export async function startFlare() {
  await setMeta(FLARE_KEY, { startedAt: Date.now() } satisfies Flare)
  await save(db.journal, { text: 'Flare-up started: gentler days, half the usual sets.', recordedAt: Date.now(), source: 'user' })
  toast('Flare-up plan on: gentler days, half the usual sets')
}

async function endFlare(f: Flare) {
  await setMeta(FLARE_KEY, null)
  const days = flareDay(f)
  await save(db.journal, { text: `Flare-up ended after ${days} ${days === 1 ? 'day' : 'days'}.`, recordedAt: Date.now(), source: 'user' })
  toast('Flare-up ended — back to your usual plan')
}

/** While a flare-up lasts: what to do, day by day, and the way back to the usual plan. */
export function FlareCard() {
  const flare = useMeta<Flare | null>(FLARE_KEY)
  if (!flare) return null
  const day = flareDay(flare)
  return (
    <div className="card p-4" data-testid="flare-card">
      <p className="flex items-start gap-3">
        <IconTile icon={Flame} color="orange" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Flare-up · day {day}</span>
          <span className="block text-[0.9375rem] text-muted">
            {day <= 3 ? 'Most flare-ups settle within a few days. Gentler days until then:' : 'This is taking longer than most. Check in with your physio, and keep things gentle:'}
          </span>
        </span>
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-[0.9375rem]">
        <li>Keep moving gently — short walks and easy movement. Rest in bed tends to make backs stiffer.</li>
        <li>Rehab sessions start at half the usual sets. Keep pain during at 3/10 or below; skip anything that sharpens it.</li>
        <li>Change position often; avoid heavy lifting and long sitting for now.</li>
        <li>Heat or ice for 15–20 minutes, whichever eases it, and any pain relief your doctor has advised.</li>
      </ul>
      <p className="mt-2 text-[0.875rem] text-muted">
        New numbness, weakness or bladder changes? <MLink to="/safety" className="text-accent">Check the warning signs</MLink>.
      </p>
      <button type="button" className="btn btn-soft mt-3 w-full" onClick={() => endFlare(flare)}>It’s Settling — End Flare-Up</button>
    </div>
  )
}

/** Pain at 7/10 or more today, and no flare-up plan on: offer one. */
export function FlareSuggestion() {
  const flare = useMeta<Flare | null>(FLARE_KEY)
  const dismissed = useMeta<string>('flareDismissed')
  const high = useLiveQuery(async () => (await db.symptoms.where('recordedAt').aboveOrEqual(startOfDay(Date.now())).toArray()).some((s) => !s.deletedAt && s.type === 'pain' && s.severity >= 7), [])
  if (flare || !high || dismissed === dayKey(Date.now())) return null
  return (
    <div className="card p-4" data-testid="flare-suggestion">
      <p className="flex items-start gap-3">
        <IconTile icon={Flame} color="orange" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Pain is high today</span>
          <span className="block text-[0.9375rem] text-muted">Having a flare-up? Reclaim can switch you to gentler days — half the usual sets — until it settles.</span>
        </span>
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn btn-primary flex-1" onClick={startFlare}>Start Flare-Up Plan</button>
        <button type="button" className="btn btn-quiet" onClick={() => setMeta('flareDismissed', dayKey(Date.now()))}>Not Now</button>
      </div>
    </div>
  )
}
