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
} as const

export type AiTask = keyof typeof inputs
export const AI_TASKS = Object.keys(inputs) as AiTask[]

/* ─────────── outputs (validated on both sides) ─────────── */

const text = (max: number) => z.string().max(max)
const list = (max: number, len = 400) => z.array(text(len)).max(max)

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
    readable: z.enum(['yes', 'partly', 'no']),
    summary: text(1200),
    findings: z.array(z.object({ label: text(120), detail: text(400) })).max(15),
    questions: list(8),
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
} satisfies Record<AiTask, z.ZodType>

export type AiInput<T extends AiTask> = z.infer<(typeof inputs)[T]>
export type AiOutput<T extends AiTask> = z.infer<(typeof outputs)[T]>
export type Insight = AiOutput<'weekly-summary'> | AiOutput<'ask'>

export interface AiHealth {
  configured: boolean
  model?: string
}
