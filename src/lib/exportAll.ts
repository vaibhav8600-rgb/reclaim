import { db, type Activity, type CheckIn, type Drink, type HealthFact, type Injury, type Meal, type Measurement, type MedicalDocument, type RehabSession, type Sleep, type Symptom } from '../db/db'
import { buildBackup } from '../db/backup'
import { symptomLabel } from './constants'
import { dayKey } from './dates'
import { toleranceLabel } from './checkin'
import { reachLabel } from './reach'
import { sessionStats } from './rehab'
import { documentBlob } from './sync'
import { csv } from './csv'
import { zip, type ZipEntry } from './zip'

/**
 * Everything, to keep or to open elsewhere: spreadsheets (CSV) of each area, the record files themselves, and the
 * full backup (restorable in Reclaim). One ZIP.
 */

const stamp = (ms: number) => {
  const d = new Date(ms)
  return `${dayKey(ms)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
/** "Blood test: CBC" → "Blood test- CBC" (safe in any file system) */
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'record'
const extension = (d: MedicalDocument) => d.fileName.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? (d.mimeType === 'application/pdf' ? '.pdf' : '')

export async function buildExport(): Promise<{ file: File; skipped: string[] }> {
  const tables = await Promise.all([db.injuries, db.symptoms, db.measurements, db.meals, db.water, db.sleep, db.activity, db.sessions, db.checkins, db.facts, db.documents].map((t) => t.toArray()))
  const live = <T extends { deletedAt?: number }>(xs: T[]) => xs.filter((r) => !r.deletedAt)
  const [injuries, symptoms, measurements, meals, water, sleep, activity, sessions, checkins, facts, documents] = [
    live(tables[0] as Injury[]), live(tables[1] as Symptom[]), live(tables[2] as Measurement[]), live(tables[3] as Meal[]), live(tables[4] as Drink[]), live(tables[5] as Sleep[]),
    live(tables[6] as Activity[]), live(tables[7] as RehabSession[]), live(tables[8] as CheckIn[]), live(tables[9] as HealthFact[]), live(tables[10] as MedicalDocument[]),
  ] as const
  const exercises = await db.exercises.toArray()
  const injury = new Map(injuries.map((i) => [i.id, i]))
  const exercise = new Map(exercises.map((e) => [e.id, e.name]))
  const doc = new Map(documents.map((d) => [d.id, d.title]))
  const by = <T>(key: (x: T) => number) => (a: T, b: T) => key(a) - key(b)
  const enc = new TextEncoder()
  const entries: ZipEntry[] = []
  const add = (name: string, text: string) => entries.push({ name, data: enc.encode(text) })

  add('spreadsheets/injuries.csv', csv(['Name', 'Body region', 'Side', 'Started', 'Status', 'Diagnosis'], injuries.map((i) => [i.name, i.bodyRegion, i.side, i.startDate, i.status, i.diagnosis])))
  add('spreadsheets/symptoms.csv', csv(['When', 'Injury', 'Symptom', 'Severity (0-10)', 'Reaches', 'Trigger', 'Notes'], [...symptoms].sort(by((s) => s.recordedAt)).map((s) => {
    const inj = s.injuryId ? injury.get(s.injuryId) : undefined
    return [stamp(s.recordedAt), inj?.name, symptomLabel(s.type), s.severity, reachLabel(inj?.bodyRegion, s.reach), s.trigger, s.notes]
  })))
  add('spreadsheets/measurements.csv', csv(['When', 'Measurement', 'Value', 'Unit', 'Side', 'Injury', 'Method'], [...measurements].sort(by((m) => m.recordedAt)).map((m) => [stamp(m.recordedAt), m.kind, m.value, m.unit, m.side, m.injuryId ? injury.get(m.injuryId)?.name : undefined, m.method])))
  add('spreadsheets/meals.csv', csv(['When', 'Meal', 'Name', 'Protein (g)', 'Calories (kcal)', 'Carbs (g)', 'Fat (g)', 'Fiber (g)', 'Sugar (g)', 'Sodium (mg)', 'Foods'], [...meals].sort(by((m) => m.recordedAt)).map((m) => [stamp(m.recordedAt), m.slot, m.name, m.protein, m.calories, m.carbs, m.fat, m.fiber, m.sugar, m.sodium, m.items.map((i) => i.name).join('; ')])))
  add('spreadsheets/water.csv', csv(['When', 'Amount (ml)'], [...water].sort(by((w) => w.recordedAt)).map((w) => [stamp(w.recordedAt), w.amount])))
  add('spreadsheets/sleep.csv', csv(['Went to bed', 'Woke up', 'Hours', 'Quality (1-4)'], [...sleep].sort(by((s) => s.wakeAt)).map((s) => [stamp(s.bedAt), stamp(s.wakeAt), Math.round(((s.wakeAt - s.bedAt) / 3_600_000) * 10) / 10, s.quality])))
  add('spreadsheets/activity.csv', csv(['Date', 'Steps', 'Active minutes', 'Distance (km)', 'Source'], [...activity].sort((a, b) => a.date.localeCompare(b.date)).map((a) => [a.date, a.steps, a.activeMinutes, a.distance, a.source])))
  add('spreadsheets/sessions.csv', csv(['When', 'Type', 'Name', 'Exercises', 'Sets done', 'Weight lifted (kg)', 'Minutes', 'Pain before', 'Pain after', 'Pain next morning', 'Effort (1-10)'], [...sessions].sort(by((s) => s.recordedAt)).map((s) => {
    const { minutes, volume } = sessionStats(s)
    return [stamp(s.recordedAt), s.kind === 'workout' ? 'Workout' : 'Rehab', s.name, s.items.map((i) => exercise.get(i.exerciseId) ?? i.exerciseId).join('; '), s.items.reduce((n, i) => n + i.sets.filter((x) => x.done).length, 0), volume || undefined, minutes, s.painBefore, s.painAfter, s.morningPain, s.effort]
  })))
  add('spreadsheets/check-ins.csv', csv(['When', 'Pain', 'Enjoyment of life affected', 'Usual activities affected', 'Sitting', 'Walking', 'Nights woken', 'Activities (0-10)'], [...checkins].sort(by((c) => c.recordedAt)).map((c) => [stamp(c.recordedAt), c.pain, c.enjoyment, c.generalActivity, toleranceLabel(c.sitMinutes), toleranceLabel(c.walkMinutes), c.nightsWoken, (c.activities ?? []).map((a) => `${a.name} ${a.score}`).join('; ')])))
  add('spreadsheets/health-profile.csv', csv(['Date', 'Kind', 'Name', 'Value', 'Unit', 'Range', 'Flag', 'Detail', 'From record'], [...facts].sort((a, b) => a.date.localeCompare(b.date)).map((f) => [f.date, f.kind, f.name, f.value, f.unit, f.range, f.flag, f.detail, f.documentId ? doc.get(f.documentId) : undefined])))

  // The record files (those on this iPhone, or in Drive when signed in)
  const skipped: string[] = []
  const used = new Set<string>()
  for (const d of [...documents].sort((a, b) => a.date.localeCompare(b.date))) {
    try {
      const blob = await documentBlob(d)
      let name = `records/${d.date} ${safeName(d.title)}${extension(d)}`
      for (let n = 2; used.has(name); n++) name = `records/${d.date} ${safeName(d.title)} (${n})${extension(d)}`
      used.add(name)
      entries.push({ name, data: new Uint8Array(await blob.arrayBuffer()) })
    } catch {
      skipped.push(d.title)
    }
  }

  add('Reclaim-backup.json', JSON.stringify(await buildBackup(), null, 2))
  add(
    'README.txt',
    [
      `Reclaim export, ${stamp(Date.now())}`,
      '',
      'spreadsheets/  One CSV per area; opens in Excel, Numbers or Google Sheets.',
      'records/       Your medical records, as added.',
      'Reclaim-backup.json  Everything, restorable in Reclaim (Settings → Restore).',
      '',
      'This is private health information: keep it somewhere safe.',
      ...(skipped.length ? ['', `Not included (the file is only in Google Drive — sign in to include it): ${skipped.join('; ')}`] : []),
    ].join('\r\n'),
  )

  const bytes = zip(entries)
  return { file: new File([bytes as BlobPart], `Reclaim-export-${dayKey(Date.now())}.zip`, { type: 'application/zip' }), skipped }
}
