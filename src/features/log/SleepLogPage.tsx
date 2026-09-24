import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { db } from '../../db/db'
import { restore, save, softDelete } from '../../db/repo'
import { Chips, DateRow, Field, Group } from '../../components/ui'
import { SLEEP_QUALITY, formatHours, sleepHours } from '../../lib/daily'
import { formatWhen, fromLocalInput, startOfDay, toLocalInput } from '../../lib/dates'
import { haptic } from '../../lib/haptics'
import { useBack } from '../../lib/nav'
import { toast } from '../../lib/toast'
import { DeleteRow, SheetForm } from './shared'

const HOUR = 3_600_000

/** Last night at the same clock times as the previous log (a habit), or 23:00 → 07:00; never in the future. */
async function defaultTimes(now = Date.now()) {
  const prev = (await db.sleep.orderBy('wakeAt').reverse().toArray()).find((s) => !s.deletedAt)
  const clock = (ms: number) => ms - startOfDay(ms)
  const today = startOfDay(now)
  const wake = Math.min(today + (prev ? clock(prev.wakeAt) : 7 * HOUR), now)
  const length = prev ? Math.min(Math.max(prev.wakeAt - prev.bedAt, 4 * HOUR), 12 * HOUR) : 8 * HOUR
  return { bedAt: wake - length, wakeAt: wake }
}

export function SleepLogPage() {
  const [params] = useSearchParams()
  const id = params.get('id') ?? undefined
  const back = useBack('/', 'sheet-down')
  const [draft, setDraft] = useState<{ bedAt: number; wakeAt: number; quality?: number; notes?: string }>()

  useEffect(() => {
    if (id) db.sleep.get(id).then((s) => s && setDraft(s))
    else defaultTimes().then(setDraft)
  }, [id])

  if (!draft) return null
  const hours = sleepHours(draft)
  const valid = draft.wakeAt > draft.bedAt && hours <= 16 && draft.wakeAt <= Date.now() + 60_000

  async function submit() {
    haptic()
    await save(db.sleep, { id, bedAt: draft!.bedAt, wakeAt: draft!.wakeAt, quality: draft!.quality, notes: draft!.notes?.trim() || undefined, source: 'user' })
    toast(`Sleep ${formatHours(hours)} ${id ? 'updated' : 'saved'}`)
    back()
  }

  async function remove() {
    await softDelete(db.sleep, id!)
    toast('Sleep deleted', { label: 'Undo', onClick: () => restore(db.sleep, id!) })
    back()
  }

  return (
    <SheetForm title={id ? 'Edit Sleep' : 'Sleep'} canSave={valid} onSubmit={submit} onClose={back}>
      <div className="card px-5 py-4 text-center">
        <p className="font-rounded text-[2.5rem] leading-tight font-semibold" data-testid="sleep-duration">{valid ? formatHours(hours) : '—'}</p>
        <p className="text-[0.875rem] text-muted">{valid ? 'asleep' : hours > 16 ? 'That’s over 16 hours — check the times' : 'Waking has to come after going to bed'}</p>
      </div>

      <Group>
        <DateRow label="Went to Bed" type="datetime-local" value={toLocalInput(draft.bedAt)} max={toLocalInput(Date.now())} display={formatWhen(draft.bedAt)} onChange={(v) => setDraft({ ...draft, bedAt: fromLocalInput(v) })} />
        <DateRow label="Woke Up" type="datetime-local" value={toLocalInput(draft.wakeAt)} max={toLocalInput(Date.now())} display={formatWhen(draft.wakeAt)} onChange={(v) => setDraft({ ...draft, wakeAt: fromLocalInput(v) })} />
      </Group>

      <div>
        <span className="section-label block">How Did You Sleep?</span>
        <Chips wrap options={SLEEP_QUALITY.map((q) => ({ value: String(q.value), label: q.label }))} value={draft.quality ? String(draft.quality) : undefined} onChange={(v) => setDraft({ ...draft, quality: Number(v) })} />
        <p className="section-footer">Optional.</p>
      </div>

      <Field label="Notes">
        <textarea className="input min-h-20" value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Optional — e.g. woke at 3 am, elbow ached" />
      </Field>

      {id && <DeleteRow label="Delete Sleep" onDelete={remove} />}
    </SheetForm>
  )
}
