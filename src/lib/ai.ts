import { outputs, type AiHealth, type AiInput, type AiOutput, type AiTask } from '../../shared/ai'
import { AiCancelled, confirmAiSend } from './aiPreview'
import { parsePartialJson } from '../../shared/partial-json'
import { getMeta, setMeta } from '../db/repo'
import { cachedToken } from './google'

/**
 * Calls the app's /api/ai function. The Gemini key lives on the server; the browser proves who it is
 * with the Google sign-in token. Answers are validated against the shared contract before use.
 */

/** Sign-in (Google) is needed first; the UI shows a button that opens Google's popup. */
export class AiSignInRequired extends Error {
  constructor() {
    super('Sign in with Google to use AI.')
  }
}

export interface AiConsent {
  at: number
}
export const getAiConsent = () => getMeta<AiConsent>('aiConsent')
export const setAiConsent = (on: boolean) => setMeta('aiConsent', on ? ({ at: Date.now() } satisfies AiConsent) : undefined)

export async function aiHealth(): Promise<AiHealth> {
  try {
    const r = await fetch('/api/ai', { headers: { accept: 'application/json' } })
    return r.ok ? ((await r.json()) as AiHealth) : { configured: false }
  } catch {
    return { configured: false }
  }
}

/**
 * Run an AI task. With `onPartial`, the answer streams: it's called with the half-written answer as it grows
 * (fields may be missing or cut short), so the UI can show text within a second or two instead of waiting.
 */
export async function runAi<T extends AiTask>(task: T, input: AiInput<T>, onPartial?: (partial: Partial<AiOutput<T>>) => void, opts: { previewed?: boolean } = {}): Promise<AiOutput<T>> {
  const token = cachedToken()
  if (!token) throw new AiSignInRequired()
  if (!navigator.onLine) throw new Error('You’re offline. AI needs a connection.')
  // "Show what's sent" (Settings → AI): nothing leaves the phone until the user has seen it and tapped Send.
  if (!opts.previewed && !(await confirmAiSend({ task, input }))) throw new AiCancelled()
  let r: Response
  try {
    r = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ task, input, stream: !!onPartial }),
    })
  } catch {
    throw new Error('Couldn’t reach the AI service. Check your connection.')
  }
  if (r.status === 401) throw new AiSignInRequired()
  let result: unknown
  if (onPartial && r.ok && r.headers.get('content-type')?.includes('ndjson')) {
    result = await readStream(r, (text) => {
      const partial = parsePartialJson(text)
      if (partial && typeof partial === 'object') onPartial(partial as Partial<AiOutput<T>>)
    })
  } else {
    const body = (await r.json().catch(() => ({}))) as { result?: unknown; error?: string }
    if (!r.ok) throw new Error(body.error ?? `AI request failed (${r.status}).`)
    result = body.result
  }
  const parsed = outputs[task].safeParse(result)
  if (!parsed.success) throw new Error('The AI’s answer wasn’t in the expected shape. Try again.')
  return parsed.data as AiOutput<T>
}

/** Photos are shrunk before sending (faster, cheaper, and under the request size limit). */
export async function imageForAi(blob: Blob, maxSide = 2000): Promise<{ mimeType: 'image/jpeg'; data: string }> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) })
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const jpeg = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Couldn’t prepare the image.'))), 'image/jpeg', 0.85))
  return { mimeType: 'image/jpeg', data: await toBase64(jpeg) }
}

export async function toBase64(blob: Blob): Promise<string> {
  const url = await new Promise<string>((res, rej) => {
    const reader = new FileReader()
    reader.onload = () => res(reader.result as string)
    reader.onerror = () => rej(reader.error)
    reader.readAsDataURL(blob)
  })
  return url.slice(url.indexOf(',') + 1)
}

/** Read the server's newline-delimited events; returns the final result or throws the server's error. */
async function readStream(r: Response, onText: (textSoFar: string) => void): Promise<unknown> {
  const reader = r.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let text = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as { t: 'text'; d: string } | { t: 'reset' } | { t: 'done'; result: unknown } | { t: 'error'; error: string }
      if (event.t === 'text') onText((text += event.d))
      else if (event.t === 'reset') onText((text = ''))
      else if (event.t === 'done') return event.result
      else throw new Error(event.error)
    }
  }
  throw new Error('The AI answer was cut off. Try again.')
}
