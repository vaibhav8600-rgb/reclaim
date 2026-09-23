/**
 * Google sign-in with Google Identity Services, entirely in the browser (no server).
 * Only the hidden Drive app folder is requested, plus the account email to show which account is linked.
 * Access tokens last an hour and are never persisted beyond this app session.
 */

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const SCOPES = `${DRIVE_SCOPE} openid email`
const TOKEN_KEY = 'reclaim.googleToken'

interface TokenResponse {
  access_token: string
  expires_in: number
  scope: string
  error?: string
  error_description?: string
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; hint?: string }): void
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (r: TokenResponse) => void
            error_callback?: (e: { type: string; message?: string }) => void
          }): TokenClient
          hasGrantedAllScopes(r: TokenResponse, ...scopes: string[]): boolean
          revoke(token: string, done?: () => void): void
        }
      }
    }
  }
}

let gis: Promise<void> | undefined
let client: TokenClient | undefined
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | undefined

function loadGis() {
  gis ??= new Promise<void>((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', async: true })
    s.onload = () => resolve()
    s.onerror = () => {
      gis = undefined
      reject(new Error("Couldn't reach Google. Check your connection."))
    }
    document.head.append(s)
  })
  return gis
}

/** Load Google's library ahead of time, so a later tap can open the sign-in popup immediately. */
export async function prepareGoogle() {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google sign-in is not configured.')
  await loadGis()
  client ??= window.google!.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: (r) => {
      if (r.error) return pending?.reject(new Error(r.error_description || r.error))
      if (!window.google!.accounts.oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE)) {
        // Google's consent screen shows each permission as a checkbox; the Drive one was left unticked.
        // Ask again with the consent screen forced, so the checkbox is shown instead of the remembered choice.
        driveDeclined = true
        return pending?.reject(new MissingDrivePermissionError())
      }
      driveDeclined = false
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: r.access_token, exp: Date.now() + r.expires_in * 1000 }))
      pending?.resolve(r.access_token)
    },
    error_callback: (e) => pending?.reject(new Error(e.type === 'popup_closed' ? 'Sign-in was cancelled.' : e.message || e.type)),
  })
}

export const isGoogleReady = () => !!client

/** Signed in, but the Drive checkbox on Google's consent screen wasn't ticked. */
export class MissingDrivePermissionError extends Error {
  constructor() {
    super('Google didn’t give Reclaim access to its Drive folder. Tap Continue with Google again and, on Google’s screen, tick the box for Google Drive (“See, create, and delete its own configuration data”) before continuing.')
  }
}

let driveDeclined = false

/**
 * Opens Google's sign-in popup. Call it directly inside a tap handler (browsers block popups otherwise),
 * after prepareGoogle() has resolved.
 */
export function requestToken(hint?: string): Promise<string> {
  if (!client) return Promise.reject(new Error('Google sign-in is still loading. Try again.'))
  return new Promise((resolve, reject) => {
    pending = { resolve, reject }
    client!.requestAccessToken({ prompt: driveDeclined ? 'consent' : '', hint })
  })
}

/** A still-valid token from this app session, if any. */
export function cachedToken(): string | undefined {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as { token: string; exp: number } | null
    return t && t.exp > Date.now() + 60_000 ? t.token : undefined
  } catch {
    return undefined
  }
}

export function forgetToken() {
  const t = cachedToken()
  sessionStorage.removeItem(TOKEN_KEY)
  if (t) window.google?.accounts.oauth2.revoke(t)
}

export async function fetchEmail(token: string): Promise<string | undefined> {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } })
  return r.ok ? ((await r.json()) as { email?: string }).email : undefined
}
