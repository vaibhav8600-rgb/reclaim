/**
 * The contract between the app and the /api/ai function: tasks, their inputs, and validated outputs.
 * Imported by both sides, so the browser and the server agree on shapes and limits.
 */
import { z } from 'zod'

// No eval-based fast paths: the app runs under a strict Content-Security-Policy (no 'unsafe-eval').
z.config({ jitless: true })

export const SYMPTOM_TYPES = ['pain', 'stiffness', 'swelling', 'weakness', 'numbness', 'tingling', 'burning', 'clicking', 'instability', 'fatigue', 'restricted'] as const
export const MEASUREMENT_KINDS = ['weight', 'waist', 'grip', 'rom', 'walk'] as const
export const TIME_OF_DAY = ['morning', 'afternoon', 'evening', 'night'] as const
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const
export const DOCUMENT_KIND_VALUES = ['imaging', 'lab', 'prescription', 'letter', 'physio', 'other'] as const
/** What a fact pulled from a medical record is about. */
export const FACT_KINDS = ['condition', 'medication', 'lab', 'imaging', 'procedure', 'allergy', 'vital'] as const
export const FACT_FLAGS = ['low', 'high', 'abnormal'] as const
/** Where an injury or condition is (the app's body regions). */
export const BODY_REGION_VALUES = [
  'Head', 'Neck', 'Shoulder', 'Upper arm', 'Elbow', 'Forearm', 'Wrist', 'Hand & fingers',
  'Chest', 'Upper back', 'Lower back', 'Abdomen', 'Hip', 'Groin', 'Thigh', 'Knee',
  'Shin & calf', 'Ankle', 'Foot', 'Other',
] as const
export const FACT_SIDES = ['left', 'right', 'both'] as const

/** Vercel functions accept ~4.5 MB request bodies; base64 adds a third. */
export const MAX_REQUEST_BYTES = 4_400_000
export const MAX_DOCUMENT_BYTES_FOR_AI = 3_000_000
/** Meal photos are resized to this many pixels on the long side before sending. */
export const MEAL_PHOTO_MAX_SIDE = 1280

/* ─────────── inputs ─────────── */

const context = z.record(z.string(), z.unknown())

export const inputs = {
  'structure-note': z.object({
    text: z.string().min(1).max(4000),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    injuries: z.array(z.object({ id: z.string().max(100), name: z.string().max(100), region: z.string().max(50) })).max(20),
  }),
  'summarize-document': z.object({
    title: z.string().max(200),
    kind: z.string().max(40),
    mimeType: z.enum(DOCUMENT_MIME_TYPES),
    data: z.string().max(Math.ceil((MAX_DOCUMENT_BYTES_FOR_AI * 4) / 3) + 8),
  }),
  'estimate-meal': z
    .object({
      description: z.string().max(500).optional(),
      image: z.object({ mimeType: z.literal('image/jpeg'), data: z.string().max(Math.ceil((MAX_DOCUMENT_BYTES_FOR_AI * 4) / 3) + 8) }).optional(),
    })
    .refine((i) => !!i.description?.trim() || !!i.image, 'Add a photo or a description.'),
  'weekly-summary': z.object({ context }),
  ask: z.object({ question: z.string().min(2).max(500), context }),
  'report-narrative': z.object({ context }),
  'health-summary': z.object({ context }),
  'recovery-plan': z.object({ context }),
  'meal-ideas': z.object({ context }),
} as const

export type AiTask = keyof typeof inputs
export const AI_TASKS = Object.keys(inputs) as AiTask[]

/* ─────────── outputs (validated on both sides) ─────────── */

const text = (max: number) => z.string().max(max)
const list = (max: number, len = 400) => z.array(text(len)).max(max)

/*
 * Reading a record is a long answer, and a model on the plain fallback path (no enforced schema) can slip:
 * a question wrapped as {"question": "…"}, a number as "18.0", a field too long. Those are repaired here
 * instead of losing the whole record; an item that can't be repaired is dropped, not the answer.
 */
const cut = (max: number) => (s: string) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)
/** A string, repaired: {"question": "…"} → "…", 12 → "12", too long → cut. */
const loose = (max: number) =>
  z
    .preprocess((v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.values(v).find((x) => typeof x === 'string') : typeof v === 'number' ? String(v) : v), z.string())
    .transform(cut(max))
/** A list that keeps the items that are (or can be repaired to be) valid, up to `max`. */
const keepValid = <T extends z.ZodType>(item: T, max: number) =>
  z.array(z.unknown()).transform((list) => list.flatMap((x) => {
    const r = item.safeParse(x)
    return r.success ? [r.data as z.output<T>] : []
  }).slice(0, max))

