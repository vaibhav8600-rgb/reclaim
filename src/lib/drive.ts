/** Minimal Google Drive v3 client for the hidden app folder (appDataFolder). */

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const MULTIPART_LIMIT = 5 * 1024 * 1024

export interface DriveFile {
  id: string
  name: string
  size?: string
  createdTime: string
  appProperties?: Record<string, string>
}

/** The token expired or was revoked: sign in again. */
export class DriveAuthError extends Error {
  constructor() {
    super('Google sign-in expired. Sign in again to sync.')
  }
}

async function call(token: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } })
  if (r.status === 401) throw new DriveAuthError()
  if (!r.ok) throw new Error(`Google Drive error ${r.status}`)
  return r
}

export async function listFiles(token: string, nameContains: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name contains '${nameContains}' and trashed = false`,
    fields: 'files(id,name,size,createdTime,appProperties)',
    orderBy: 'createdTime desc',
    pageSize: '100',
  })
  const r = await call(token, `${API}/files?${params}`)
  return ((await r.json()) as { files: DriveFile[] }).files
}

/** Upload into the app folder: multipart for small files, resumable for large ones. Returns the file id. */
export async function uploadFile(token: string, name: string, blob: Blob, appProperties: Record<string, string> = {}): Promise<string> {
  const metadata = { name, parents: ['appDataFolder'], appProperties }
  if (blob.size <= MULTIPART_LIMIT) {
    const boundary = `reclaim${crypto.getRandomValues(new Uint32Array(2)).join('')}`
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ])
    const r = await call(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: await body.arrayBuffer(),
    })
    return ((await r.json()) as { id: string }).id
  }
  const start = await call(token, `${UPLOAD}/files?uploadType=resumable&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/octet-stream' },
    body: JSON.stringify(metadata),
  })
  const session = start.headers.get('Location')
  if (!session) throw new Error('Google Drive upload could not start.')
  const r = await call(token, session, { method: 'PUT', body: await blob.arrayBuffer() })
  return ((await r.json()) as { id: string }).id
}

export async function downloadFile(token: string, id: string): Promise<ArrayBuffer> {
  return (await call(token, `${API}/files/${id}?alt=media`)).arrayBuffer()
}

export async function deleteFile(token: string, id: string) {
  const r = await fetch(`${API}/files/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  if (r.status === 401) throw new DriveAuthError()
  if (!r.ok && r.status !== 404) throw new Error(`Google Drive error ${r.status}`)
}
