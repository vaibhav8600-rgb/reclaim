/**
 * Gemini provider (generateContent / streamGenerateContent) with model fallbacks.
 * The handler only needs this interface; another provider can implement the same.
 */

export interface ModelCall {
  system: string
  text: string
  file?: { mimeType: string; data: string }
  schema: object
}

export interface Provider {
  /** The first-choice model (shown in Settings). */
  model: string
  /**
   * Returns the parsed JSON and the model that answered. With `onText`, the answer streams:
   * `onText` gets each new piece of text; `onReset` is called if a model fails mid-way and the next one starts over.
   */
  generateJson(call: ModelCall, stream?: { onText(chunk: string): void; onReset(): void }): Promise<{ output: unknown; model: string }>
}

/** A problem the user can act on or should read (safe to show). */
export class ModelError extends Error {}
/** Every model was busy or rate-limited: worth retrying shortly. */
export class ModelBusyError extends ModelError {
  constructor(tried: string[], service = 'Gemini') {
    const what = tried.length === 0 ? '' : ` (tried ${tried.length === 1 ? tried[0] : `${tried.length} models`})`
    super(`${service} is busy right now${what}. Try again in a minute.`)
  }
}

/** Models tried in order when one is overloaded, rate-limited, missing or slow. */
export const DEFAULT_MODELS = ['gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']
/**
 * Time allowed for a model to start answering. Measured on the free tier: requests wait 20–30 s in Google's queue,
 * then the answer takes ~1 s to write — so be patient before first byte, and short once it's writing.
 */
const FIRST_BYTE_TIMEOUT_MS = 45_000
const ATTEMPT_TIMEOUT_MS = 45_000
/** A model that just said "busy" is skipped for a while, instead of costing every request a failed attempt. */
const BUSY_COOLDOWN_MS = 90_000
/** Our tasks are structured summaries, not puzzles: light thinking is faster (Flash defaults to "medium"). */
const THINKING_LEVEL = 'low'
/** Answers are small JSON objects; the cap stops a runaway response early. */
const MAX_OUTPUT_TOKENS = 4096

/** Worth trying the next model: overloaded (503), rate/quota limited (429), server errors, model not found. */
const shouldFallBack = (status: number) => status === 429 || status === 404 || status >= 500

type Attempt = { output: unknown } | { fallBack: string; busy: boolean }

export function geminiProvider(apiKey: string, models: string[] = DEFAULT_MODELS, fetchImpl: typeof fetch = fetch, now = () => Date.now()): Provider {
  const list = models.length ? models : DEFAULT_MODELS
  const busyUntil = new Map<string, number>()

  /**
   * `tuned`: JSON schema + light thinking + token cap. The plain form (schema restated in the prompt)
   * is the fallback for a model that rejects any of those settings.
   */
  function request(model: string, c: ModelCall, tuned: boolean, streaming: boolean, signal: AbortSignal) {
    const parts: object[] = [{ text: c.text }]
    if (c.file) parts.push({ inlineData: { mimeType: c.file.mimeType, data: c.file.data } })
    if (!tuned) parts.push({ text: `Respond with JSON matching this JSON Schema:\n${JSON.stringify(c.schema)}` })
    const body = {
      systemInstruction: { parts: [{ text: c.system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        ...(tuned ? { responseJsonSchema: c.schema, maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingLevel: THINKING_LEVEL } } : {}),
      },
    }
    const method = streaming ? 'streamGenerateContent?alt=sse' : 'generateContent'
    return fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal,
    })
  }

  const parse = (text: string, model: string): Attempt => {
    try {
      return { output: JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) }
    } catch {
      return { fallBack: `${model}: answer wasn't JSON`, busy: false }
    }
  }

  async function tryModel(model: string, c: ModelCall, stream?: { onText(chunk: string): void; onReset(): void }): Promise<Attempt> {
    const controller = new AbortController()
    const firstByte = setTimeout(() => controller.abort(), stream ? FIRST_BYTE_TIMEOUT_MS : ATTEMPT_TIMEOUT_MS)
    const overall = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS + 15_000)
    try {
      let r = await request(model, c, true, !!stream, controller.signal)
      // A model may reject the schema or thinking settings: retry it once with a plain request.
      if (r.status === 400) r = await request(model, c, false, !!stream, controller.signal)
      if (r.status === 401 || r.status === 403) throw new ModelError('Gemini rejected the API key. Check GEMINI_API_KEY on the server.')
      if (shouldFallBack(r.status)) return { fallBack: `${model}: ${r.status}`, busy: r.status === 429 || r.status === 503 }
      if (!r.ok) throw new ModelError(`Gemini couldn’t handle this request (${r.status}).`)

      if (!stream) {
        clearTimeout(firstByte)
        const json = (await r.json()) as GeminiResponse
        blockCheck(json)
        const text = textOf(json)
        return text ? parse(text, model) : { fallBack: `${model}: empty answer`, busy: false }
      }

      // Server-sent events: each `data:` line is a GeminiResponse carrying the next piece of text.
      let text = ''
      let pending = ''
      const reader = r.body!.pipeThrough(new TextDecoderStream()).getReader()
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        clearTimeout(firstByte)
        pending += value
        const lines = pending.split('\n')
        pending = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const json = JSON.parse(line.slice(5)) as GeminiResponse
          blockCheck(json)
          const chunk = textOf(json)
          if (chunk) {
            text += chunk
            stream.onText(chunk)
          }
        }
      }
      if (!text) return { fallBack: `${model}: empty answer`, busy: false }
      const result = parse(text, model)
      if ('fallBack' in result) stream.onReset()
      return result
    } catch (e) {
      if (e instanceof ModelError) throw e
      stream?.onReset()
      return { fallBack: `${model}: ${controller.signal.aborted ? 'timed out' : 'connection failed'}`, busy: controller.signal.aborted }
    } finally {
      clearTimeout(firstByte)
      clearTimeout(overall)
    }
  }

  return {
    model: list[0],
    async generateJson(c, stream) {
      const t = now()
      // Models not known to be busy go first; busy ones stay as a last resort.
      const order = [...list.filter((m) => (busyUntil.get(m) ?? 0) <= t), ...list.filter((m) => (busyUntil.get(m) ?? 0) > t)]
      const failures: string[] = []
      for (const model of order) {
        const attempt = await tryModel(model, c, stream)
        if ('output' in attempt) {
          busyUntil.delete(model)
          return { output: attempt.output, model }
        }
        if (attempt.busy) busyUntil.set(model, now() + BUSY_COOLDOWN_MS)
        failures.push(attempt.fallBack)
      }
      console.warn('[ai] all models failed:', failures.join('; '))
      throw new ModelBusyError(list)
    },
  }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
}
const textOf = (r: GeminiResponse) => r.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? ''
function blockCheck(r: GeminiResponse) {
  if (r.promptFeedback?.blockReason) throw new ModelError(`Gemini declined this request (${r.promptFeedback.blockReason}).`)
}

/** GEMINI_MODEL may be one model or a comma-separated fallback list. */
export const modelsFromEnv = (value?: string, defaults = DEFAULT_MODELS) =>
  value
    ?.split(',')
    .map((m) => m.trim())
    .filter(Boolean) ?? defaults
