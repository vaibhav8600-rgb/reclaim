import { z } from 'zod'

// No eval-based fast paths: the app runs under a strict Content-Security-Policy (no 'unsafe-eval').
z.config({ jitless: true })
import { DOCUMENT_KIND_VALUES, extractedFact, FACT_FLAGS, FACT_KINDS } from '../../shared/ai'
import { db, DATA_TABLES, type Base, type DataTable } from './db'
import { setMeta } from './repo'
import { dayKey } from '../lib/dates'

const SCHEMA_VERSION = 1

const base = {
  id: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().optional(),
}
const source = z.enum(['user', 'user_confirmed', 'ai_estimate', 'clinician', 'device', 'imported'])
const foodItem = z.object({ name: z.string(), amount: z.string().optional(), protein: z.number().min(0), calories: z.number().min(0).optional() })
const side = z.enum(['left', 'right', 'both', 'none'])

const schemas = {
  profile: z.object({ ...base, name: z.string(), proteinTarget: z.number().min(0).max(1000).optional(), waterTarget: z.number().min(0).max(20_000).optional(), photo: z.string().startsWith('data:image/').max(400_000).optional() }),
  injuries: z.object({
    ...base,
    name: z.string(),
    bodyRegion: z.string(),
    side,
    startDate: z.string(),
    status: z.enum(['active', 'improving', 'monitoring', 'recurring', 'resolved']),
    diagnosis: z.string().optional(),
    mechanism: z.string().optional(),
    notes: z.string().optional(),
  }),
  symptoms: z.object({
    ...base,
    injuryId: z.string().optional(),
    type: z.string(),
    severity: z.number().min(0).max(10),
    recordedAt: z.number(),
    trigger: z.string().optional(),
    notes: z.string().optional(),
    source,
  }),
  measurements: z.object({
    ...base,
    kind: z.string(),
    value: z.number(),
    unit: z.string(),
    side: side.optional(),
    method: z.string().optional(),
    injuryId: z.string().optional(),
    recordedAt: z.number(),
    notes: z.string().optional(),
    source,
  }),
  journal: z.object({ ...base, text: z.string(), recordedAt: z.number(), source }),
  exercises: z.object({
    ...base,
    name: z.string(),
    bodyRegion: z.string(),
    mode: z.enum(['reps', 'time']),
    equipment: z.string().optional(),
    instructions: z.string().optional(),
    builtin: z.boolean().optional(),
  }),
  prescriptions: z.object({
    ...base,
    exerciseId: z.string(),
    injuryId: z.string().optional(),
    sets: z.number().int().min(1),
    target: z.number().min(0),
    load: z.number().optional(),
    loadNote: z.string().optional(),
    timesPerDay: z.number().int().min(1),
    daysPerWeek: z.number().int().min(1).max(7),
    active: z.boolean(),
    notes: z.string().optional(),
  }),
  sessions: z.object({
    ...base,
    startedAt: z.number(),
    recordedAt: z.number(),
    injuryId: z.string().optional(),
    painBefore: z.number().min(0).max(10).optional(),
    painAfter: z.number().min(0).max(10).optional(),
    items: z.array(
      z.object({
        exerciseId: z.string(),
        prescriptionId: z.string().optional(),
        sets: z.array(z.object({ amount: z.number(), load: z.number().optional(), done: z.boolean() })),
        painDuring: z.number().min(0).max(10).optional(),
      }),
    ),
    notes: z.string().optional(),
    source,
  }),
  documents: z.object({
    ...base,
    title: z.string(),
    kind: z.enum(DOCUMENT_KIND_VALUES),
    date: z.string(),
    injuryId: z.string().optional(),
    notes: z.string().optional(),
    fileName: z.string(),
    mimeType: z.string(),
    size: z.number(),
    driveFileId: z.string().optional(),
    aiSummary: z
      .object({
        readable: z.enum(['yes', 'partly', 'no']),
        summary: z.string(),
        findings: z.array(z.object({ label: z.string(), detail: z.string() })),
        questions: z.array(z.string()),
        model: z.string().optional(),
        createdAt: z.number(),
        document: z.object({ title: z.string(), kind: z.enum(DOCUMENT_KIND_VALUES), date: z.string() }).optional(),
        facts: z.array(extractedFact).optional(),
        reviewedAt: z.number().optional(),
      })
      .optional(),
  }),
  meals: z.object({
    ...base,
    name: z.string(),
    slot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
    protein: z.number().min(0),
    calories: z.number().min(0).optional(),
    items: z.array(foodItem),
    recordedAt: z.number(),
    notes: z.string().optional(),
    source,
  }),
  savedMeals: z.object({ ...base, name: z.string(), protein: z.number().min(0), calories: z.number().min(0).optional(), items: z.array(foodItem) }),
  facts: z.object({
    ...base,
    kind: z.enum(FACT_KINDS),
    name: z.string(),
    value: z.number().optional(),
    unit: z.string().optional(),
    range: z.string().optional(),
    flag: z.enum(FACT_FLAGS).optional(),
    detail: z.string().optional(),
    date: z.string(),
    documentId: z.string().optional(),
    evidence: z.string().optional(),
    bodyRegion: z.string().optional(),
    side: z.enum(['left', 'right', 'both']).optional(),
    source,
  }),
  water: z.object({ ...base, amount: z.number().min(0).max(5000), recordedAt: z.number(), source }),
} satisfies Record<DataTable, z.ZodType>

