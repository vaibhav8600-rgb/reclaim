import { useState } from 'react'
import { ClipboardPaste, Play } from 'lucide-react'
import { db } from '../../db/db'
import { restore, save } from '../../db/repo'
import { NavBar, Section } from '../../components/ui'
import { activityId } from '../../lib/daily'
import { isEmptyImport, parseHealthExport, type HealthImport } from '../../lib/healthImport'
import { toast } from '../../lib/toast'

const SHORTCUT = 'Reclaim Health'

/** Save what the Shortcut copied. Deterministic ids: importing the same data twice changes nothing. */
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const describe = (h: HealthImport) =>
  [
    h.steps.size && plural(h.steps.size, 'day of steps', 'days of steps'),
    h.exercise.size && plural(h.exercise.size, 'day of exercise', 'days of exercise'),
    h.weights.length && plural(h.weights.length, 'weight', 'weights'),
    h.nights.length && plural(h.nights.length, 'night of sleep', 'nights of sleep'),
  ].filter(Boolean).join(' · ')

const STEPS: { title: string; body: string }[] = [
  { title: 'Create the Shortcut', body: `Open the Shortcuts app → + → name it “${SHORTCUT}” (exactly, so Reclaim can start it).` },
  { title: 'Steps', body: 'Add “Find Health Samples”: Type Steps, Start Date is in the last 7 days, Group By Day. Add “Repeat with Each”, and inside it a “Text” action: steps;[Repeat Item → Start Date, Custom format yyyy-MM-dd];[Repeat Item → Value]. After End Repeat, add “Combine Text”: Repeat Results, New Lines.' },
  { title: 'Weight (optional)', body: 'The same with Type Weight, last 30 days, no grouping, and the text: weight;[Start Date, format yyyy-MM-dd HH:mm];[Value];[Unit].' },
  { title: 'Sleep (optional)', body: 'The same with Type Sleep, last 7 days, no grouping, and the text: sleep;[Start Date, yyyy-MM-dd HH:mm];[End Date, yyyy-MM-dd HH:mm];[Value]. Time in bed and awake time are ignored.' },
  { title: 'Copy it', body: 'Add a “Text” action with each Combined Text on its own line, then “Copy to Clipboard”. Run it once and allow access to Health.' },
]

/** Steps, weight and sleep from Apple Health: an iPhone Shortcut copies them, Reclaim pastes them. */
export function HealthSetupPage() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function importText(raw: string) {
    const data = parseHealthExport(raw)
    if (isEmptyImport(data)) {
      toast('No Apple Health data there — run the Shortcut first')
      return
    }
    setBusy(true)
    try {
      await apply(data)
      setText('')
      toast(`Imported from Apple Health: ${describe(data)}${data.skipped ? ` (${plural(data.skipped, 'line', 'lines')} skipped)` : ''}`)
    } finally {
      setBusy(false)
    }
  }

  async function paste() {
    try {
      await importText(await navigator.clipboard.readText())
    } catch {
      toast('Couldn’t read the clipboard — paste into the box below')
    }
  }

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Apple Health" subtitle="Steps, weight and sleep" back="/settings" />
      <Section footer="Same data twice changes nothing; entries you deleted stay deleted; nights you logged by hand aren’t doubled.">
        <div className="card space-y-3 p-4">
          <a className="btn btn-soft w-full" href={`shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT)}`}><Play size={18} /> 1. Run the Shortcut</a>
          <button type="button" className="btn btn-primary w-full" onClick={paste} disabled={busy}><ClipboardPaste size={18} /> 2. Paste from Apple Health</button>
          <textarea className="input min-h-20 text-[0.875rem]" aria-label="Apple Health data" value={text} onChange={(e) => setText(e.target.value)} placeholder="Or paste here by hand" />
          {text.trim() && <button type="button" className="btn btn-soft w-full" onClick={() => importText(text)} disabled={busy}>Import</button>}
        </div>
      </Section>
      <Section title="Set Up the Shortcut (once)" footer="Web apps can’t read Apple Health directly — only App Store apps can. A Shortcut can, and copies the numbers for Reclaim. After running it, switch back to Reclaim and tap Paste.">
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card flex gap-3 p-4">
              <span className="font-rounded flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[0.9375rem] font-semibold text-accent">{i + 1}</span>
              <span className="min-w-0">
                <span className="block font-semibold">{s.title}</span>
                <span className="block text-[0.9375rem] text-muted">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  )
}
