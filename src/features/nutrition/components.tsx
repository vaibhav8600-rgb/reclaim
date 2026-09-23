import { Utensils } from 'lucide-react'
import { ProgressRing } from '../../components/ui'

/** Protein today against the goal. Calm: progress, never a verdict. */
export function TodayCard({ protein, calories, meals, target, compact }: { protein: number; calories: number; meals: number; target?: number; compact?: boolean }) {
  return (
    <div className={`card flex items-center gap-4 ${compact ? 'p-3.5' : 'p-4'}`}>
      <ProgressRing value={protein} max={target ?? 0} size={compact ? 52 : 72} stroke={compact ? 7 : 9}>
        <Utensils size={compact ? 18 : 22} className="text-accent" />
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="font-rounded text-[1.75rem] leading-tight font-semibold">
          <span data-testid="protein-today">{Math.round(protein)}</span>
          <span className="ml-1 text-[1.0625rem] font-medium text-muted">{target ? `of ${target} g protein` : 'g protein'}</span>
        </p>
        <p className="text-[0.875rem] text-muted">
          {meals === 0 ? 'No meals logged yet' : `${meals} ${meals === 1 ? 'meal' : 'meals'}${calories ? ` · ${Math.round(calories)} kcal` : ''}`}
          {target && protein < target && meals > 0 ? ` · ${Math.round(target - protein)} g to go` : ''}
        </p>
      </div>
    </div>
  )
}
