/**
 * Who's asking: a valid Google access token issued to this app's client ID, for a verified email on the allowlist.
 * Shared by /api/ai and /api/push. Tokens are checked with Google once, then cached for a few minutes.
 */

export interface AuthDeps {
  clientId?: string
  allowedEmails: string[]
  verifyToken(token: string): Promise<{ aud?: string; azp?: string; email?: string; email_verified?: string | boolean } | undefined>
  now?: () => number
  /** Token cache. Shared per server instance by default; tests pass a fresh one. */
  verified?: Map<string, { email: string; until: number }>
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

const sharedVerified = new Map<string, { email: string; until: number }>()

/** The caller's email, or the response to send back (401/403). */
export async function authorize(req: Request, deps: AuthDeps, what: string): Promise<{ email: string } | Response> {
  const now = deps.now?.() ?? Date.now()
  const verified = deps.verified ?? sharedVerified
  const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1]
  if (!token) return json(401, { error: `Sign in with Google to use ${what}.` })
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
  if (!deps.allowedEmails.includes(email)) return json(403, { error: `${email} isn’t allowed to use ${what} on this server (AI_ALLOWED_EMAILS).` })
  return { email }
}

/** Real Google token check, from the environment (Vercel project settings, or .env.local in dev). */
export function authFromEnv(env: Record<string, string | undefined>): AuthDeps {
  return {
    clientId: env.VITE_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID,
    allowedEmails: (env.AI_ALLOWED_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    async verifyToken(token) {
      const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`)
      return r.ok ? r.json() : undefined
    },
  }
}
