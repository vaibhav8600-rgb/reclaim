import { Dexie, type Table } from 'dexie'
import type { ExtractedFact, FACT_FLAGS, FACT_KINDS } from '../../shared/ai'
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
  /** Daily water goal in ml. */
  waterTarget?: number
  /** Profile photo: a small square JPEG, as a data URL. */
  photo?: string
  /** cm, for BMI and suggested targets. */
  height?: number
  /** kg */
  weightGoal?: number
  stepsTarget?: number
  /** Hours of sleep a night. */
  sleepTarget?: number
  /** Daily calories (kcal). */
  calorieTarget?: number
  /** Daily fiber (g). */
  fiberTarget?: number
  /** For a suggested calorie goal (Mifflin–St Jeor): sex, year of birth, activity, and the weight plan. */
  sex?: 'male' | 'female'
  birthYear?: number
  activity?: 'sedentary' | 'light' | 'moderate' | 'active'
  weightPlan?: 'lose' | 'maintain' | 'gain'
  /** For meal ideas. */
  diet?: 'vegetarian' | 'eggetarian' | 'non-vegetarian' | 'vegan'
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
  /** For a back or neck injury: how far down the leg or arm it reaches, 0 (spine only) to 4 (foot or hand). See lib/reach. */
  reach?: number
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
  /** 0–10, asked the morning after: has the pain settled? (pain-monitoring model) */
  morningPain?: number
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
  /** Document details as the AI read them (title, kind, date). */
  document?: { title: string; kind: DocumentKind; date: string }
  /** Facts the AI found, waiting for review. Saved to `facts` only when the user confirms them. */
  facts?: ExtractedFact[]
  /** When the user reviewed `facts`. */
  reviewedAt?: number
}

export type FactKind = (typeof FACT_KINDS)[number]

/** A confirmed fact from the medical history: a diagnosis, medicine, lab result, scan finding… */
export interface HealthFact extends Base {
  kind: FactKind
  name: string
  value?: number
  unit?: string
  /** Reference range as printed on the report. */
  range?: string
  flag?: (typeof FACT_FLAGS)[number]
  detail?: string
  /** Date on the record, YYYY-MM-DD. */
  date: string
  /** The record it came from. */
  documentId?: string
  /** The printed words it was read from. */
  evidence?: string
  /** For a condition of one body part: where, and which side (lets it become an injury to track). */
  bodyRegion?: string
  side?: 'left' | 'right' | 'both'
  source: Source
}

/** A night's sleep (or a nap). */
export interface Sleep extends Base {
  bedAt: number
  wakeAt: number
  /** 1 poor · 2 fair · 3 good · 4 great */
  quality?: number
  notes?: string
  source: Source
}

/**
 * One day's activity. The id is `activity-YYYY-MM-DD`, so there's one per day and two devices logging the same
 * day merge into one record instead of two.
 */
/**
 * A weekly check-in on how pain affects everyday life, beyond the pain score: the PEG scale (pain, enjoyment,
 * general activity; Krebs 2009), how long sitting and walking are comfortable, nights woken by pain, and the
 * Patient-Specific Functional Scale (the user's own hardest activities, 0 = unable to 10 = as before; Stratford 1995).
 */
export interface CheckIn extends Base {
  recordedAt: number
  /** PEG, 0–10 each, over the past week */
  pain?: number
  enjoyment?: number
  generalActivity?: number
  /** Minutes before sitting or walking starts to hurt (bucket midpoints, see lib/checkin) */
  sitMinutes?: number
  walkMinutes?: number
  /** Nights woken by pain in the past week, 0–7 */
  nightsWoken?: number
  activities?: { name: string; score: number }[]
  source: Source
}

export interface Activity extends Base {
  /** YYYY-MM-DD */
  date: string
  steps?: number
  activeMinutes?: number
  /** km */
  distance?: number
  source: Source
}

/** A drink of water. */
export interface Drink extends Base {
  /** ml */
  amount: number
  recordedAt: number
  source: Source
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

/** Nutrients for a portion. Protein is always known; the rest when the source gives them. */
export interface Nutrients {
  /** g */
  protein: number
  /** kcal */
  calories?: number
  /** g */
  carbs?: number
  /** g */
  fat?: number
  /** g */
  fiber?: number
  /** g */
  sugar?: number
  /** mg */
  sodium?: number
}

/** One food in a meal, for the portion eaten. */
export interface FoodItem extends Nutrients {
  name: string
  /** e.g. "2 eggs", "150 g". */
  amount?: string
  /** A food from the built-in list (`db:<id>`) or My Foods (the record id). Lets "Recent" find it again. */
  foodId?: string
}

/** A food the user created (from a label, a recipe card…): nutrients for one serving. */
export interface CustomFood extends Base, Nutrients {
  name: string
  /** What one serving is, e.g. "1 bar", "1 cup". */
  serving: string
  /** Grams in one serving, if known. */
  grams?: number
}

/**
 * A meal as eaten. `protein`/`calories` are the totals (the sum of `items` when foods are listed).
 * An AI photo/description estimate is only saved after review, as `user_confirmed`.
 */
export interface Meal extends Base, Nutrients {
  name: string
  slot: MealSlot
  items: FoodItem[]
  recordedAt: number
  notes?: string
  source: Source
}

/** A meal eaten often, logged again with one tap. */
export interface SavedMeal extends Base, Nutrients {
  name: string
  items: FoodItem[]
  /** A recipe that makes several servings: its foods are for the whole batch, and one serving is logged by default. */
  servings?: number
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
  facts: Table<HealthFact, string>
  water: Table<Drink, string>
  sleep: Table<Sleep, string>
  activity: Table<Activity, string>
  foods: Table<CustomFood, string>
  checkins: Table<CheckIn, string>
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

db.version(5).stores({
  facts: 'id, kind, date, documentId, updatedAt',
  water: 'id, recordedAt, updatedAt',
})

db.version(6).stores({
  sleep: 'id, wakeAt, updatedAt',
  activity: 'id, date, updatedAt',
})

db.version(7).stores({
  foods: 'id, name, updatedAt',
})

db.version(8).stores({
  checkins: 'id, recordedAt, updatedAt',
})

db.on('populate', (tx) => {
  tx.table('exercises').bulkAdd(STARTER_EXERCISES)
})

/** Tables included in backups and future sync. */
export const DATA_TABLES = ['profile', 'injuries', 'symptoms', 'measurements', 'journal', 'exercises', 'prescriptions', 'sessions', 'documents', 'meals', 'savedMeals', 'facts', 'water', 'sleep', 'activity', 'foods', 'checkins'] as const
export type DataTable = (typeof DATA_TABLES)[number]
