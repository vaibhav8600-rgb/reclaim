/**
 * Groq provider (OpenAI-compatible chat completions): the backup when every Gemini model is busy.
 * Text only — it can't read PDFs or images. Not streamed: Groq's structured outputs don't support streaming,
 * and it answers in a second or two anyway.
 */
import { ModelBusyError, ModelError, type Provider } from './gemini.ts'

export const GROQ_MODELS = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile']
const ATTEMPT_TIMEOUT_MS = 30_000
const MAX_OUTPUT_TOKENS = 4096

export function groqProvider(apiKey: string, models: string[] = GROQ_MODELS, fetchImpl: typeof fetch = fetch): Provider {
  const list = models.length ? models : GROQ_MODELS

  /** `tuned`: schema-guided JSON (+ light reasoning on gpt-oss). The plain form (JSON mode, schema in the prompt) is for models that reject those. */
  const request = (model: string, c: { system: string; text: string; schema: object }, tuned: boolean) =>
    fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: c.system },
          { role: 'user', content: tuned ? c.text : `${c.text}\n\nRespond with JSON matching this JSON Schema:\n${JSON.stringify(c.schema)}` },
        ],
        temperature: 0.2,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        response_format: tuned ? { type: 'json_schema', json_schema: { name: 'answer', strict: false, schema: c.schema } } : { type: 'json_object' },
        ...(tuned && model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
      }),
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    })

  return {
    model: list[0],
    async generateJson(c) {
      if (c.file) throw new ModelError('Groq can’t read documents.')
      const failures: string[] = []
      for (const model of list) {
        try {
          let r = await request(model, c, true)
          if (r.status === 400) r = await request(model, c, false)
          if (r.status === 401 || r.status === 403) throw new ModelError('Groq rejected the API key. Check GROQ_API_KEY on the server.')
          if (!r.ok) {
            failures.push(`${model}: ${r.status}`)
            continue
          }
          const text = ((await r.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content
          return { output: JSON.parse(text ?? ''), model }
        } catch (e) {
          if (e instanceof ModelError) throw e
          failures.push(`${model}: ${e instanceof SyntaxError ? 'answer wasn’t JSON' : 'timed out or connection failed'}`)
        }
      }
      console.warn('[ai] all Groq models failed:', failures.join('; '))
      throw new ModelBusyError(list, 'Groq')
    },
  }
}

/** Try `primary`; if all its models are busy, answer with `backup` (text tasks only). */
export function withBackup(primary: Provider, backup: Provider): Provider {
  return {
    model: `${primary.model} + Groq`,
    async generateJson(c, stream) {
      try {
        return await primary.generateJson(c, stream)
      } catch (e) {
        if (!(e instanceof ModelBusyError) || c.file) throw e
        stream?.onReset()
        try {
          return await backup.generateJson(c)
        } catch (e2) {
          if (e2 instanceof ModelBusyError) throw new ModelBusyError([], 'AI (Gemini and Groq)')
          throw e2
        }
      }
    },
  }
}
