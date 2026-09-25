import { BACK_REGIONS, JOINT_REGIONS, LEG_REGIONS, NECK_REGIONS } from './safety'

/**
 * Warning signs: the few symptoms that mean "see a doctor now or soon" rather than "log it and carry on".
 * Lists follow the red flags in the low back and neck pain guidelines (JOSPT 2021, 2017) and common joint-injury
 * emergencies. Each question is shown only when an open injury makes it relevant. Not a diagnosis.
 */

export type Urgency = 'now' | 'soon'
export interface WarningSign {
  id: string
  text: string
  urgency: Urgency
}
export interface SignGroup {
  title: string
  signs: WarningSign[]
}

const BACK: WarningSign[] = [
  { id: 'saddle', text: 'Numbness or tingling around your bottom, genitals or inner thighs', urgency: 'now' },
  { id: 'bladder', text: 'New trouble passing urine, leaking urine or stool, or not feeling when you need to go', urgency: 'now' },
  { id: 'leg-weakness', text: 'Weakness in a leg or foot that’s getting worse — for example, your foot catches or slaps when you walk', urgency: 'now' },
  { id: 'both-legs', text: 'Numbness, tingling or weakness in both legs', urgency: 'now' },
  { id: 'back-fever', text: 'Fever or feeling generally unwell along with the back pain', urgency: 'soon' },
  { id: 'back-night', text: 'Severe pain at night that no position eases, or weight loss you can’t explain', urgency: 'soon' },
  { id: 'back-trauma', text: 'Back pain that started after a bad fall or accident', urgency: 'now' },
]

const NECK: WarningSign[] = [
  { id: 'stroke', text: 'Sudden trouble speaking, seeing or swallowing, a drooping face, or severe dizziness', urgency: 'now' },
  { id: 'neck-trauma', text: 'Neck pain that started after a bad fall or accident', urgency: 'now' },
  { id: 'clumsy-hands', text: 'Hands getting clumsy — dropping things, trouble with buttons or writing', urgency: 'soon' },
  { id: 'unsteady', text: 'Walking feels unsteady, or your legs feel stiff or heavy', urgency: 'soon' },
  { id: 'both-arms', text: 'Numbness, tingling or weakness in both arms or hands', urgency: 'soon' },
  { id: 'shocks', text: 'Electric-shock feelings down your spine or limbs when you bend your head forward', urgency: 'soon' },
]

const JOINT: WarningSign[] = [
  { id: 'hot-joint', text: 'A joint that’s hot, red and swollen, with a fever or feeling unwell', urgency: 'now' },
  { id: 'rupture', text: 'A new pop with fast swelling, or a sudden loss of strength', urgency: 'soon' },
]

const LEG: WarningSign[] = [
  { id: 'clot', text: 'Calf pain, swelling, warmth or redness in one leg — or sudden breathlessness', urgency: 'now' },
  { id: 'no-weight', text: 'You can’t put weight on the leg, or the knee locks and won’t straighten', urgency: 'soon' },
]

/**
 * The questions for these open-injury regions. A recent nerve symptom adds the back and neck lists (nerve signs
 * usually start in the spine). With nothing relevant, everything is shown.
 */
export function signGroups(regions: string[], recentNerve = false): SignGroup[] {
  const has = (list: string[]) => regions.some((r) => list.includes(r))
  const groups: SignGroup[] = []
  if (recentNerve || has(BACK_REGIONS)) groups.push({ title: 'Lower Back', signs: BACK })
  if (recentNerve || has(NECK_REGIONS)) groups.push({ title: 'Neck', signs: NECK })
  if (has(JOINT_REGIONS)) groups.push({ title: 'Joints', signs: has(LEG_REGIONS) ? [...JOINT, ...LEG] : JOINT })
  return groups.length ? groups : signGroups([...BACK_REGIONS, ...NECK_REGIONS, 'Knee'])
}

/** The most urgent of the ticked signs, if any. */
export const urgencyOf = (ticked: WarningSign[]): Urgency | undefined =>
  ticked.some((s) => s.urgency === 'now') ? 'now' : ticked.length ? 'soon' : undefined
