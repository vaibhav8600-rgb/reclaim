import { Activity, AlertTriangle, FlaskConical, HeartPulse, Pill, ScanLine, Syringe } from 'lucide-react'
import type { FactKind } from '../../db/db'

export const FACT_KIND_INFO: Record<FactKind, { label: string; plural: string; icon: typeof Pill; color: string }> = {
  condition: { label: 'Condition', plural: 'Conditions', icon: HeartPulse, color: 'pink' },
  medication: { label: 'Medicine', plural: 'Medicines', icon: Pill, color: 'orange' },
  allergy: { label: 'Allergy', plural: 'Allergies', icon: AlertTriangle, color: 'orange' },
  lab: { label: 'Lab Result', plural: 'Lab Results', icon: FlaskConical, color: 'pink' },
  imaging: { label: 'Scan Finding', plural: 'Scans', icon: ScanLine, color: 'indigo' },
  procedure: { label: 'Procedure', plural: 'Procedures', icon: Syringe, color: 'blue' },
  vital: { label: 'Vital Sign', plural: 'Vital Signs', icon: Activity, color: 'green' },
}

/** Order on the Health Profile: what matters day to day first. */
export const FACT_ORDER: FactKind[] = ['condition', 'medication', 'allergy', 'lab', 'imaging', 'procedure', 'vital']

/** A calm marker for a result outside its range: words and colour, never colour alone. */
export function FlagPill({ flag }: { flag?: 'low' | 'high' | 'abnormal' }) {
  if (!flag) return null
  return (
    <span className="shrink-0 rounded-full bg-sev-1 px-2 py-0.5 text-[0.75rem] font-semibold text-sev-1-ink">
      {flag === 'low' ? 'Low' : flag === 'high' ? 'High' : 'Abnormal'}
    </span>
  )
}
