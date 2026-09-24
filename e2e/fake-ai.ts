import type { Page } from '@playwright/test'
import type { AiOutput, AiTask } from '../shared/ai'

/** Canned answers for each AI task, in the exact contract shape. */
export const ANSWERS: { [T in AiTask]: AiOutput<T> } = {
  'weekly-summary': {
    headline: 'Your elbow pain eased this week, and you kept up most of your rehab.',
    dataShows: ['Average pain 2.4 this week vs 3.1 the week before.', 'You completed 12 of 52 planned exercises.'],
    patterns: ['On 4 of 5 weekdays, evening pain was higher than morning pain.'],
    cannotEstablish: ['Whether desk work causes the evening increase — other factors weren’t logged.'],
    discuss: ['Is it time to increase the eccentric load?'],
  },
  ask: {
    answer: 'Evening pain after workdays was higher: 3.6 on average vs 2.1 on weekends.',
    dataShows: ['12 evening logs after work averaged 3.6.'],
    patterns: ['Higher evening pain on workdays.'],
    cannotEstablish: ['Cause — posture and hours weren’t logged.'],
    discuss: ['Ergonomic changes at work.'],
  },
  'structure-note': {
    symptoms: [
      { type: 'pain', severity: 4, severityEstimated: true, injuryId: 'inj-0', timeOfDay: 'evening', trigger: 'Desk work', evidence: 'sore after 8 hours at the laptop' },
      { type: 'stiffness', timeOfDay: 'morning', evidence: 'a bit stiff when I woke up' },
    ],
    measurements: [{ kind: 'grip', value: 28, unit: 'kg', side: 'right', injuryId: 'inj-0', evidence: 'grip was 28 kg' }],
    activities: ['8 hours desk work', '30 min walk'],
  },
  'summarize-document': {
    readable: 'yes',
    summary: 'The report states there is thickening of the common extensor tendon with no tear.',
    findings: [{ label: 'Common extensor tendinopathy', detail: 'The tendon on the outside of the elbow is thickened (irritated), without a tear.' }],
    questions: ['Does this change my rehab plan?'],
    document: { title: 'Blood test: vitamin D and CBC', kind: 'lab', date: '2026-09-01' },
    facts: [
      // No flag from the AI: "Low" must be worked out from the printed range.
      { kind: 'lab', name: 'Vitamin D (25-OH)', value: 18, unit: 'ng/mL', range: '30 - 100', evidence: '25-OH Vitamin D  18.0  ng/mL  30 - 100' },
      { kind: 'lab', name: 'Haemoglobin', value: 14.2, unit: 'g/dL', range: '13.0-17.0', evidence: 'Haemoglobin 14.2 g/dL 13.0-17.0' },
      // A range too complex to trust: the report's own flag is kept.
      { kind: 'lab', name: 'Vitamin B12', value: 190, unit: 'pg/mL', range: 'Deficient < 200, Normal 200 - 900', flag: 'low', evidence: 'Vitamin B12 190 pg/mL L' },
      { kind: 'lab', name: 'Urine pus cells', detail: 'Occasional', evidence: 'Pus cells: Occasional /hpf' },
      { kind: 'condition', name: 'Lateral epicondylitis', detail: 'Right side', bodyRegion: 'Elbow', side: 'right', evidence: 'Impression: right lateral epicondylitis' },
      { kind: 'medication', name: 'Cholecalciferol 60,000 IU', detail: 'Once a week for 8 weeks', evidence: 'Tab. Cholecalciferol 60K IU weekly x 8 wks' },
    ],
  },
  'estimate-meal': {
    isFood: true,
    name: 'Chicken rice bowl',
    items: [
      { name: 'Grilled chicken', amount: 'about 150 g', protein: 46, calories: 250 },
      { name: 'White rice', amount: '1 cup cooked', protein: 4, calories: 210 },
      { name: 'Broccoli', amount: '1 cup', protein: 3, calories: 30 },
    ],
    assumptions: ['Chicken portion judged from a standard dinner plate.'],
  },
  'recovery-plan': {
    summary: 'Your tennis elbow has settled to around 2–3/10, so the plan keeps loading the tendon and adds forearm rotation. Your lower back stays on gentle mobility with some hip strength. This is a draft for your physio to check.',
    focus: ['Keep elbow pain at or below 3/10 during exercises.', 'Build forearm strength for typing and badminton.'],
    exercises: [
      { exerciseId: 'ex-wrist-ext-ecc', injuryId: 'demo-injury-elbow', sets: 3, target: 15, timesPerDay: 1, daysPerWeek: 7, why: 'Your pain has eased, so slow lowering keeps building the tendon.' },
      // Over the vetted range (sets 2–3): the app must cap it.
      { exerciseId: 'ex-pro-sup', injuryId: 'demo-injury-elbow', sets: 10, target: 12, timesPerDay: 1, daysPerWeek: 6, why: 'Rotation strength helps with gripping a racket.' },
      { exerciseId: 'ex-glute-bridge', injuryId: 'demo-injury-back', sets: 2, target: 12, timesPerDay: 1, daysPerWeek: 4, why: 'Hip strength supports your lower back.' },
      // Not in the library, and for a resolved injury: both must be dropped.
      { exerciseId: 'ex-made-up', sets: 3, target: 10, timesPerDay: 1, daysPerWeek: 5, why: 'Invented.' },
      { exerciseId: 'ex-calf-raise', injuryId: 'demo-injury-ankle', sets: 3, target: 15, timesPerDay: 1, daysPerWeek: 5, why: 'Old ankle sprain.' },
    ],
    cautions: ['Your records show vitamin D was low in July (16 ng/mL); ask whether it affects your recovery.'],
    questions: ['When can I return to badminton?'],
  },
  'health-summary': {
    overview: 'Your records cover two blood tests (30 Jul and 18 Sept 2026) and an MRI of the right elbow. They record lateral epicondylitis and a weekly vitamin D supplement.',
    attention: [{ label: 'Vitamin D (25-OH)', detail: '16 ng/mL on 30 Jul (range 30 - 100), below the range. It measures the vitamin D stored in your body.' }],
    trends: ['Vitamin D rose from 16 ng/mL on 30 Jul to 34 ng/mL on 18 Sept, now within the printed range.'],
    questions: ['Should I keep taking the vitamin D supplement now that my level is in range?'],
  },
  'report-narrative': {
    summary: 'Over the last 30 days the patient logged elbow pain on most days, averaging 2.9, with a gradual decrease.',
    keyChanges: ['Eccentric load increased from 2 kg to 3 kg.'],
    questions: ['When can I return to badminton?'],
  },
}

