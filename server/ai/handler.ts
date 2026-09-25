import { AI_TASKS, inputs, MAX_REQUEST_BYTES, outputs, type AiHealth, type AiTask } from '../../shared/ai.ts'
import { geminiProvider, ModelBusyError, ModelError, modelsFromEnv, type Provider } from './gemini.ts'
import { GROQ_MODELS, groqProvider, withBackup } from './groq.ts'
import { buildPrompt, SYSTEM } from './prompts.ts'

/**
 * POST /api/ai — run one AI task for the app's owner.
 *
 * Access: a valid Google access token issued to this app's client ID, for an email on AI_ALLOWED_EMAILS.
 * Limits: body size, input schemas, per-user rate limit. Output is schema-validated before it's returned.
 * GET /api/ai — { configured, model } so the app can show whether AI is set up (no auth, no secrets).
 */

export interface Deps {
  provider?: Provider
  clientId?: string
  allowedEmails: string[]
  verifyToken(token: string): Promise<{ aud?: string; azp?: string; email?: string; email_verified?: string | boolean } | undefined>
  now?: () => number
  /** Rate-limit and token caches. Shared per server instance by default; tests pass fresh ones. */
  state?: { hits: Map<string, number[]>; verified: Map<string, { email: string; until: number }> }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

const RATE_LIMIT = 40 // requests
const RATE_WINDOW = 10 * 60_000 // per 10 minutes, per user (per server instance)
/** Access tokens are checked with Google once, then cached for a few minutes. */
const shared = { hits: new Map<string, number[]>(), verified: new Map<string, { email: string; until: number }>() }

export async function handleAi(req: Request, deps: Deps): Promise<Response> {
  const now = deps.now?.() ?? Date.now()
  const { hits, verified } = deps.state ?? shared

  if (req.method === 'GET') return json(200, { configured: !!deps.provider && !!deps.clientId && deps.allowedEmails.length > 0, model: deps.provider?.model } satisfies AiHealth)
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' })
  if (!deps.provider || !deps.clientId || !deps.allowedEmails.length) {
    return json(503, { error: 'AI isn’t set up on the server yet (GEMINI_API_KEY, VITE_GOOGLE_CLIENT_ID and AI_ALLOWED_EMAILS).' })
  }

  // Who's asking
  const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1]
  if (!token) return json(401, { error: 'Sign in with Google to use AI.' })
  const cached = verified.get(token)
  let email = cached && cached.until > now ? cached.email : undefined
  if (!email) {
    for (const [t, v] of verified) if (v.until <= now) verified.delete(t)
    const info = await deps.verifyToken(token).catch(() => undefined)
    if (!info || (info.aud !== deps.clientId && info.azp !== deps.clientId)) return json(401, { error: 'Your Google sign-in has expired. Sign in again.' })
    if (!info.email || !(info.email_verified === true || info.email_verified === 'true')) return json(403, { error: 'This Google account has no verified email.' })
    email = info.email.toLowerCase()
    verified.set(token, { email, until: now + 5 * 60_000 })
  }
  if (!deps.allowedEmails.includes(email)) return json(403, { error: `${email} isn’t allowed to use AI on this server (AI_ALLOWED_EMAILS).` })

  // Rate limit
  const recent = (hits.get(email) ?? []).filter((t) => t > now - RATE_WINDOW)
  if (recent.length >= RATE_LIMIT) return json(429, { error: 'That’s a lot of AI requests. Try again in a few minutes.' })
  hits.set(email, [...recent, now])

  // What they're asking for
  const length = Number(req.headers.get('content-length') ?? 0)
  if (length > MAX_REQUEST_BYTES) return json(413, { error: 'That’s too large to send to the AI.' })
  const raw = await req.text()
  if (raw.length > MAX_REQUEST_BYTES) return json(413, { error: 'That’s too large to send to the AI.' })
  let body: { task?: string; input?: unknown; stream?: boolean }
  try {
    body = JSON.parse(raw)
  } catch {
    return json(400, { error: 'Invalid request.' })
  }
  const task = body.task as AiTask
  if (!AI_TASKS.includes(task)) return json(400, { error: 'Unknown AI task.' })
  const input = inputs[task].safeParse(body.input)
  if (!input.success) return json(400, { error: `Invalid input: ${input.error.issues[0]?.path.join('.')} ${input.error.issues[0]?.message}` })

  const prompt = buildPrompt(task, input.data as never)
  const failure = (e: unknown) => ({
    status: e instanceof ModelBusyError ? 503 : 502,
    error: e instanceof ModelError ? e.message : 'The AI service didn’t respond. Try again.',
  })

  // Streaming: newline-delimited JSON events — {t:'text',d} as the answer is written, {t:'reset'} if a model
  // fails midway and the next one starts over, then {t:'done',result,model} (validated) or {t:'error',status,error}.
  if (body.stream) {
    const provider = deps.provider
    const encoder = new TextEncoder()
    const events = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        try {
          const { output: result, model } = await provider.generateJson({ system: SYSTEM, ...prompt }, { onText: (d) => send({ t: 'text', d }), onReset: () => send({ t: 'reset' }) })
          const output = outputs[task].safeParse(result)
          send(output.success ? { t: 'done', result: output.data, model } : { t: 'error', status: 502, error: 'The AI’s answer wasn’t in the expected shape. Try again.' })
        } catch (e) {
          send({ t: 'error', ...failure(e) })
        }
        controller.close()
      },
    })
    return new Response(events, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } })
  }

  // Ask the model, and only return output that matches the contract.
  try {
    const { output: result, model } = await deps.provider.generateJson({ system: SYSTEM, ...prompt })
    const output = outputs[task].safeParse(result)
    if (!output.success) return json(502, { error: 'The AI’s answer wasn’t in the expected shape. Try again.' })
    return json(200, { result: output.data, model })
  } catch (e) {
    const f = failure(e)
    return json(f.status, { error: f.error })
  }
}

/** Real dependencies from environment variables (Vercel project settings, or .env.local in dev). */
export function depsFromEnv(env: Record<string, string | undefined>): Deps {
  const gemini = env.GEMINI_API_KEY ? geminiProvider(env.GEMINI_API_KEY, modelsFromEnv(env.GEMINI_MODEL)) : undefined
  const groq = env.GROQ_API_KEY ? groqProvider(env.GROQ_API_KEY, modelsFromEnv(env.GROQ_MODEL, GROQ_MODELS)) : undefined
  return {
    provider: gemini && groq ? withBackup(gemini, groq) : (gemini ?? groq),
    clientId: env.VITE_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID,
    allowedEmails: (env.AI_ALLOWED_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    async verifyToken(token) {
      const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`)
      return r.ok ? r.json() : undefined
    },
  }
}
