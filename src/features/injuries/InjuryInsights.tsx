import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, ChevronDown } from 'lucide-react'
import { db, type Injury } from '../../db/db'
import { MLink } from '../../components/MLink'
import { Group, IconTile, Section } from '../../components/ui'
import { conditionFor, WARNINGS } from '../../lib/conditions'
import { daysAgo } from '../../lib/dates'
import { GUIDELINES } from '../../lib/guide'
import { painPatterns } from '../../lib/patterns'

/** "What is …?": a short explanation of the condition, with sources, when one fits the injury. */
export function ConditionCard({ injury }: { injury: Injury }) {
  const condition = conditionFor(injury)
  if (!condition) return null
  return (
    <Section>
      <details className="card group p-4" data-testid="condition-card">
        <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
          <IconTile icon={BookOpen} color="blue" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">What is {condition.title[0].toLowerCase() + condition.title.slice(1)}?</span>
            <span className="block text-[0.875rem] text-muted">A one-minute read</span>
          </span>
          <ChevronDown size={18} className="shrink-0 text-faint transition-transform group-open:rotate-180" />
        </summary>
        <p className="mt-3 text-[0.9375rem]">{condition.what}</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[0.9375rem]">{condition.points.map((p) => <li key={p}>{p}</li>)}</ul>
        {condition.warnings && <p className="mt-2 text-[0.9375rem]">{WARNINGS} <MLink to="/safety" className="text-accent">Check the warning signs</MLink>.</p>}
        <p className="mt-3 text-[0.75rem] text-faint">General information, not a diagnosis. Sources: {condition.refs.map((r) => GUIDELINES[r].short).join(' · ')}</p>
      </details>
    </Section>
  )
}

/** How this injury's pain differs by steps, sleep and rehab the day before, from the user's own days. */
export function Patterns({ injuryId: id }: { injuryId: string }) {
  // Patterns: this injury's pain against steps, sleep and rehab over the last 60 days
  const patterns = useLiveQuery(async () => {
    const from = daysAgo(59)
    const [pain, steps, sleep, sessions] = await Promise.all([
      db.symptoms.where('recordedAt').aboveOrEqual(from).toArray(),
      db.activity.toArray(),
      db.sleep.where('wakeAt').aboveOrEqual(from).toArray(),
      db.sessions.where('recordedAt').aboveOrEqual(from - 86_400_000).toArray(),
    ])
    const own = pain.filter((s) => !s.deletedAt && s.injuryId === id && s.type === 'pain')
    return own.length ? painPatterns({ pain: own, steps: steps.filter((a) => !a.deletedAt), sleep: sleep.filter((s) => !s.deletedAt), sessions: sessions.filter((s) => !s.deletedAt) }) : null
  }, [id])

  if (!patterns) return null
  return (
    <Section title="Patterns" footer="From your own days over the last 60 days — patterns, not proof: other things change too. Worth trying, and worth telling your physio.">
      {patterns.found.length ? (
        <Group>
          {patterns.found.map((p) => <p key={p.id} className="cell text-[0.9375rem]" data-testid={`pattern-${p.id}`}>{p.text}</p>)}
        </Group>
      ) : (
        <p className="card p-4 text-[0.9375rem] text-muted" data-testid="patterns-none">
          {patterns.checked.length
            ? `No clear link yet between this pain and ${patterns.checked.map((c) => ({ steps: 'steps', sleep: 'sleep', rehab: 'rehab sessions' })[c]).join(', ').replace(/, ([^,]*)$/, ' or $1')}.`
            : 'Patterns show up after a couple of weeks of pain logs alongside steps, sleep or rehab.'}
        </p>
      )}
    </Section>
  )
}
