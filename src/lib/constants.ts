import type { InjuryStatus, Side } from '../db/db'

export const BODY_REGIONS = [
  'Head', 'Neck', 'Shoulder', 'Upper arm', 'Elbow', 'Forearm', 'Wrist', 'Hand & fingers',
  'Chest', 'Upper back', 'Lower back', 'Abdomen', 'Hip', 'Groin', 'Thigh', 'Knee',
  'Shin & calf', 'Ankle', 'Foot', 'Other',
]

export const SIDES: { value: Side; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'both', label: 'Both' },
  { value: 'none', label: 'N/A' },
]

export const INJURY_STATUSES: { value: InjuryStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'improving', label: 'Improving' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'recurring', label: 'Recurring' },
  { value: 'resolved', label: 'Resolved' },
]

export const SYMPTOM_TYPES = [
  { value: 'pain', label: 'Pain' },
  { value: 'stiffness', label: 'Stiffness' },
  { value: 'swelling', label: 'Swelling' },
  { value: 'weakness', label: 'Weakness' },
  { value: 'numbness', label: 'Numbness' },
  { value: 'tingling', label: 'Tingling' },
  { value: 'burning', label: 'Burning' },
  { value: 'clicking', label: 'Clicking' },
  { value: 'instability', label: 'Instability' },
  { value: 'fatigue', label: 'Fatigue' },
  { value: 'restricted', label: 'Restricted movement' },
]

export const TRIGGER_SUGGESTIONS = [
  'After work', 'Desk work', 'After exercise', 'Walking', 'Lifting', 'Morning', 'Night', 'Weather',
]

export interface MeasurementKind {
  value: string
  label: string
  unit: string
  /** Measured per side (grip, ROM). */
  sided?: boolean
  /** Recovery measurements are usually tied to an injury. */
  recovery?: boolean
  step: string
}

export const MEASUREMENT_KINDS: MeasurementKind[] = [
  { value: 'weight', label: 'Weight', unit: 'kg', step: '0.1' },
  { value: 'waist', label: 'Waist', unit: 'cm', step: '0.5' },
  { value: 'grip', label: 'Grip strength', unit: 'kg', sided: true, recovery: true, step: '0.5' },
  { value: 'rom', label: 'Range of motion', unit: '°', sided: true, recovery: true, step: '1' },
  { value: 'walk', label: 'Walk duration', unit: 'min', recovery: true, step: '1' },
  { value: 'other', label: 'Other', unit: '', recovery: true, step: 'any' },
]

export const kindInfo = (kind: string) =>
  MEASUREMENT_KINDS.find((k) => k.value === kind) ?? MEASUREMENT_KINDS[MEASUREMENT_KINDS.length - 1]

export const symptomLabel = (type: string) => SYMPTOM_TYPES.find((s) => s.value === type)?.label ?? type
export const statusLabel = (s: InjuryStatus) => INJURY_STATUSES.find((x) => x.value === s)?.label ?? s
export const sideLabel = (s?: Side) => (s && s !== 'none' ? SIDES.find((x) => x.value === s)?.label : undefined)

export function severityWord(n: number) {
  if (n === 0) return 'None'
  if (n <= 3) return 'Mild'
  if (n <= 6) return 'Moderate'
  if (n <= 9) return 'Severe'
  return 'Worst imaginable'
}

/** Bucket for the sequential severity colour tokens (--color-sev-N). */
export const severityBucket = (n: number) => (n === 0 ? 0 : n <= 3 ? 1 : n <= 6 ? 2 : 3)

export function injuryPlace(i: { bodyRegion: string; side: Side }) {
  const side = sideLabel(i.side)
  return side ? `${side} ${i.bodyRegion.toLowerCase()}` : i.bodyRegion
}
