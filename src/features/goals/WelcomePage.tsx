import { useState } from 'react'
import { db, type Profile } from '../../db/db'
import { useLatestWeight, useProfile } from '../../db/hooks'
import { save, setMeta } from '../../db/repo'
import { Field, Group, Segmented } from '../../components/ui'
import { MLink } from '../../components/MLink'
import { weightKg } from '../../lib/constants'
import { suggestedGoals } from '../../lib/plan'
import { GOOGLE_CLIENT_ID } from '../../lib/google'
import { useBack, useGo } from '../../lib/nav'
import { toast } from '../../lib/toast'
import { SheetForm } from '../log/shared'

const AIMS = [
  { value: 'recovery', label: 'Recover from an injury' },
  { value: 'protein', label: 'Eat enough protein' },
  { value: 'water', label: 'Drink enough water' },
  { value: 'steps', label: 'Move more' },
  { value: 'sleep', label: 'Sleep better' },
  { value: 'weight', label: 'Reach a healthy weight' },
] as const
type Aim = (typeof AIMS)[number]['value']

/** First-run setup: a minute, all optional. Fills in starting goals for what you picked; everything is editable later in Goals. */
export function WelcomePage() {
  const back = useBack('/', 'sheet-down')
  const go = useGo()
  const profile = useProfile()
  const latest = useLatestWeight()
  const [name, setName] = useState<string>()
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg')
  const [goalWeight, setGoalWeight] = useState('')
  const [aims, setAims] = useState<Set<Aim>>(new Set())
  if (profile === undefined || latest === undefined) return null

  const num = (s: string) => {
    const n = parseFloat(s.replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  const toggle = (a: Aim) => setAims((s) => { const n = new Set(s); if (n.has(a)) n.delete(a); else n.add(a); return n })

  async function submit() {
    const w = num(weight)
    if (w) await save(db.measurements, { kind: 'weight', value: Math.round(w * 10) / 10, unit, recordedAt: Date.now(), source: 'user' })
    const kg = weightKg(w ? { value: w, unit } : (latest ?? undefined))
    const s = suggestedGoals(kg, await db.facts.toArray())
    const goals: Partial<Profile> = {}
    // Only goals for what was picked, and never over one already set.
    if (aims.has('protein') && !profile?.proteinTarget) goals.proteinTarget = s.proteinTarget
    if (aims.has('water') && !profile?.waterTarget) goals.waterTarget = s.waterTarget
    if (aims.has('steps') && !profile?.stepsTarget) goals.stepsTarget = s.stepsTarget
    if (aims.has('sleep') && !profile?.sleepTarget) goals.sleepTarget = s.sleepTarget
    if (aims.has('weight') && num(goalWeight)) goals.weightGoal = weightKg({ value: num(goalWeight)!, unit }) // goals are kept in kg
    const h = num(height)
    await save(db.profile, { id: 'me', name: (name ?? profile?.name ?? '').trim(), ...(h && { height: Math.round(h) }), ...goals })
    await setMeta('setupDone', true)
    toast('You’re all set — change anything in Goals')
    go(aims.has('recovery') ? '/injuries/new' : '/', 'sheet-down', { replace: true })
  }

  async function skip() {
    await setMeta('setupDone', true)
    back()
  }

  return (
    <SheetForm title="Welcome" canSave onSubmit={submit} onClose={skip}>
      <div className="px-1">
        <h2 className="text-[1.5rem] leading-tight font-bold">Let’s set up Reclaim</h2>
        <p className="mt-1 text-muted">About a minute. Everything is optional and stays on this iPhone. Tap ✓ when you’re done.</p>
      </div>

      <Field label="Your Name">
        <input className="input" value={name ?? profile?.name ?? ''} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" autoComplete="given-name" />
      </Field>

      <div>
        <span className="section-label block">About You</span>
        <Group>
          <label className="cell">
            <span className="flex-1">Height</span>
            <input className="w-20 bg-transparent text-right outline-none placeholder:text-faint" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="170" aria-label="Height (cm)" />
            <span className="w-6 text-muted">cm</span>
          </label>
          <label className="cell">
            <span className="flex-1">Weight Today</span>
            <input className="w-20 bg-transparent text-right outline-none placeholder:text-faint" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={latest ? String(latest.value) : '70'} aria-label="Weight today" />
            <span className="w-6 text-muted">{unit}</span>
          </label>
        </Group>
        <div className="mt-3"><Segmented options={[{ value: 'kg' as const, label: 'kg' }, { value: 'lb' as const, label: 'lb' }]} value={unit} onChange={setUnit} /></div>
        <p className="section-footer">Used for BMI and to suggest protein and water goals.</p>
      </div>

      <div>
        <span className="section-label block">What Would You Like Help With?</span>
        <div className="flex flex-wrap gap-2">
          {AIMS.map((a) => (
            <button key={a.value} type="button" className="chip" aria-pressed={aims.has(a.value)} onClick={() => toggle(a.value)}>{a.label}</button>
          ))}
        </div>
        <p className="section-footer">Pick any. Reclaim sets starting goals for them, which you can change in Goals.</p>
      </div>

      {aims.has('weight') && (
        <Group>
          <label className="cell">
            <span className="flex-1">Goal Weight</span>
            <input className="w-20 bg-transparent text-right outline-none placeholder:text-faint" inputMode="decimal" value={goalWeight} onChange={(e) => setGoalWeight(e.target.value)} placeholder="Optional" aria-label="Goal weight" />
            <span className="w-6 text-muted">{unit}</span>
          </label>
        </Group>
      )}

      {GOOGLE_CLIENT_ID && (
        <p className="px-1 text-[0.9375rem] text-muted">
          Used Reclaim before? <MLink to="/settings/drive" className="font-medium text-accent">Restore from Google Drive</MLink>
        </p>
      )}
    </SheetForm>
  )
}
