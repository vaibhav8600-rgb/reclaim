import type { Injury } from '../db/db'
import type { GuidelineId } from './guide'

/**
 * "What this is": a short, plain explanation of common conditions — what's going on, what helps, how long it tends
 * to take. Understanding that a disc bulge is common and usually settles, or that tendons heal by being loaded,
 * reduces fear of moving, which itself helps recovery (pain education is part of the back and neck guidelines).
 * Matched from the injury's name and diagnosis, then its body region. General information, not a diagnosis.
 */

export interface Condition {
  id: string
  title: string
  what: string
  points: string[]
  /** Show the warning-signs link */
  warnings?: boolean
  refs: GuidelineId[]
}

export const WARNINGS = 'Some signs need a doctor straight away — the warning-signs check lists them.'

export const CONDITIONS: Record<string, Condition> = {
  'disc-back': {
    id: 'disc-back',
    title: 'A disc bulge in the lower back',
    what: 'The soft centre of a spinal disc pushes outwards. If it presses on or irritates a nerve, pain, tingling or numbness can run down the leg (sciatica).',
    points: [
      'Very common, often with no pain at all: scans find disc bulges in about 3 in 10 pain-free 20-year-olds and 6 in 10 pain-free 50-year-olds.',
      'Most disc-related back and leg pain improves over weeks to a few months, and bulging or herniated discs often shrink on their own.',
      'Staying active helps more than bed rest: keep walking, and build exercises up gradually. Symptoms moving back towards the spine are a good sign.',
    ],
    warnings: true,
    refs: ['discImaging', 'discRegression', 'lowBack'],
  },
  'disc-neck': {
    id: 'disc-neck',
    title: 'A disc bulge in the neck',
    what: 'A disc between the neck bones bulges outwards. If it irritates a nerve, pain, tingling or weakness can run into the shoulder, arm or hand.',
    points: [
      'Scans show disc bulges in most adults, including many with no neck pain at all — the finding alone doesn’t mean damage.',
      'Arm pain from a neck disc usually settles over weeks to months with activity and exercise; only a minority need surgery.',
      'Short, frequent breaks from looking down at screens, and neck and shoulder-blade exercises, help.',
    ],
    warnings: true,
    refs: ['neckImaging', 'neck'],
  },
  tendon: {
    id: 'tendon',
    title: 'A tendon problem',
    what: 'A tendon — the cord that joins muscle to bone — has been overloaded. Small tears or thickening make it sore when it’s used (tennis elbow is one example).',
    points: [
      'Tendons get stronger with the right load; complete rest weakens them. Exercises that load them slowly and steadily are the main treatment.',
      'Pain up to 3–5/10 during exercise is fine if it settles by the next morning — Reclaim’s morning check follows this rule.',
      'Recovery is slow but steady, often 3 to 6 months and sometimes longer; most people recover well.',
      'Steroid injections can ease pain for a few weeks but are linked to more relapses later — worth discussing before choosing one.',
    ],
    refs: ['elbow', 'painMonitoring', 'tendonInjections'],
  },
  ligament: {
    id: 'ligament',
    title: 'A ligament sprain or tear',
    what: 'A ligament — the band that holds bones together at a joint — has been overstretched (grade 1) or partly torn (grade 2).',
    points: [
      'It heals by laying down new tissue over about 6 to 12 weeks, and that tissue gets stronger with gradual, controlled use.',
      'Early gentle movement usually does better than keeping the joint still for a long time.',
      'Balance and strength exercises lower the chance of it happening again.',
      'See a physio if the joint gives way, locks, or the swelling doesn’t settle.',
    ],
    refs: ['ankle'],
  },
  'back-general': {
    id: 'back-general',
    title: 'Low back pain',
    what: 'Pain in the lower back, usually from the muscles, joints and discs being sensitive rather than from serious damage.',
    points: [
      'Most episodes improve within a few weeks, even when they’re very painful at first.',
      'Staying active and returning to normal activities gradually helps more than rest.',
      'Scan findings like disc bulges are common in people without pain, so they don’t always explain the pain.',
    ],
    warnings: true,
    refs: ['lowBack', 'discImaging'],
  },
  'neck-general': {
    id: 'neck-general',
    title: 'Neck pain',
    what: 'Pain in the neck, usually from muscles and joints being sensitive — often linked to posture, stress or long spells in one position.',
    points: [
      'Most neck pain settles within weeks to a few months.',
      'Keep the neck moving; exercise and short breaks from screens help more than a collar or rest.',
    ],
    warnings: true,
    refs: ['neck'],
  },
}

const DISC = /disc|disk|bulg|herniat|prolaps|protru|sciatic|radicul|\b[LC][1-7]\b|\b[LC][1-7]\s*[–-]|\bS1\b/i
const TENDON = /tendin|tendon|tennis elbow|golfer|epicondyl|jumper|achilles|rotator cuff/i
const LIGAMENT = /sprain|ligament|\b(ACL|MCL|LCL|PCL|ATFL)\b|micro.?tear|\btear\b|grade\s*[12]/i

/** The explanation for an injury, if one fits. */
export function conditionFor(injury: Pick<Injury, 'name' | 'diagnosis' | 'bodyRegion'>): Condition | undefined {
  const text = `${injury.name} ${injury.diagnosis ?? ''}`
  const spine = injury.bodyRegion === 'Lower back' ? 'back' : injury.bodyRegion === 'Neck' ? 'neck' : undefined
  if (spine && DISC.test(text)) return CONDITIONS[`disc-${spine}`]
  if (TENDON.test(text)) return CONDITIONS.tendon
  if (LIGAMENT.test(text)) return CONDITIONS.ligament
  if (spine) return CONDITIONS[`${spine}-general`]
  return undefined
}

