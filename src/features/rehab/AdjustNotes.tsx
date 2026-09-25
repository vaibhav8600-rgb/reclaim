import { OctagonAlert, TriangleAlert } from 'lucide-react'
import type { Injury } from '../../db/db'
import { cautionsFor } from '../../lib/fitness'

/**
 * How this exercise sits with the user's open injuries: "ask your physio first" (heavy spinal loading with a disc
 * problem, weight overhead with a sore neck…) and how to adjust it (kneeling on a sore knee, gripping with a sore elbow…).
 */
export function AdjustNotes({ exerciseId, injuries, className = '' }: { exerciseId: string; injuries: Injury[]; className?: string }) {
  const notes = cautionsFor(exerciseId, injuries)
  if (!notes.length) return null
  const avoid = notes.filter((n) => n.level === 'avoid')
  const adjust = notes.filter((n) => n.level === 'adjust')
  return (
    <div className={`space-y-2 rounded-xl bg-fill p-3 ${className}`} data-testid="adjust-notes">
      {avoid.length > 0 && (
        <div data-testid="avoid-notes">
          <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-danger"><OctagonAlert size={15} /> Ask your physio first</p>
          <ul className="mt-1.5 space-y-1.5 text-[0.875rem]">{avoid.map((n) => <li key={n.region}><span className="font-semibold">{n.injury.name}: </span>{n.note}</li>)}</ul>
        </div>
      )}
      {adjust.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-muted"><TriangleAlert size={15} className="text-tile-orange" /> Adjust for your injuries</p>
          <ul className="mt-1.5 space-y-1.5 text-[0.875rem]">{adjust.map((n) => <li key={n.region}><span className="font-semibold">{n.injury.name}: </span>{n.note}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
