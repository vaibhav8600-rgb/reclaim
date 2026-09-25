/**
 * When to ask the warning-sign check (the questions are in ./warningSigns): weekly while a back or neck injury is
 * open, and again after numbness, tingling or weakness is logged.
 */

/** meta: when the last check was done. */
export const SAFETY_CHECK_AT = 'safetyCheckAt'

export const BACK_REGIONS = ['Lower back']
export const NECK_REGIONS = ['Neck', 'Upper back', 'Head']
export const LEG_REGIONS = ['Hip', 'Groin', 'Thigh', 'Knee', 'Shin & calf', 'Ankle', 'Foot']
export const JOINT_REGIONS = ['Shoulder', 'Upper arm', 'Elbow', 'Forearm', 'Wrist', 'Hand & fingers', ...LEG_REGIONS]
/** Nerve symptoms: logging one brings the check up again, whatever the injury. */
export const NERVE_SYMPTOMS = ['numbness', 'tingling', 'weakness']

/** Weekly for an open back or neck injury; again after a nerve symptom logged since the last check (last 3 days). */
export function safetyCheckDue(regions: string[], lastCheckAt: number | undefined, lastNerveAt: number | undefined, now = Date.now()) {
  const spine = regions.some((r) => BACK_REGIONS.includes(r) || NECK_REGIONS.includes(r))
  const weekly = spine && (lastCheckAt === undefined || lastCheckAt < now - 7 * 86_400_000)
  const nerve = lastNerveAt !== undefined && lastNerveAt > now - 3 * 86_400_000 && (lastCheckAt === undefined || lastNerveAt > lastCheckAt)
  return weekly ? 'weekly' : nerve ? 'nerve' : undefined
}