const backupSchema = z.object({
  app: z.literal('reclaim'),
  schemaVersion: z.number().max(SCHEMA_VERSION, 'This backup was made by a newer version of the app.'),
  exportedAt: z.string(),
  data: z.object(Object.fromEntries(DATA_TABLES.map((t) => [t, z.array(schemas[t]).default([])]))),
})

type BackupData = Record<DataTable, Base[]>

/** Every synced table, tombstones included, in the backup format. */
export async function buildBackup() {
  const data = Object.fromEntries(
    await Promise.all(DATA_TABLES.map(async (t) => [t, await db.table(t).toArray()])),
  )
  return { app: 'reclaim', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data }
}

export async function buildBackupFile(): Promise<File> {
  const name = `Reclaim-backup-${dayKey(Date.now())}.json`
  return new File([JSON.stringify(await buildBackup(), null, 2)], name, { type: 'application/json' })
}

export const markBackedUp = () => setMeta('lastBackupAt', Date.now())

export interface ImportPlan {
  exportedAt: string
  data: BackupData
  counts: Record<DataTable, { add: number; update: number; skip: number }>
}

/** Validate a backup and work out what a merge would do, without writing anything. */
export async function planImport(text: string): Promise<ImportPlan> {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error("This file isn't valid JSON.")
  }
  const parsed = backupSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new Error(`This doesn't look like a Reclaim backup (${issue.path.join('.') || 'file'}: ${issue.message}).`)
  }
  const data = parsed.data.data as unknown as BackupData
  const counts = {} as ImportPlan['counts']
  for (const t of DATA_TABLES) {
    const c = { add: 0, update: 0, skip: 0 }
    const local = new Map((await db.table(t).bulkGet(data[t].map((r) => r.id))).map((r, i) => [data[t][i].id, r as Base | undefined]))
    for (const r of data[t]) {
      const existing = local.get(r.id)
      if (!existing) c.add++
      else if (r.updatedAt > existing.updatedAt) c.update++
      else c.skip++
    }
    counts[t] = c
  }
  return { exportedAt: parsed.data.exportedAt, data, counts }
}

/** Merge: new records are added, a record replaces a local one only if it was edited more recently. */
export async function applyImport(plan: ImportPlan) {
  await db.transaction('rw', DATA_TABLES.map((t) => db.table(t)), async () => {
    for (const t of DATA_TABLES) {
      const table = db.table<Base, string>(t)
      const rows = plan.data[t]
      const local = await table.bulkGet(rows.map((r) => r.id))
      const toPut = rows.filter((r, i) => !local[i] || r.updatedAt > local[i]!.updatedAt)
      if (toPut.length) await table.bulkPut(toPut)
    }
  })
}

export async function deleteEverything() {
  await db.delete()
}