export interface AiRequest {
  task: AiTask
  input: Record<string, unknown>
  authorization?: string
}

/**
 * Intercepts /api/ai in the browser. Returns the canned answer for each task, or a forced error.
 * Returns the list of requests the app made, for assertions.
 * With `stream`, answers are sent the way the real server streams them (events carrying pieces of text).
 */
export async function mockAi(page: Page, opts: { configured?: boolean; fail?: { status: number; error: string }; stream?: boolean; answer?: (task: AiTask, n: number) => unknown } = {}) {
  const requests: AiRequest[] = []
  await page.route('**/api/ai', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') return route.fulfill({ json: { configured: opts.configured ?? true, model: 'gemini-test' } })
    const body = req.postDataJSON() as { task: AiTask; input: Record<string, unknown>; stream?: boolean }
    requests.push({ ...body, authorization: req.headers()['authorization'] })
    if (opts.fail) return route.fulfill({ status: opts.fail.status, json: { error: opts.fail.error } })
    const answer = opts.answer?.(body.task, requests.filter((r) => r.task === body.task).length - 1) ?? ANSWERS[body.task]
    if (opts.stream && body.stream) {
      const text = JSON.stringify(answer)
      const pieces = [text.slice(0, 20), text.slice(20, 60), text.slice(60)]
      const events = [...pieces.map((d) => ({ t: 'text', d })), { t: 'done', result: answer, model: 'gemini-test' }]
      return route.fulfill({ contentType: 'application/x-ndjson', body: events.map((e) => JSON.stringify(e)).join('\n') + '\n' })
    }
    return route.fulfill({ json: { result: answer, model: 'gemini-test' } })
  })
  return requests
}
