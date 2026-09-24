import { useSyncExternalStore } from 'react'
import { db, type MedicalDocument } from '../db/db'
import { getMeta, newId, onLocalChange, setMeta } from '../db/repo'
import { deriveKey, newVaultParams, open, openText, readHeader, seal, WrongPassphraseError, type VaultParams } from './crypto'
import { deleteFile, downloadFile, DriveAuthError, listFiles, uploadFile, type DriveFile } from './drive'
import { cachedToken, fetchEmail, forgetToken } from './google'

/**
 * Google Drive sync. Everything is encrypted on the device before upload.
 *
 *   pull  – merge the newest remote snapshot we haven't seen (newest edit of each record wins)
 *   files – upload documents that aren't in Drive yet; delete Drive copies of deleted documents
 *   push  – upload a fresh encrypted snapshot of every table, then keep only the newest few
 */

const SNAPSHOT = 'reclaim-snapshot-'
const KEEP_SNAPSHOTS = 10

export interface Vault {
  params: VaultParams
  key: CryptoKey
}
export interface DriveLink {
  email?: string
  connectedAt: number
}

export const getVault = () => getMeta<Vault>('vault')
export const getDriveLink = () => getMeta<DriveLink>('drive')

/* ── status store for the UI ── */
export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error'
  step?: string
  error?: string
  needsSignIn?: boolean
}
let status: SyncStatus = { state: 'idle' }
const listeners = new Set<() => void>()
const setStatus = (s: SyncStatus) => {
  status = s
  listeners.forEach((l) => l())
}
export function useSyncStatus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
  )
}

async function deviceId() {
  let id = await getMeta<string>('deviceId')
  if (!id) await setMeta('deviceId', (id = newId()))
  return id
}
const deviceName = () => (/iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) ? 'iPad' : /Android/.test(navigator.userAgent) ? 'Android' : 'Computer')

export const listSnapshots = (token: string) => listFiles(token, SNAPSHOT)

/**
 * First connection on this device. If Drive already has Reclaim backups, the passphrase must unlock them;
 * otherwise it becomes the passphrase for a new encrypted vault.
 */
export async function connectDrive(token: string, passphrase: string, existing: DriveFile[]) {
  setStatus({ state: 'syncing', step: 'Unlocking…' })
  try {
    const latest = existing[0]
    const params: VaultParams = latest?.appProperties?.salt
      ? { salt: latest.appProperties.salt, iterations: Number(latest.appProperties.iterations) }
      : newVaultParams()
    const key = await deriveKey(passphrase, params)
    if (latest) await open(key, await downloadFile(token, latest.id)) // throws WrongPassphraseError
    await setMeta('vault', { params, key } satisfies Vault)
    await setMeta('drive', { email: await fetchEmail(token).catch(() => undefined), connectedAt: Date.now() } satisfies DriveLink)
    await setMeta('lastMergedSnapshot', undefined)
  } catch (e) {
    setStatus({ state: 'idle' })
    throw e
  }
  await syncNow(token)
}

/**
 * Sign out: back up everything to Drive first, then clear this device. Signing in again (with the passphrase)
 * brings it all back. If the backup fails, nothing is cleared.
 */
export async function signOut(token: string) {
  const started = Date.now()
  await syncNow(token)
  await syncNow(token, true) // a run already in progress may have started before the latest edits; this one always uploads
  // Never clear the device on the assumption that a backup happened: a sync without a vault returns quietly.
  if (((await getMeta<number>('lastSyncAt')) ?? 0) < started) throw new Error('The backup to Google Drive didn’t finish.')
  forgetToken()
  await db.delete()
}

/** Delete every Reclaim file in the Drive app folder: snapshots and encrypted records. */
export async function deleteDriveData(token: string) {
  for (let round = 0; round < 50; round++) {
    const files = await listFiles(token, 'reclaim-') // 100 per page: repeat until none are left
    if (!files.length) return
    await Promise.all(files.map((f) => deleteFile(token, f.id)))
  }
}

let running: Promise<void> | undefined

/**
 * Pull → files → push. Concurrent calls share one run. The push (a full encrypted snapshot) only happens when
 * something changed on this device since the last one, unless `force` (Sync Now, Sign Out): opening the app
 * just checks Drive for newer snapshots, one small request.
 */
export function syncNow(token = cachedToken(), force = false): Promise<void> {
  running ??= run(token, force).finally(() => (running = undefined))
  return running
}

/** When this device last changed data (set on every local edit). */
const CHANGED_KEY = 'localChangesAt'
/** When the last pushed snapshot was built. */
const PUSHED_KEY = 'lastPushAt'