/** One fact as the AI read it from a record, with the words it came from. Saved only after review. */
export const extractedFact = z.object({
  kind: z.enum(FACT_KINDS),
  name: loose(120).refine((s) => s.trim().length > 0),
  value: z.preprocess((v) => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v), z.number().optional()).catch(undefined),
  unit: loose(40).optional().catch(undefined),
  range: loose(200).optional().catch(undefined),
  flag: z.enum(FACT_FLAGS).optional().catch(undefined),
  detail: loose(400).optional().catch(undefined),
  /** For a condition of one body part (an injury, a joint or tendon problem): where, and which side. */
  bodyRegion: z.enum(BODY_REGION_VALUES).optional().catch(undefined),
  side: z.enum(FACT_SIDES).optional().catch(undefined),
  evidence: loose(300).catch(''),
})
export type ExtractedFact = z.infer<typeof extractedFact>

export const outputs = {
  'structure-note': z.object({
    symptoms: z
      .array(
        z.object({
          type: z.enum(SYMPTOM_TYPES),
          severity: z.number().int().min(0).max(10).optional(),
          severityEstimated: z.boolean().optional(),
          injuryId: z.string().optional(),
          timeOfDay: z.enum(TIME_OF_DAY).optional(),
          trigger: text(80).optional(),
          evidence: text(300),
        }),
      )
      .max(10),
    measurements: z
      .array(
        z.object({
          kind: z.enum(MEASUREMENT_KINDS),
          value: z.number(),
          unit: text(10),
          side: z.enum(['left', 'right']).optional(),
          injuryId: z.string().optional(),
          evidence: text(300),
        }),
      )
      .max(10),
    activities: list(10, 120),
  }),
  'summarize-document': z.object({
    readable: z.enum(['yes', 'partly', 'no']).catch('partly'),
    summary: loose(1200).catch(''),
    findings: keepValid(z.object({ label: loose(120), detail: loose(400) }), 15),
    questions: keepValid(loose(400), 8),
    /** What the document itself says it is, used to file records added in bulk. */
    document: z
      .object({ title: loose(80).catch(''), kind: z.enum(DOCUMENT_KIND_VALUES).catch('other'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).catch('') })
      .catch({ title: '', kind: 'other', date: '' }),
    facts: keepValid(extractedFact, 80),
  }),
  'estimate-meal': z.object({
    isFood: z.boolean(),
    name: text(80),
    items: z
      .array(
        z.object({
          name: text(80),
          amount: text(60),
          protein: z.number().min(0).max(300),
          calories: z.number().min(0).max(5000),
          carbs: z.number().min(0).max(1000).optional().catch(undefined),
          fat: z.number().min(0).max(500).optional().catch(undefined),
          fiber: z.number().min(0).max(200).optional().catch(undefined),
        }),
      )
      .max(12),
    assumptions: list(3, 200),
  }),
  'weekly-summary': z.object({
    headline: text(160),
    dataShows: list(8),
    patterns: list(6),
    cannotEstablish: list(5),
    discuss: list(6),
  }),
  ask: z.object({
    answer: text(1200),
    dataShows: list(8),
    patterns: list(6),
    cannotEstablish: list(5),
    discuss: list(6),
  }),
  'report-narrative': z.object({
    summary: text(1500),
    keyChanges: list(8),
    questions: list(8),
  }),
  'health-summary': z.object({
    overview: text(1500),
    attention: z.array(z.object({ label: text(120), detail: text(500) })).max(15),
    trends: list(10),
    questions: list(8),
  }),
  'recovery-plan': z.object({
    summary: loose(1200).catch(''),
    focus: keepValid(loose(200), 5),
    /** Chosen only from the library it was given; the app drops unknown ids and clamps doses to the vetted ranges. */
    exercises: keepValid(
      z.object({
        exerciseId: loose(80),
        injuryId: loose(100).optional().catch(undefined),
        sets: z.coerce.number(),
        target: z.coerce.number(),
        timesPerDay: z.coerce.number(),
        daysPerWeek: z.coerce.number(),
        why: loose(300).catch(''),
      }),
      10,
    ),
    cautions: keepValid(loose(300), 6),
    questions: keepValid(loose(300), 5),
  }),
  'meal-ideas': z.object({
    ideas: keepValid(
      z.object({ name: loose(80), portion: loose(160).catch(''), calories: z.coerce.number().min(0).max(3000), protein: z.coerce.number().min(0).max(200), why: loose(200).catch('') }),
      4,
    ),
    note: loose(300).catch(''),
  }),
} satisfies Record<AiTask, z.ZodType>

export type AiInput<T extends AiTask> = z.infer<(typeof inputs)[T]>
export type AiOutput<T extends AiTask> = z.infer<(typeof outputs)[T]>
export type Insight = AiOutput<'weekly-summary'> | AiOutput<'ask'>

export interface AiHealth {
  configured: boolean
  model?: string
}
