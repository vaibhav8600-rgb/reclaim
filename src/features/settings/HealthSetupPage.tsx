import { useState } from 'react'
import { ClipboardPaste, Play } from 'lucide-react'
import { db } from '../../db/db'
import { restore, save } from '../../db/repo'
import { NavBar, Section } from '../../components/ui'
import { activityId } from '../../lib/daily'
import { isEmptyImport, parseHealthExport, RUN_SHORTCUT, type HealthImport } from '../../lib/healthImport'
import { toast } from '../../lib/toast'

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
  { title: 'Make a new Shortcut', body: 'Open the Shortcuts app → + → tap the name at the top → Rename → Reclaim Health (exactly, so Reclaim can start it).' },
  { title: 'Find today’s steps', body: 'Add Action → search “Find Health Samples”. Set Type to Steps, Start Date to “is today”, and Group By to Day.' },
  { title: 'Copy them', body: 'Add Action → search “Copy to Clipboard”. Tap ▶ once and allow access to Steps. Done — just two actions.' },
]

/** Steps from Apple Health: a two-action iPhone Shortcut copies them, Reclaim pastes them. */
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
      <NavBar title="Apple Health" subtitle="Your steps, from your iPhone" back="/settings" />
      <Section title="Set Up the Shortcut (once)" footer="Web apps can’t read Apple Health directly — only App Store apps can. The Shortcut reads today’s steps and copies them for Reclaim.">
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
      <Section title="Try It" footer="Each day it’s quicker from Today: tap Steps → Get from Health → come back → Paste → Save. Importing the same day twice changes nothing.">
        <div className="card space-y-3 p-4">
          <a className="btn btn-soft w-full" href={RUN_SHORTCUT}><Play size={18} /> 1. Run the Shortcut</a>
          <button type="button" className="btn btn-primary w-full" onClick={paste} disabled={busy}><ClipboardPaste size={18} /> 2. Paste from Apple Health</button>
          <textarea className="input min-h-20 text-[0.875rem]" aria-label="Apple Health data" value={text} onChange={(e) => setText(e.target.value)} placeholder="Or paste here by hand" />
          {text.trim() && <button type="button" className="btn btn-soft w-full" onClick={() => importText(text)} disabled={busy}>Import</button>}
        </div>
      </Section>
    </div>
  )
}
