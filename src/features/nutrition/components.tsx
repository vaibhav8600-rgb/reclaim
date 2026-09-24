import { Droplet, Flame, Plus } from 'lucide-react'
import { db } from '../../db/db'
import { alive, save, softDelete } from '../../db/repo'
import { ProgressRing } from '../../components/ui'
import { startOfDay } from '../../lib/dates'
import { haptic } from '../../lib/haptics'
import { toast } from '../../lib/toast'

/** One nutrient against its goal, as a labelled bar with the numbers printed. */
function MacroBar({ label, value, goal, unit = 'g', color, testId }: { label: string; value?: number; goal?: number; unit?: string; color: string; testId?: string }) {
  // undefined: nothing logged today says how much (not the same as none eaten)
  const pct = goal && value !== undefined ? Math.min(value / goal, 1) * 100 : 0
  return (
    <div>
      <div className="flex items-baseline justify-between text-[0.875rem]">
        <span className="font-medium">{label}</span>
        <span className="text-muted tabular-nums"><span className="font-semibold text-ink" data-testid={testId}>{value === undefined ? '—' : Math.round(value)}</span>{goal ? ` / ${goal}` : ''} {unit}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-fill">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

/**
 * Today's eating against the goals: calories as a ring with what's left, then protein, carbs, fat and fiber.
 * Carbs and fat goals are a guide worked out from the calorie and protein goals. Calm: progress, never a verdict.
 */
export function DayCard({ totals, meals, goals, partial }: {
  totals: { calories: number; protein: number; carbs?: number; fat?: number; fiber?: number; sugar?: number; sodium?: number }
  meals: number
  /** Some meals today didn't record carbs, fat or fiber, so those totals are partial. */
  partial?: boolean
  goals: { calories?: number; protein?: number; carbs?: number; fat?: number; fiber?: number }
}) {
  const left = goals.calories ? goals.calories - totals.calories : undefined
  return (
    <div className="card p-4">
      <div className="flex items-center gap-4">
        <ProgressRing value={totals.calories} max={goals.calories ?? 0} size={78} stroke={9} color="var(--color-tile-orange)">
          <Flame size={24} className="text-tile-orange" />
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="font-rounded text-[1.75rem] leading-tight font-semibold">
            <span data-testid="calories-today">{Math.round(totals.calories).toLocaleString()}</span>
            <span className="ml-1 text-[1.0625rem] font-medium text-muted">{goals.calories ? `of ${goals.calories.toLocaleString()} kcal` : 'kcal'}</span>
          </p>
          <p className="text-[0.875rem] text-muted" data-testid="calories-left">
            {meals === 0 ? 'No meals logged yet' : `${meals} ${meals === 1 ? 'meal' : 'meals'}`}
            {left !== undefined && meals > 0 ? ` · ${left >= 0 ? `${Math.round(left).toLocaleString()} kcal left` : `${Math.round(-left).toLocaleString()} kcal over`}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        <MacroBar label="Protein" value={totals.protein} goal={goals.protein} color="var(--color-tile-purple)" testId="protein-today" />
        <MacroBar label="Carbs" value={totals.carbs} goal={goals.carbs} color="var(--color-tile-blue)" />
        <MacroBar label="Fat" value={totals.fat} goal={goals.fat} color="var(--color-tile-pink)" />
        <MacroBar label="Fiber" value={totals.fiber} goal={goals.fiber} color="var(--color-tile-green)" />
      </div>
      {partial && <p className="mt-3 text-[0.8125rem] text-muted">Carbs, fat and fiber count only meals logged with them (from the food list, a label or an AI estimate).</p>}
      {(totals.sugar !== undefined || totals.sodium !== undefined) && (
        <p className="mt-3 text-[0.8125rem] text-muted">
          {[totals.sugar !== undefined && `Sugar ${Math.round(totals.sugar)} g`, totals.sodium !== undefined && `Sodium ${Math.round(totals.sodium).toLocaleString()} mg`].filter(Boolean).join(' · ')} — from foods with these on record
        </p>
      )}
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
