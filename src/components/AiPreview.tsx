import { useState } from 'react'
import { createPortal } from 'react-dom'
import { EyeOff, Send } from 'lucide-react'
import type { AiTask } from '../../shared/ai'
import { answerPreview, type Preview } from '../lib/aiPreview'
import { formatBytes } from '../lib/platform'
import { IconTile } from './ui'

const TASK: Record<AiTask, string> = {
  'structure-note': 'Turning a note into entries',
  'summarize-document': 'Reading a record',
  'estimate-meal': 'Estimating a meal',
  'weekly-summary': 'Your weekly summary',
  ask: 'Your question',
  'report-narrative': 'The doctor report summary',
  'health-summary': 'Your health overview',
  'recovery-plan': 'Your recovery plan',
  'meal-ideas': 'Meal ideas',
}

/** "openInjuries" → "Open injuries" */
const words = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])(?=[a-z])/g, (_, c: string) => ` ${c.toLowerCase()}`)
const isEmpty = (v: unknown) => v === undefined || v === null || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length)

/** base64 → bytes, for showing a file's size instead of its contents */
const decodedSize = (b64: string) => Math.floor((b64.length * 3) / 4)

/** What goes in the request: text as it will be sent, files by name and size. */
function Contents({ preview }: { preview: Preview }) {
  const pre = (value: unknown) => <pre className="max-h-64 overflow-auto rounded-xl bg-fill p-3 text-[0.75rem] leading-snug whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
  if ('batch' in preview) {
    return (
      <ul className="space-y-1 text-[0.9375rem]">
        {preview.batch.map((f) => <li key={f.fileName + f.title}>{f.title} — the file {f.fileName} ({formatBytes(f.size)})</li>)}
      </ul>
    )
  }
  const input = preview.input as Record<string, unknown>
  if (preview.task === 'summarize-document') {
    return <p className="text-[0.9375rem]">The file “{String(input.title)}” ({String(input.kind)}, {formatBytes(decodedSize(String(input.data)))}), with its title and type.</p>
  }
  if (preview.task === 'estimate-meal') {
    const image = input.image as { data: string } | undefined
    return (
      <div className="space-y-2 text-[0.9375rem]">
        {image && <p>One photo ({formatBytes(decodedSize(image.data))}, resized).</p>}
        {!!input.description && <p>Your description: “{String(input.description)}”</p>}
      </div>
    )
  }
  const { context, ...rest } = input
  return (
    <div className="space-y-2">
      {Object.keys(rest).length > 0 && pre(rest)}
      {context !== undefined && (
        <>
          <p className="text-[0.875rem] text-muted">From your log and records ({formatBytes(JSON.stringify(context).length)} of text):</p>
          {Object.entries(context as Record<string, unknown>)
            .filter(([, v]) => !isEmpty(v))
            .map(([k, v]) => (
              <details key={k} className="rounded-xl bg-fill px-3 py-2">
                <summary className="cursor-pointer text-[0.875rem] font-medium">{words(k)}{Array.isArray(v) ? ` (${v.length})` : ''}</summary>
                <pre className="mt-1 max-h-56 overflow-auto text-[0.75rem] leading-snug whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre>
              </details>
            ))}
        </>
      )}
    </div>
  )
}

/** Shown before an AI request when "Show what's sent" is on (loaded on demand by AiPreviewHost). */
export function AiPreviewSheet({ preview }: { preview: Preview }) {
  const [stopAsking, setStopAsking] = useState(false)
  const title = 'batch' in preview ? `Reading ${preview.batch.length} ${preview.batch.length === 1 ? 'record' : 'records'}` : TASK[preview.task]
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="What will be sent">
      <div className="animate-fade absolute inset-0 bg-black/30" onClick={() => answerPreview(false)} />
      <div className="animate-sheet absolute inset-x-2 mx-auto flex max-h-[85dvh] max-w-xl flex-col rounded-[2.25rem] bg-bg p-5 shadow-2xl" style={{ bottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}>
        <h2 className="text-[1.375rem] font-bold">What will be sent</h2>
        <p className="text-[0.9375rem] text-muted">{title} — to Reclaim’s server, then Google’s Gemini (or Groq if Gemini is busy).</p>
        <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto">
          <Contents preview={preview} />
          <div className="card flex items-start gap-3 p-3">
            <IconTile icon={EyeOff} color="green" />
            <p className="min-w-0 flex-1 text-[0.875rem] text-muted">
              <span className="block font-medium text-ink">Never sent to the AI</span>
              Your name and photo from your profile, your email (the server only checks it to know it’s you), your Drive passphrase and backups, and any record files other than the ones listed here.
            </p>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[0.875rem] text-muted">
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={stopAsking} onChange={(e) => setStopAsking(e.target.checked)} /> Don’t show this again
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button type="button" className="btn btn-quiet" onClick={() => answerPreview(false, stopAsking)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => answerPreview(true, stopAsking)}><Send size={17} /> Send</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
