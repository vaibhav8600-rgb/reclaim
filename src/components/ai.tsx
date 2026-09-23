import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Eye, Lock, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { Insight } from '../../shared/ai'
import { useMeta } from '../db/hooks'
import { AiSignInRequired, setAiConsent, type AiConsent } from '../lib/ai'
import { cachedToken, GOOGLE_CLIENT_ID, prepareGoogle, requestToken } from '../lib/google'
import { IconTile } from './ui'

type State = { name: 'idle' } | { name: 'consent' } | { name: 'running' } | { name: 'signin' } | { name: 'error'; message: string }

/**
 * A button that runs an AI action, taking care of consent (first use) and Google sign-in
 * (the popup must open straight from a tap, so sign-in happens inside these click handlers).
 */
export function AiAction({ label, runningLabel = 'Thinking…', run, className = 'btn btn-soft w-full', disabled }: {
  label: string
  runningLabel?: string
  run: () => Promise<void>
  className?: string
  disabled?: boolean
}) {
  const consent = useMeta<AiConsent>('aiConsent')
  const [state, setState] = useState<State>({ name: 'idle' })
  const [elapsed, setElapsed] = useState(0)

  // While waiting, count seconds so a long queue at Gemini doesn't look like a hang.
  useEffect(() => {
    if (state.name !== 'running') return setElapsed(0)
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [state.name])

  useEffect(() => {
    if (GOOGLE_CLIENT_ID) prepareGoogle().catch(() => {})
  }, [])

  async function execute() {
    setState({ name: 'running' })
    try {
      await run()
      setState({ name: 'idle' })
    } catch (e) {
      setState(e instanceof AiSignInRequired ? { name: 'signin' } : { name: 'error', message: (e as Error).message })
    }
  }

  /** Called inside a tap: opens Google's popup if needed, then runs. */
  function signInThenRun() {
    if (cachedToken()) return void execute()
    requestToken().then(execute, (e: Error) => setState({ name: 'error', message: e.message }))
  }

  function tapped() {
    if (!GOOGLE_CLIENT_ID) return setState({ name: 'error', message: 'AI needs Google sign-in to be set up first (Settings → Google Drive).' })
    if (!consent) return setState({ name: 'consent' })
    signInThenRun()
  }

  const running = state.name === 'running'
  return (
    <div>
      <button type="button" className={className} onClick={tapped} disabled={disabled || running} aria-busy={running}>
        <Sparkles size={18} className={running ? 'animate-pulse' : ''} /> {running ? runningLabel : label}
        {running && elapsed >= 3 && <span className="font-normal tabular-nums opacity-70">{elapsed}s</span>}
      </button>
      {running && elapsed >= 8 && (
        <p className="section-footer" aria-live="polite">Waiting for Gemini — free-tier requests can queue for up to half a minute before the answer starts.</p>
      )}
      {state.name === 'signin' && (
        <button type="button" className="btn btn-quiet mt-2 w-full" onClick={signInThenRun}>
          Sign in with Google to continue
        </button>
      )}
      {state.name === 'error' && <p className="section-footer !text-danger" role="alert">{state.message}</p>}
      {state.name === 'consent' && (
        <AiConsentSheet
          onClose={() => setState({ name: 'idle' })}
          onAccept={() => {
            void setAiConsent(true)
            signInThenRun()
          }}
        />
      )}
    </div>
  )
}

/** Rendered into <body> so it never sits inside (and submits) a surrounding form. */
export function AiConsentSheet({ onAccept, onClose }: { onAccept: () => void; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Use AI in Reclaim?">
      <div className="animate-fade absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="animate-sheet absolute inset-x-2 mx-auto max-w-xl rounded-[2.25rem] bg-bg p-5 shadow-2xl" style={{ bottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-start justify-between">
          <h2 className="text-[1.375rem] font-bold">Use AI in Reclaim?</h2>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-fill text-muted" aria-label="Close">
            <X size={18} strokeWidth={2.6} />
          </button>
        </div>
        <div className="card rows mt-4 overflow-hidden" style={{ ['--inset' as string]: '3.625rem' }}>
          <Point icon={Eye} color="blue" title="Only what's needed" body="Each feature sends just its part of your log — the note, document or meal photo, or a summary of recent entries. Never your name." />
          <Point icon={Lock} color="green" title="Through your own server" body="Sent through Reclaim's server to Google's Gemini (text requests go to Groq instead if Gemini is busy and a Groq key is set up). With a paid Gemini API key, Google doesn't use it to improve its products." />
          <Point icon={ShieldCheck} color="indigo" title="Drafts, not diagnoses" body="AI suggests; you review before anything is saved. It never diagnoses or changes your treatment." />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" className="btn btn-quiet" onClick={onClose}>Not Now</button>
          <button type="button" className="btn btn-primary" onClick={onAccept}>Turn On AI</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Point({ icon, color, title, body }: { icon: typeof Eye; color: string; title: string; body: string }) {
  return (
    <div className="cell !items-start">
      <IconTile icon={icon} color={color} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-[0.875rem] text-muted">{body}</span>
      </span>
    </div>
  )
}

/** The four-part answer every analysis uses. Accepts a half-written answer while it streams. */
export function InsightCard({ insight, lead, footer, streaming }: { insight: Partial<Insight>; lead: ReactNode; footer?: ReactNode; streaming?: boolean }) {
  const parts: [string, string[]][] = [
    ['What the data shows', insight.dataShows ?? []],
    ['Possible patterns', insight.patterns ?? []],
    ['What the data can’t establish', insight.cannotEstablish ?? []],
    ['To discuss with your clinician', insight.discuss ?? []],
  ]
  return (
    <div className="card animate-pop p-4">
      <div className="mb-3 flex items-start gap-2">
        <Sparkles size={18} className="mt-0.5 shrink-0 text-accent" />
        <p className="font-semibold" aria-live={streaming ? 'polite' : undefined}>{lead}</p>
      </div>
      <div className="space-y-3">
        {parts
          .filter(([, items]) => items.length)
          .map(([title, items]) => (
            <section key={title}>
              <h3 className="text-[0.8125rem] font-semibold text-muted uppercase">{title}</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[0.9375rem]">
                {items.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </section>
          ))}
      </div>
      {streaming ? (
        <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-2 text-[0.75rem] text-faint">
          <Sparkles size={12} className="animate-pulse" /> Writing…
        </p>
      ) : (
        footer && <p className="mt-3 border-t border-line pt-2 text-[0.75rem] text-faint">{footer}</p>
      )}
    </div>
  )
}

export const AI_DISCLAIMER = 'AI-generated from your log. Not medical advice — check anything important with your clinician.'
