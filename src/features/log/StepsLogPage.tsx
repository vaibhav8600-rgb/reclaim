import { useEffect, useState, type ChangeEvent } from 'react'
import { useSearchParams } from 'react-router'
import { db } from '../../db/db'
import { restore, save, softDelete } from '../../db/repo'
import { DateRow, Group } from '../../components/ui'
import { activityId } from '../../lib/daily'
import { dayKey, formatMediumDate, fromDayKey } from '../../lib/dates'
import { haptic } from '../../lib/haptics'
import { useBack } from '../../lib/nav'
import { toast } from '../../lib/toast'
import { DeleteRow, SheetForm } from './shared'

const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')))

/** A day's steps (and, optionally, active minutes and distance). One record per day: logging again updates it. */
export function StepsLogPage() {
  const [params] = useSearchParams()
  const back = useBack('/', 'sheet-down')
  const [day, setDay] = useState(params.get('date') ?? dayKey(Date.now()))
  const [form, setForm] = useState<{ steps: string; minutes: string; km: string; existing: boolean }>()

  // Load whatever is already logged for the chosen day, so this edits rather than duplicates.
  useEffect(() => {
    db.activity.get(activityId(day)).then((a) => {
      const live = a && !a.deletedAt ? a : undefined
      setForm({ steps: live?.steps?.toString() ?? '', minutes: live?.activeMinutes?.toString() ?? '', km: live?.distance?.toString() ?? '', existing: !!live })
    })
  }, [day])

  if (!form) return null
  const steps = num(form.steps)
  const minutes = num(form.minutes)
  const km = num(form.km)
  const numbersOk = [steps, minutes, km].every((v) => v === undefined || (Number.isFinite(v) && v >= 0))
  const valid = numbersOk && (steps !== undefined || minutes !== undefined || km !== undefined)

  async function submit() {
    haptic()
    const id = activityId(day)
    if ((await db.activity.get(id))?.deletedAt) await restore(db.activity, id) // logging a deleted day again brings it back
    await save(db.activity, {
      id,
      date: day,
      steps: steps === undefined ? undefined : Math.round(steps),
      activeMinutes: minutes,
      distance: km,
      source: 'user',
    })
    toast(steps !== undefined ? `${Math.round(steps).toLocaleString()} steps saved` : 'Activity saved')
    back()
  }

  async function remove() {
    const id = activityId(day)
    await softDelete(db.activity, id)
    toast('Activity deleted', { label: 'Undo', onClick: () => restore(db.activity, id) })
    back()
  }

  const set = (k: 'steps' | 'minutes' | 'km') => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })
  return (
    <SheetForm title="Steps & Activity" canSave={valid} onSubmit={submit} onClose={back}>
      <div>
        <span className="section-label block">Steps</span>
        <label className="card flex items-baseline gap-2 px-5 py-3">
          <input className="font-rounded w-full min-w-0 bg-transparent text-[2.5rem] font-semibold outline-none placeholder:text-faint" inputMode="numeric" value={form.steps} onChange={set('steps')} placeholder="0" aria-label="Steps" autoFocus={!form.existing} />
          <span className="shrink-0 text-[1.25rem] font-medium text-muted">steps</span>
        </label>
        <p className="section-footer">Copy today’s number from your phone’s Health or Fitness app.</p>
      </div>

      <Group>
        <DateRow label="Day" type="date" value={day} max={dayKey(Date.now())} display={formatMediumDate(fromDayKey(day))} onChange={setDay} />
        <label className="cell">
          <span className="flex-1">Active Minutes</span>
          <input className="w-20 bg-transparent text-right outline-none placeholder:text-faint" inputMode="numeric" value={form.minutes} onChange={set('minutes')} placeholder="Optional" aria-label="Active minutes" />
          <span className="text-muted">min</span>
        </label>
        <label className="cell">
          <span className="flex-1">Distance</span>
          <input className="w-20 bg-transparent text-right outline-none placeholder:text-faint" inputMode="decimal" value={form.km} onChange={set('km')} placeholder="Optional" aria-label="Distance" />
          <span className="text-muted">km</span>
        </label>
      </Group>

      {form.existing && <DeleteRow label="Delete This Day’s Activity" onDelete={remove} />}
    </SheetForm>
  )
}
