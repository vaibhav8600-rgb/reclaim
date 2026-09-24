import { useSyncExternalStore } from 'react'
import { MAX_DOCUMENT_BYTES_FOR_AI, type ExtractedFact } from '../../shared/ai'
import { db, type HealthFact, type MedicalDocument } from '../db/db'
import { alive, getMeta, save, setMeta, softDelete } from '../db/repo'
import { imageForAi, runAi, toBase64 } from './ai'
import { dayKey } from './dates'
import { formatBytes } from './platform'
import { effectiveFlag } from './facts'
import { documentBlob } from './sync'

/**
 * The medical history: records are read by the AI into facts (lab results, medicines, diagnoses…),
 * which the user reviews before they're saved. Nothing the AI reads is kept as fact until then.
 */

/** A problem with one file (too large, unsupported): skip it and carry on with the others. */
class DocumentError extends Error {}

/** Never read, or read before facts were extracted. */
export const needsReading = (d: MedicalDocument) => !d.aiSummary?.facts

/** Read, with facts that haven't been reviewed yet. */
export const needsReview = (d: MedicalDocument) => !!d.aiSummary?.facts?.length && !d.aiSummary.reviewedAt

async function fileForAi(doc: MedicalDocument, blob: Blob): Promise<{ mimeType: 'application/pdf' | 'image/jpeg'; data: string }> {
  if (doc.mimeType.startsWith('image/')) {
    try {
      return await imageForAi(blob)
    } catch {
      throw new DocumentError('This image couldn’t be opened.')
    }
  }
  if (doc.mimeType !== 'application/pdf') throw new DocumentError('Only PDFs and photos can be read.')
  if (blob.size > MAX_DOCUMENT_BYTES_FOR_AI) throw new DocumentError(`This PDF is ${formatBytes(blob.size)} — too large for the AI (limit ${formatBytes(MAX_DOCUMENT_BYTES_FOR_AI)}). Add a photo of the key page instead, or add its facts by hand.`)
  return { mimeType: 'application/pdf', data: await toBase64(blob) }
}

/**
 * Summarise a record and pull out its facts. `fillDetails` also files it under the title, type and date
 * printed on it (records added in bulk, whose details are only placeholders).
 */
export async function readDocument(doc: MedicalDocument, { fillDetails = false, onPartial }: { fillDetails?: boolean; onPartial?: (p: object) => void } = {}) {
  const file = await fileForAi(doc, await documentBlob(doc))
  // Streamed even without a live preview: long answers (a full blood panel) get more time that way.
  const result = await runAi('summarize-document', { title: doc.title, kind: doc.kind, ...file }, onPartial ?? (() => {}))
  const latest = (await db.documents.get(doc.id)) ?? doc // it may have been edited meanwhile
  const d = result.document
  const details = fillDetails
    ? { ...(d.title.trim() && { title: d.title.trim() }), kind: d.kind, ...(d.date && d.date <= dayKey(Date.now()) && { date: d.date }) }
    : {}
  await save(db.documents, { ...latest, ...details, aiSummary: { ...result, createdAt: Date.now(), reviewedAt: result.facts.length ? undefined : Date.now() } })
}

/* ─────────── reading many records ─────────── */

/** Records added in bulk wait here until read (kept in the database, so an interrupted import resumes). */
const QUEUE_KEY = 'importQueue'
export const queueForReading = async (ids: string[]) => setMeta(QUEUE_KEY, [...new Set([...((await getMeta<string[]>(QUEUE_KEY)) ?? []), ...ids])])

export interface ReadProgress {
  running: boolean
  done: number
  total: number
  current?: string
  /** Files that couldn't be read, and why. */
  skipped: { id: string; title: string; reason: string }[]
}
let progress: ReadProgress = { running: false, done: 0, total: 0, skipped: [] }
const listeners = new Set<() => void>()
const update = (p: Partial<ReadProgress>) => {
  progress = { ...progress, ...p }
  listeners.forEach((fn) => fn())
}
export const useReadProgress = () =>
  useSyncExternalStore(
    (fn) => (listeners.add(fn), () => void listeners.delete(fn)),
    () => progress,
  )

/**
 * Read records one at a time (free-tier friendly). Carries on in the background if the screen changes.
 * A file problem skips that file; an AI or connection problem stops the run (no point spending quota),
 * and the rest stay unread for next time.
 */
export async function readDocuments(ids: string[]) {
  if (progress.running) return
  update({ running: true, done: 0, total: ids.length, skipped: [] })
  try {
    for (const id of ids) {
      const doc = await db.documents.get(id)
      if (doc && alive(doc)) {
        update({ current: doc.title })
        const queued = (await getMeta<string[]>(QUEUE_KEY)) ?? []
        try {
          await readDocument(doc, { fillDetails: queued.includes(id) })
          await setMeta(QUEUE_KEY, ((await getMeta<string[]>(QUEUE_KEY)) ?? []).filter((x) => x !== id))
        } catch (e) {
          if (!(e instanceof DocumentError)) throw e
          update({ skipped: [...progress.skipped, { id, title: doc.title, reason: e.message }] })
        }
      }
      update({ done: progress.done + 1 })
    }
  } finally {
    update({ running: false, current: undefined })
  }
}

/* ─────────── reviewing ─────────── */

/** Save the facts the user kept. Replaces any saved earlier from the same record, so reading it again doesn't duplicate. */
export async function confirmFacts(doc: MedicalDocument, kept: ExtractedFact[]) {
  await db.transaction('rw', db.facts, db.documents, async () => {
    const earlier = (await db.facts.where('documentId').equals(doc.id).toArray()).filter(alive)
    for (const f of earlier) await softDelete(db.facts, f.id)
    for (const f of kept) {
      await save(db.facts, {
        kind: f.kind,
        name: f.name.trim(),
        value: f.value,
        unit: f.unit || undefined,
        range: f.range || undefined,
        flag: effectiveFlag(f),
        detail: f.detail || undefined,
        evidence: f.evidence,
        bodyRegion: f.kind === 'condition' ? f.bodyRegion : undefined,
        side: f.kind === 'condition' ? f.side : undefined,
        date: doc.date,
        documentId: doc.id,
        source: 'user_confirmed',
      } satisfies Omit<HealthFact, 'id' | 'createdAt' | 'updatedAt'>)
    }
    await save(db.documents, { ...doc, aiSummary: { ...doc.aiSummary!, reviewedAt: Date.now() } })
  })
}
