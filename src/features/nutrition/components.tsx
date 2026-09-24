import { Droplet, Plus, Utensils } from 'lucide-react'
import { db } from '../../db/db'
import { alive, save, softDelete } from '../../db/repo'
import { ProgressRing } from '../../components/ui'
import { startOfDay } from '../../lib/dates'
import { haptic } from '../../lib/haptics'
import { toast } from '../../lib/toast'

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

export const ml = (n: number) => `${Math.round(n).toLocaleString()} ml`

/** Water today against the goal, with one-tap glasses. */
/** Log a drink, with Undo. The running total comes from the database: quick taps land before screens re-render. */
export async function drinkWater(amount: number) {
  haptic()
  const id = await save(db.water, { amount, recordedAt: Date.now(), source: 'user' })
  const today = (await db.water.where('recordedAt').aboveOrEqual(startOfDay(Date.now())).toArray()).filter(alive).reduce((a, d) => a + d.amount, 0)
  toast(`${ml(amount)} water · ${ml(today)} today`, { label: 'Undo', onClick: () => softDelete(db.water, id) })
}

export function WaterCard({ total, target, compact }: { total: number; target?: number; compact?: boolean }) {
  return (
    <div className={`card flex items-center gap-4 ${compact ? 'p-3.5' : 'p-4'}`}>
      <ProgressRing value={total} max={target ?? 0} size={compact ? 52 : 72} stroke={compact ? 7 : 9}>
        <Droplet size={compact ? 18 : 22} className="text-tile-blue" />
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="font-rounded text-[1.375rem] leading-tight font-semibold">
          <span data-testid="water-today">{Math.round(total).toLocaleString()}</span>
          <span className="ml-1 text-[0.9375rem] font-medium text-muted">{target ? `of ${ml(target)}` : 'ml water'}</span>
        </p>
        <div className="mt-1.5 flex gap-2">
          {[250, 500].map((a) => (
            <button key={a} type="button" onClick={() => drinkWater(a)} className="chip !min-h-10 !px-3.5 !text-[0.9375rem]" aria-label={`Log ${a} ml of water`}>
              <Plus size={14} strokeWidth={2.6} /> {a} ml
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
