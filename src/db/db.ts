import { Dexie, type Table } from 'dexie'
import { STARTER_EXERCISES } from '../lib/exercises'

/** Where a value came from. AI values stay `ai_estimate` until the user confirms them. */
export type Source = 'user' | 'user_confirmed' | 'ai_estimate' | 'clinician' | 'device' | 'imported'

/** Every synced record carries these. `deletedAt` is a tombstone so deletes survive backup merges. */
export interface Base {
  id: string
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export type Side = 'left' | 'right' | 'both' | 'none'
export type InjuryStatus = 'active' | 'improving' | 'monitoring' | 'recurring' | 'resolved'

export interface Profile extends Base {
  name: string
  /** Daily protein goal in grams. */
  proteinTarget?: number
}

export interface Injury extends Base {
  name: string
  bodyRegion: string
  side: Side
  /** YYYY-MM-DD */
  startDate: string
  status: InjuryStatus
  diagnosis?: string
  mechanism?: string
  notes?: string
}

export interface Symptom extends Base {
  injuryId?: string
  type: string
  /** 0–10 */
  severity: number
  recordedAt: number
  trigger?: string
  notes?: string
  source: Source
}

export interface Measurement extends Base {
  kind: string
  value: number
  unit: string
  side?: Side
  method?: string
  injuryId?: string
  recordedAt: number
  notes?: string
  source: Source
}

export interface JournalEntry extends Base {
  text: string
  recordedAt: number
  source: Source
}

export type ExerciseMode = 'reps' | 'time'

export interface Exercise extends Base {
  name: string
  bodyRegion: string
  mode: ExerciseMode
  equipment?: string
  instructions?: string
  /** Part of the starter library (fixed id), rather than added by the user. */
  builtin?: boolean
}

/** An exercise in the user's plan, as their clinician prescribed it. */
export interface Prescription extends Base {
  exerciseId: string
  injuryId?: string
  sets: number
  /** Reps per set (mode 'reps') or seconds per set (mode 'time'). */
  target: number
  /** kg, when the exercise uses a weight. */
  load?: number
  /** Free text such as "red band". */
  loadNote?: string
  timesPerDay: number
  daysPerWeek: number
  active: boolean
  notes?: string
}

export interface SetLog {
  /** Reps or seconds, depending on the exercise mode. */
  amount: number
  load?: number
  done: boolean
}

export interface SessionItem {
  exerciseId: string
  prescriptionId?: string
  sets: SetLog[]
  painDuring?: number
}

export interface RehabSession extends Base {
  startedAt: number
  /** When the session was finished. */
  recordedAt: number
  injuryId?: string
  painBefore?: number
  painAfter?: number
  items: SessionItem[]
  notes?: string
  source: Source
}

export type DocumentKind = 'imaging' | 'lab' | 'prescription' | 'letter' | 'physio' | 'other'

/** A medical record's metadata. The file itself lives in `files` locally and, encrypted, in Google Drive. */
export interface MedicalDocument extends Base {
  title: string
  kind: DocumentKind
  /** Date on the document, YYYY-MM-DD. */
  date: string
  injuryId?: string
  notes?: string
  fileName: string
  mimeType: string
  size: number
  /** Encrypted copy in the Drive app folder, once uploaded. */
  driveFileId?: string
  /** AI summary the user asked for. Always shown as an AI estimate, never as the record itself. */
  aiSummary?: DocumentSummary
}

export interface DocumentSummary {
  readable: 'yes' | 'partly' | 'no'
  summary: string
  findings: { label: string; detail: string }[]
  questions: string[]
  model?: string
  createdAt: number
}

/**
 * Local file bytes, keyed by document id. Not part of JSON backups (too large).
 * Stored as an ArrayBuffer rather than a Blob: every engine can put those in IndexedDB.
 */
export interface StoredFile {
  id: string
  bytes: ArrayBuffer
  type: string
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

/** One food in a meal. Protein and energy are for the portion eaten. */
export interface FoodItem {
  name: string
  /** e.g. "2 eggs", "150 g". */
  amount?: string
  /** grams */
  protein: number
  /** kcal */
  calories?: number
}

/**
 * A meal as eaten. `protein`/`calories` are the totals (the sum of `items` when foods are listed).
 * An AI photo/description estimate is only saved after review, as `user_confirmed`.
 */
export interface Meal extends Base {
  name: string
  slot: MealSlot
  protein: number
  calories?: number
  items: FoodItem[]
  recordedAt: number
  notes?: string
  source: Source
}

/** A meal eaten often, logged again with one tap. */
export interface SavedMeal extends Base {
  name: string
  protein: number
  calories?: number
  items: FoodItem[]
}

export interface Meta {
  key: string
  value: unknown
}

export const db = new Dexie('reclaim') as Dexie & {
  profile: Table<Profile, string>
  injuries: Table<Injury, string>
  symptoms: Table<Symptom, string>
  measurements: Table<Measurement, string>
  journal: Table<JournalEntry, string>
  exercises: Table<Exercise, string>
  prescriptions: Table<Prescription, string>
  sessions: Table<RehabSession, string>
  documents: Table<MedicalDocument, string>
  files: Table<StoredFile, string>
  meals: Table<Meal, string>
  savedMeals: Table<SavedMeal, string>
  meta: Table<Meta, string>
}

db.version(1).stores({
  profile: 'id',
  injuries: 'id, status, updatedAt',
  symptoms: 'id, recordedAt, injuryId, updatedAt',
  measurements: 'id, recordedAt, kind, injuryId, updatedAt',
  journal: 'id, recordedAt, updatedAt',
  meta: 'key',
})

db.version(2)
  .stores({
    exercises: 'id, bodyRegion, updatedAt',
    prescriptions: 'id, exerciseId, injuryId, updatedAt',
    sessions: 'id, recordedAt, injuryId, updatedAt',
  })
  .upgrade((tx) => tx.table('exercises').bulkPut(STARTER_EXERCISES))

db.version(3).stores({
  documents: 'id, date, injuryId, updatedAt',
  files: 'id',
})

db.version(4).stores({
  meals: 'id, recordedAt, updatedAt',
  savedMeals: 'id, updatedAt',
})

db.on('populate', (tx) => {
  tx.table('exercises').bulkAdd(STARTER_EXERCISES)
})

/** Tables included in backups and future sync. */
export const DATA_TABLES = ['profile', 'injuries', 'symptoms', 'measurements', 'journal', 'exercises', 'prescriptions', 'sessions', 'documents', 'meals', 'savedMeals'] as const
export type DataTable = (typeof DATA_TABLES)[number]
