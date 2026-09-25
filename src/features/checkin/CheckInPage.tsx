import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { db, type CheckIn } from '../../db/db'
import { save } from '../../db/repo'
import { Chips } from '../../components/ui'
import { ACTIVITY_IDEAS, TOLERANCE } from '../../lib/checkin'
import { haptic } from '../../lib/haptics'
import { useBack } from '../../lib/nav'
import { toast } from '../../lib/toast'
import { SheetForm } from '../log/shared'
import { CompactScale } from '../rehab/components'

type Draft = Omit<CheckIn, 'id' | 'createdAt' | 'updatedAt' | 'source' | 'recordedAt'>

/** The weekly check-in: how pain affects everyday life (PEG), tolerances, sleep, and your own hardest activities. */
export function CheckInPage() {
  const back = useBack('/', 'sheet-down')
  const [d, setD] = useState<Draft>()

  // The same activities as last time, so they can be compared week to week.
  useEffect(() => {
    db.checkins.orderBy('recordedAt').reverse().filter((c) => !c.deletedAt).first().then((last) => {
      setD({ activities: last?.activities?.map((a) => ({ name: a.name, score: -1 })) ?? [] })
    })
  }, [])

  if (!d) return null
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v })
  const activities = d.activities ?? []
  const setActivity = (i: number, patch: Partial<{ name: string; score: number }>) => set('activities', activities.map((a, k) => (k === i ? { ...a, ...patch } : a)))
  const rated = activities.filter((a) => a.name.trim() && a.score >= 0)
  const answered = d.pain !== undefined || d.sitMinutes !== undefined || d.walkMinutes !== undefined || d.nightsWoken !== undefined || rated.length > 0

  async function submit() {
    haptic()
    await save(db.checkins, { ...d, activities: rated.length ? rated.map((a) => ({ name: a.name.trim(), score: a.score })) : undefined, recordedAt: Date.now(), source: 'user' })
    toast('Check-in saved')
    back()
  }

  return (
    <SheetForm title="Weekly Check-in" canSave={answered} onSubmit={submit} onClose={back}>
      <p className="-mt-2 px-1 text-[0.9375rem] text-muted">How the past week went — beyond the pain score. About a minute; skip anything.</p>

      <div className="space-y-4">
        <CompactScale label="Pain on average this week" value={d.pain} onChange={(v) => set('pain', v)} />
        <CompactScale label="How much it got in the way of enjoying life" value={d.enjoyment} onChange={(v) => set('enjoyment', v)} />
        <CompactScale label="How much it got in the way of your usual activities" value={d.generalActivity} onChange={(v) => set('generalActivity', v)} />
        <p className="section-footer !mt-1">0 = none or not at all · 10 = worst imaginable or completely</p>
      </div>

      <Tolerance label="How Long Can You Sit Before It Hurts?" value={d.sitMinutes} onChange={(v) => set('sitMinutes', v)} />
      <Tolerance label="How Long Can You Walk Before It Hurts?" value={d.walkMinutes} onChange={(v) => set('walkMinutes', v)} />

      <CompactScale label="Nights woken by pain this week" max={7} value={d.nightsWoken} onChange={(v) => set('nightsWoken', v)} />

      <div>
        <span className="section-label block">Activities You Find Hard</span>
        <p className="section-footer !mt-0 mb-2">Up to three things pain makes difficult. Rate each: 0 = can’t do it, 10 = as well as before.</p>
        <div className="space-y-3">
          {activities.map((a, i) => (
            <div key={i} className="card p-3">
              <div className="flex items-center gap-2">
                <input className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-faint" value={a.name} onChange={(e) => setActivity(i, { name: e.target.value })} placeholder="e.g. Sitting at work" aria-label={`Activity ${i + 1}`} maxLength={80} />
                <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-muted" aria-label={`Remove ${a.name || 'activity'}`} onClick={() => set('activities', activities.filter((_, k) => k !== i))}>
                  <X size={15} strokeWidth={2.6} />
                </button>
              </div>
              <div className="mt-2"><CompactScale label={`${a.name || 'Activity'} ability`} value={a.score >= 0 ? a.score : undefined} onChange={(v) => setActivity(i, { score: v ?? -1 })} /></div>
            </div>
          ))}
        </div>
        {activities.length < 3 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ACTIVITY_IDEAS.filter((idea) => !activities.some((a) => a.name === idea)).map((idea) => (
              <button key={idea} type="button" className="chip !min-h-8 !text-[0.875rem]" onClick={() => set('activities', [...activities, { name: idea, score: -1 }])}>+ {idea}</button>
            ))}
            <button type="button" className="chip !min-h-8 !text-[0.875rem]" onClick={() => set('activities', [...activities, { name: '', score: -1 }])}>+ Something else</button>
          </div>
        )}
      </div>
    </SheetForm>
  )
}

function Tolerance({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <div>
      <span className="section-label block">{label}</span>
      <Chips wrap options={TOLERANCE.map((t) => ({ value: String(t.minutes), label: t.label }))} value={value === undefined ? undefined : String(value)} onChange={(v) => onChange(value === Number(v) ? undefined : Number(v))} />
    </div>
  )
}
