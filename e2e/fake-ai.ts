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
export async function mockAi(page: Page, opts: { configured?: boolean; fail?: { status: number; error: string }; stream?: boolean } = {}) {
  const requests: AiRequest[] = []
  await page.route('**/api/ai', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') return route.fulfill({ json: { configured: opts.configured ?? true, model: 'gemini-test' } })
    const body = req.postDataJSON() as { task: AiTask; input: Record<string, unknown>; stream?: boolean }
    requests.push({ ...body, authorization: req.headers()['authorization'] })
    if (opts.fail) return route.fulfill({ status: opts.fail.status, json: { error: opts.fail.error } })
    if (opts.stream && body.stream) {
      const text = JSON.stringify(ANSWERS[body.task])
      const pieces = [text.slice(0, 20), text.slice(20, 60), text.slice(60)]
      const events = [...pieces.map((d) => ({ t: 'text', d })), { t: 'done', result: ANSWERS[body.task], model: 'gemini-test' }]
      return route.fulfill({ contentType: 'application/x-ndjson', body: events.map((e) => JSON.stringify(e)).join('\n') + '\n' })
    }
    return route.fulfill({ json: { result: ANSWERS[body.task], model: 'gemini-test' } })
  })
  return requests
}
