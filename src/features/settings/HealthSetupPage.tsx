import { useEffect } from 'react'
import { Copy } from 'lucide-react'
import { useMeta } from '../../db/hooks'
import { getMeta, newId, setMeta } from '../../db/repo'
import { NavBar, Section } from '../../components/ui'
import { toast } from '../../lib/toast'
import { HEALTH_KEY } from './HealthImportPage'

const STEPS: { title: string; body: string }[] = [
  { title: 'Create the Shortcut', body: 'Open the Shortcuts app → + → name it “Reclaim Health”.' },
  { title: 'Steps', body: 'Add “Find Health Samples”: Type Steps, Start Date is in the last 7 days, Group By Day. Add “Repeat with Each”, and inside it a “Text” action: steps,[Repeat Item → Start Date, custom format yyyy-MM-dd],[Repeat Item → Value]. After End Repeat, add “Combine Text” (Repeat Results, New Lines).' },
  { title: 'Weight (optional)', body: 'The same with Type Weight, last 30 days, and the text: weight,[Start Date, format yyyy-MM-dd HH:mm],[Value]. If Health shows your weight in pounds, add ,lb at the end.' },
  { title: 'Sleep (optional)', body: 'The same with Type Sleep, last 7 days, no grouping, and the text: sleep,[Start Date, yyyy-MM-dd HH:mm],[End Date, yyyy-MM-dd HH:mm],[Value]. Time in bed and awake time are ignored.' },
  { title: 'Put it together', body: 'Add a “Text” action with the combined texts, one per line. Then “URL Encode” it, and “Open URLs” with your link below followed by the encoded text.' },
  { title: 'Run it every day', body: 'Shortcuts → Automation → + → Time of Day (e.g. 9:00, Daily) → Run Immediately → Run Shortcut → Reclaim Health. Reclaim opens and imports on its own.' },
]

/** How to bring steps, weight and sleep from Apple Health, through a Shortcut and a personal import link. */
export function HealthSetupPage() {
  const key = useMeta<string>(HEALTH_KEY)
  // The personal key lets the daily Shortcut import without asking; other links always ask first.
  useEffect(() => {
    if (key === undefined) void getMeta(HEALTH_KEY).then((k) => k || setMeta(HEALTH_KEY, newId().replaceAll('-', '').slice(0, 20)))
  }, [key])

  const link = key ? `${window.location.origin}/import/health#k=${key}&d=` : ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      toast('Link copied')
    } catch {
      toast('Couldn’t copy — select the link and copy it')
    }
  }

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Apple Health" subtitle="Steps, weight and sleep, every day" back="/settings" />
      <Section footer="Web apps can’t read Apple Health directly — only apps from the App Store can. An iPhone Shortcut can, and hands the numbers to Reclaim. It takes about 10 minutes to set up, once.">
        <div className="card p-4">
          <p className="font-semibold">Your import link</p>
          <p className="mt-1 break-all text-[0.875rem] text-muted" data-testid="health-link">{link || 'Preparing…'}</p>
          <button type="button" className="btn btn-soft mt-3 w-full" onClick={copy} disabled={!link}><Copy size={18} /> Copy Link</button>
          <p className="mt-2 text-[0.8125rem] text-faint">Keep it private: it lets your Shortcut import without asking. Any other link always shows what it brings first.</p>
        </div>
      </Section>
      <Section title="Set Up the Shortcut">
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
