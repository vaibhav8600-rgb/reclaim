import type { BrowserContext, Route } from '@playwright/test'

/**
 * In-memory stand-in for Google sign-in and the Drive v3 app folder, shared by any number of
 * browser contexts — so two contexts behave like two devices syncing through one Google account.
 */

export const FAKE_TOKEN = 'fake-access-token'
export const FAKE_EMAIL = 'alex@example.com'

/**
 * Stub of https://accounts.google.com/gsi/client.
 *   window.__denyGoogle = true       → the user closes the popup
 *   window.__untickDriveOnce = true  → the first consent leaves the Drive checkbox unticked
 * Each request's prompt is recorded in window.__gisPrompts.
 */
const GIS_STUB = `
window.__gisPrompts = []
window.google = { accounts: { oauth2: {
  initTokenClient(cfg) {
    return { requestAccessToken(o) {
      window.__gisPrompts.push((o && o.prompt) || '')
      const untick = window.__untickDriveOnce
      window.__untickDriveOnce = false
      const scope = untick ? 'openid email' : cfg.scope
      setTimeout(() => window.__denyGoogle
        ? cfg.error_callback && cfg.error_callback({ type: 'popup_closed' })
        : cfg.callback({ access_token: '${FAKE_TOKEN}', expires_in: 3599, scope, token_type: 'Bearer' }), 30)
    } }
  },
  hasGrantedAllScopes(r, ...scopes) { return scopes.every((s) => r.scope.split(' ').includes(s)) },
  revoke(t, done) { done && done() },
} } }`

export interface StoredFile {
  id: string
  name: string
  createdTime: string
  appProperties: Record<string, string>
  body: Buffer
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-expose-headers': 'Location',
}

export class FakeDrive {
  files = new Map<string, StoredFile>()
  private seq = 0
  private sessions = new Map<string, { name: string; appProperties: Record<string, string> }>()

  async install(context: BrowserContext) {
    await context.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GIS_STUB }))
    await context.route('https://www.googleapis.com/**', (r) => this.handle(r))
  }

  snapshots = () => [...this.files.values()].filter((f) => f.name.startsWith('reclaim-snapshot-'))
  documents = () => [...this.files.values()].filter((f) => f.name.startsWith('reclaim-doc-'))

  private create(name: string, appProperties: Record<string, string>, body: Buffer) {
    const id = `file-${++this.seq}`
    this.files.set(id, { id, name, appProperties, body, createdTime: new Date(Date.UTC(2026, 0, 1) + this.seq * 1000).toISOString() })
    return id
  }

  private async handle(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
      route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (req.headers()['authorization'] !== `Bearer ${FAKE_TOKEN}`) return json(401, { error: 'unauthorized' })

    if (url.pathname === '/oauth2/v3/userinfo') return json(200, { email: FAKE_EMAIL })

    if (url.pathname === '/drive/v3/files' && req.method() === 'GET') {
      const needle = /name contains '([^']+)'/.exec(url.searchParams.get('q') ?? '')?.[1] ?? ''
      const files = [...this.files.values()]
        .filter((f) => f.name.includes(needle))
        .sort((a, b) => b.createdTime.localeCompare(a.createdTime))
        .map(({ id, name, createdTime, appProperties, body }) => ({ id, name, createdTime, appProperties, size: String(body.length) }))
      return json(200, { files })
    }

    if (url.pathname === '/upload/drive/v3/files' && req.method() === 'POST' && url.searchParams.get('uploadType') === 'multipart') {
      const boundary = /boundary=(.+)$/.exec(req.headers()['content-type'] ?? '')![1]
      const body = req.postDataBuffer()!
      const sep = Buffer.from(`--${boundary}`)
      const metaStart = body.indexOf('\r\n\r\n') + 4
      const metaEnd = body.indexOf(sep, metaStart) - 2
      const meta = JSON.parse(body.subarray(metaStart, metaEnd).toString('utf8'))
      const dataStart = body.indexOf('\r\n\r\n', metaEnd + 2) + 4
      const dataEnd = body.lastIndexOf(Buffer.from(`\r\n--${boundary}--`))
      return json(200, { id: this.create(meta.name, meta.appProperties ?? {}, Buffer.from(body.subarray(dataStart, dataEnd))) })
    }

    if (url.pathname === '/upload/drive/v3/files' && req.method() === 'POST' && url.searchParams.get('uploadType') === 'resumable') {
      const meta = JSON.parse(req.postData() ?? '{}')
      const session = `session-${++this.seq}`
      this.sessions.set(session, { name: meta.name, appProperties: meta.appProperties ?? {} })
      return route.fulfill({ status: 200, headers: { ...CORS, location: `https://www.googleapis.com/upload/drive/v3/files?upload_id=${session}` } })
    }

    if (url.pathname === '/upload/drive/v3/files' && req.method() === 'PUT') {
      const s = this.sessions.get(url.searchParams.get('upload_id') ?? '')
      if (!s) return json(404, {})
      return json(200, { id: this.create(s.name, s.appProperties, req.postDataBuffer() ?? Buffer.alloc(0)) })
    }

    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname)
    if (one) {
      const file = this.files.get(one[1])
      if (req.method() === 'DELETE') {
        this.files.delete(one[1])
        return route.fulfill({ status: file ? 204 : 404, headers: CORS })
      }
      if (!file) return json(404, {})
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/octet-stream' }, body: file.body })
    }

    return json(400, { error: `unhandled ${req.method()} ${url.pathname}` })
  }
}
