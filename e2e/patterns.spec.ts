import { expect, test } from '@playwright/test'
import { conditionFor } from '../src/lib/conditions'
import { dayKey } from '../src/lib/dates'
import { painPatterns } from '../src/lib/patterns'
import { importBackup } from './helpers'

const stamp = { createdAt: 0, updatedAt: 0 }
/** 20 days: fewer steps the day before → pain 6; more → pain 3. */
function days(pain: (lowSteps: boolean) => number, n = 20, base = new Date(2026, 7, 1, 10).getTime()) {
  const at = (i: number) => base + i * 86_400_000
  const low = (i: number) => i % 2 === 0
  return {
    pain: Array.from({ length: n }, (_, i) => ({ recordedAt: at(i + 1), severity: pain(low(i)) })),
    steps: Array.from({ length: n }, (_, i) => ({ date: dayKey(at(i)), steps: low(i) ? 2000 : 9000 })),
  }
}

test('patterns: a real difference by steps is found; no difference, or too few days, says nothing', () => {
  const d = days((low) => (low ? 6 : 3))
  const r = painPatterns({ ...d, sleep: [], sessions: [] })
  expect(r.checked).toEqual(['steps'])
  expect(r.found.map((p) => p.text)).toEqual(['Pain averages 6 the day after fewer than 9,000 steps, and 3 after more. Moving more seems to help.'])
  expect(r.found[0]).toMatchObject({ a: { days: 10 }, b: { days: 10 } })

  const flat = painPatterns({ ...days(() => 4), sleep: [], sessions: [] })
  expect(flat).toEqual({ found: [], checked: ['steps'] }) // checked, no difference

  const few = painPatterns({ ...days((low) => (low ? 6 : 3), 6), sleep: [], sessions: [] })
  expect(few).toEqual({ found: [], checked: [] }) // 3 days a side isn't enough

  const more = painPatterns({ ...days((low) => (low ? 2 : 5)), sleep: [], sessions: [] })
  expect(more.found[0].text).toBe('Pain averages 5 the day after 9,000 or more steps, and 2 after fewer — build up activity more gently.')
})

test('the “what this is” card matches the injury', () => {
  const c = (name: string, bodyRegion: string, diagnosis?: string) => conditionFor({ name, bodyRegion, diagnosis })?.id
  expect(c('L4–L5 disc bulge', 'Lower back')).toBe('disc-back')
  expect(c('Sciatica', 'Lower back')).toBe('disc-back')
  expect(c('Neck pain', 'Neck', 'C5-C6 disc protrusion')).toBe('disc-neck')
  expect(c('Tennis elbow', 'Elbow')).toBe('tendon')
  expect(c('Knee tendon micro-tear', 'Knee')).toBe('tendon')
  expect(c('Knee ligament micro-tear, grade 2', 'Knee')).toBe('ligament')
  expect(c('Left ankle sprain', 'Ankle')).toBe('ligament')
  expect(c('Lower back stiffness', 'Lower back')).toBe('back-general')
  expect(c('Mid-back disc bulge', 'Upper back')).toBeUndefined() // no card rather than the wrong one
  expect(c('Sore shoulder', 'Shoulder')).toBeUndefined()
})

test('injury page: what a disc bulge is, and a pattern from your own days', async ({ page }) => {
  const d = days((low) => (low ? 6 : 3), 20, Date.now() - 22 * 86_400_000)
  await importBackup(page, {
    app: 'reclaim', schemaVersion: 1, exportedAt: new Date().toISOString(),
    data: {
      injuries: [{ id: 'back', name: 'L4–L5 disc bulge', bodyRegion: 'Lower back', side: 'none', startDate: '2026-08-01', status: 'active', ...stamp }],
      symptoms: d.pain.map((p, i) => ({ id: `p${i}`, injuryId: 'back', type: 'pain', ...p, source: 'user', ...stamp })),
      activity: d.steps.map((s) => ({ id: `activity-${s.date}`, ...s, source: 'user', ...stamp })),
    },
  })
  await page.goto('/injuries/back')
  const card = page.getByTestId('condition-card')
  await card.getByText('What is a disc bulge in the lower back?').click()
  await expect(card).toContainText('3 in 10 pain-free 20-year-olds')
  await expect(card.getByRole('link', { name: 'Check the warning signs' })).toBeVisible()
  await expect(page.getByTestId('pattern-steps')).toContainText('the day after fewer than 9,000 steps')
})
