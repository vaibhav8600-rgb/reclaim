import { TriangleAlert } from 'lucide-react'
import type { Injury } from '../../db/db'
import { adjustments } from '../../lib/plan'

/** How to adjust this exercise for the user's other open injuries (kneeling on a sore knee, gripping with a sore elbow…). */
export function AdjustNotes({ exerciseId, injuries, className = '' }: { exerciseId: string; injuries: Injury[]; className?: string }) {
  const notes = adjustments(exerciseId, injuries)
  if (!notes.length) return null
  return (
    <div className={`rounded-xl bg-fill p-3 ${className}`} data-testid="adjust-notes">
      <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-muted"><TriangleAlert size={15} className="text-tile-orange" /> Adjust for your other injuries</p>
      <ul className="mt-1.5 space-y-1.5 text-[0.875rem]">
        {notes.map((n) => <li key={n.region}><span className="font-semibold">{n.injury.name}: </span>{n.note}</li>)}
      </ul>
    </div>
  )
}
