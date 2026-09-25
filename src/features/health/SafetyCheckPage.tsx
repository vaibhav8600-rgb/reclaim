import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { db } from '../../db/db'
import { isOpenInjury, useInjuries } from '../../db/hooks'
import { save, setMeta } from '../../db/repo'
import { IconTile, NavBar, Section } from '../../components/ui'
import { daysAgo } from '../../lib/dates'
import { GUIDELINES } from '../../lib/guide'
import { useGo } from '../../lib/nav'
import { NERVE_SYMPTOMS, SAFETY_CHECK_AT } from '../../lib/safety'
import { signGroups, urgencyOf, type Urgency, type WarningSign } from '../../lib/warningSigns'
import { toast } from '../../lib/toast'

const ADVICE: Record<Urgency, { title: string; body: string; color: string }> = {
  now: {
    title: 'Get medical help now',
    body: 'Go to an emergency department, or call your local emergency number (112 in India and Europe, 911 in the US). Don’t wait for it to settle, and don’t do your exercises until you’ve been checked.',
    color: 'red',
  },
  soon: {
    title: 'See a doctor today or tomorrow',
    body: 'Contact your doctor or physio and tell them what you ticked. Until then, pause any exercise that makes it worse.',
    color: 'orange',
  },
}

/** The warning-sign check: a few yes/no questions picked by the open injuries. */
export function SafetyCheckPage() {
  const go = useGo()
  const injuries = useInjuries()
  const recentNerve = useLiveQuery(async () => (await db.symptoms.where('recordedAt').above(daysAgo(3)).toArray()).some((s) => !s.deletedAt && NERVE_SYMPTOMS.includes(s.type)), [])
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<{ urgency: Urgency; signs: WarningSign[] }>()

  if (!injuries || recentNerve === undefined) return null
  const groups = signGroups(injuries.filter(isOpenInjury).map((i) => i.bodyRegion), recentNerve)
  const signs = groups.flatMap((g) => g.signs).filter((s, i, all) => all.findIndex((x) => x.id === s.id) === i && ticked.has(s.id))

  async function finish() {
    const now = Date.now()
    await setMeta(SAFETY_CHECK_AT, now)
    const urgency = urgencyOf(signs)
    if (!urgency) {
      toast('No warning signs — safety check done')
      return go('/', 'pop', { replace: true })
    }
    // On the timeline, so it syncs and can be shown to a doctor.
    await save(db.journal, { text: `Warning signs (${urgency === 'now' ? 'get help now' : 'see a doctor soon'}): ${signs.map((s) => s.text).join('; ')}.`, recordedAt: now, source: 'user' })
    setResult({ urgency, signs })
  }

  if (result) {
    const a = ADVICE[result.urgency]
    return (
      <div className="space-y-7 pb-4">
        <NavBar title="Warning Signs" back="/" />
        <Section footer="Saved to your timeline, so you can show your doctor.">
          <div className="card p-4" role="alert">
            <p className="flex items-start gap-3">
              <IconTile icon={ShieldAlert} color={a.color} />
              <span className="min-w-0 flex-1">
                <span className="block text-[1.125rem] font-semibold">{a.title}</span>
                <span className="block text-[0.9375rem] text-muted">{a.body}</span>
              </span>
            </p>
            <ul className="mt-3 list-disc space-y-1 border-t border-line pt-3 pl-5 text-[0.9375rem]">{result.signs.map((s) => <li key={s.id}>{s.text}</li>)}</ul>
          </div>
        </Section>
        <Section>
          <button type="button" className="btn btn-primary w-full" onClick={() => go('/', 'pop', { replace: true })}>Done</button>
        </Section>
      </div>
    )
  }

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Warning Signs" subtitle="About 30 seconds" back="/" />
      <Section footer="Tick any you have now. Most people tick none: this is the short list clinicians use to spot problems that need a check-up soon. It isn’t a diagnosis.">
        <div className="card flex items-start gap-3 p-4">
          <IconTile icon={ShieldCheck} color="green" />
          <p className="min-w-0 flex-1 text-[0.9375rem]">A few quick questions about signs that need a doctor, picked for your injuries.</p>
        </div>
      </Section>
      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          <div className="card rows overflow-hidden">
            {g.signs.map((s) => (
              <label key={s.id} className="cell cell-press !items-start">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-danger)]"
                  checked={ticked.has(s.id)}
                  onChange={(e) => setTicked((t) => { const n = new Set(t); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n })}
                />
                <span className="min-w-0 flex-1 text-[0.9375rem]">{s.text}</span>
              </label>
            ))}
          </div>
        </Section>
      ))}
      <Section footer={`From the red flags in the ${GUIDELINES.lowBack.short} and ${GUIDELINES.neck.short}.`}>
        <button type="button" className={`btn w-full ${signs.length ? 'btn-danger' : 'btn-primary'}`} onClick={finish}>
          {signs.length ? 'Show What to Do' : 'I Have None of These'}
        </button>
      </Section>
    </div>
  )
}