async function run(token: string | undefined, force: boolean) {
  const vault = await getVault()
  if (!vault) return
  if (!token) return setStatus({ state: 'error', error: 'Sign in to Google to sync.', needsSignIn: true })
  try {
    const { applyImport, buildBackup, planImport } = await import('../db/backup') // loaded on first sync
    // Pull
    setStatus({ state: 'syncing', step: 'Checking Drive…' })
    const snapshots = await listSnapshots(token)
    const latest = snapshots[0]
    if (latest && latest.id !== (await getMeta<string>('lastMergedSnapshot'))) {
      setStatus({ state: 'syncing', step: 'Merging changes…' })
      await applyImport(await planImport(await openText(vault.key, await downloadFile(token, latest.id))))
    }

    // Files
    let filesChanged = false
    const docs = await db.documents.toArray()
    for (const d of docs) {
      if (d.deletedAt && d.driveFileId) {
        await deleteFile(token, d.driveFileId)
        await db.documents.put({ ...d, driveFileId: undefined, updatedAt: Date.now() })
        await db.files.delete(d.id)
        filesChanged = true
      } else if (!d.deletedAt && !d.driveFileId) {
        const file = await db.files.get(d.id)
        if (!file) continue
        setStatus({ state: 'syncing', step: `Uploading ${d.title}…` })
        const sealed = await seal(vault.key, new Uint8Array(file.bytes), { kind: 'document', ...vault.params, mimeType: d.mimeType })
        const driveFileId = await uploadFile(token, `reclaim-doc-${d.id}`, sealed, { docId: d.id })
        await db.documents.put({ ...d, driveFileId, updatedAt: Date.now() })
        filesChanged = true
      }
    }

    // Push, only when there's something new to send
    const [changedAt, pushedAt] = await Promise.all([getMeta<number>(CHANGED_KEY), getMeta<number>(PUSHED_KEY)])
    if (!force && !filesChanged && pushedAt !== undefined && (changedAt ?? 0) <= pushedAt) {
      await setMeta('lastSyncAt', Date.now())
      return setStatus({ state: 'idle' })
    }

    setStatus({ state: 'syncing', step: 'Backing up…' })
    const builtAt = Date.now() // edits after this moment belong to the next push
    const sealed = await seal(vault.key, JSON.stringify(await buildBackup()), { kind: 'snapshot', ...vault.params })
    const id = await uploadFile(token, `${SNAPSHOT}${Date.now()}`, sealed, {
      salt: vault.params.salt,
      iterations: String(vault.params.iterations),
      device: deviceName(),
      deviceId: await deviceId(),
    })
    const now = Date.now()
    await setMeta('lastMergedSnapshot', id)
    await setMeta(PUSHED_KEY, builtAt)
    await setMeta('lastSyncAt', now)
    await setMeta('lastBackupAt', now)
    // Re-list so snapshots uploaded meanwhile by another device are counted too.
    const all = await listSnapshots(token)
    await Promise.all(all.slice(KEEP_SNAPSHOTS).map((s) => deleteFile(token, s.id)))
    setStatus({ state: 'idle' })
  } catch (e) {
    setStatus({
      state: 'error',
      error: e instanceof WrongPassphraseError ? 'Your Drive backup was encrypted with a different passphrase. Sign out and restore to enter it.' : (e as Error).message,
      needsSignIn: e instanceof DriveAuthError,
    })
    throw e
  }
}

/** The document's bytes: from this device, or downloaded from Drive, decrypted and cached. */
export async function documentBlob(doc: MedicalDocument): Promise<Blob> {
  const local = await db.files.get(doc.id)
  if (local) return new Blob([local.bytes], { type: local.type })
  const token = cachedToken()
  const vault = await getVault()
  if (!doc.driveFileId || !vault) throw new Error('This file is only on the device it was added from. Connect Google Drive there to sync it.')
  if (!token) throw new DriveAuthError()
  const buf = await downloadFile(token, doc.driveFileId)
  if (readHeader(buf).header.kind !== 'document') throw new Error('Unexpected file in Drive.')
  const bytes = (await open(vault.key, buf)).buffer
  await db.files.put({ id: doc.id, bytes, type: doc.mimeType })
  return new Blob([bytes], { type: doc.mimeType })
}

/**
 * Background sync, only while signed in (it never opens a sign-in popup):
 * shortly after local edits, and whenever the app comes back to the foreground.
 */
export function startAutoSync() {
  let timer: ReturnType<typeof setTimeout> | undefined
  const maybeSync = () => {
    if (!navigator.onLine || !cachedToken()) return
    void getVault().then((v) => v && syncNow().catch(() => {}))
  }
  let checkedAt = 0
  onLocalChange(() => {
    void setMeta(CHANGED_KEY, Date.now())
    clearTimeout(timer)
    timer = setTimeout(maybeSync, 8000) // edits in quick succession go up together
  })
  // Coming back to the app checks Drive for changes from other devices, at most once a minute.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - checkedAt < 60_000) return
    checkedAt = Date.now()
    maybeSync()
  })
  window.addEventListener('online', maybeSync)
  maybeSync()
}

/** Local copies of documents deleted more than a day ago (so Undo still works meanwhile). */
export async function pruneDeletedFiles() {
  const cutoff = Date.now() - 86_400_000
  const gone = (await db.documents.toArray()).filter((d) => d.deletedAt && d.deletedAt < cutoff)
  await db.files.bulkDelete(gone.map((d) => d.id))
}
