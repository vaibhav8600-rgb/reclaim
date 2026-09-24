import { ChevronRight, Droplet, Footprints, Moon, Plus, Scale, Utensils } from 'lucide-react'
import type { Profile } from '../../db/db'
import { useActivity, useLatestWeight, useMeals, useSleep, useWater } from '../../db/hooks'
import { MLink } from '../../components/MLink'
import { IconTile, ProgressRing, Section } from '../../components/ui'
import { weightKg } from '../../lib/constants'
import { formatHours, lastNight, sleepHours } from '../../lib/daily'
import { dayKey, relativeAge, startOfDay } from '../../lib/dates'
import { drinkWater } from '../nutrition/components'

interface Tile {
  key: string
  label: string
  icon: typeof Droplet
  /** CSS colour of the ring. */
  color: string
  value: number
  target?: number
  shown: string
  of?: string
  to: string
  spoken: string
}

/**
 * The top of Today: "How am I doing?" in four rings (protein, water, steps, sleep), each opening where it's
 * logged, one-tap water, and the latest weight. Rings show progress, never a verdict.
 */
export function AtAGlance({ profile }: { profile?: Profile | null }) {
  const today = startOfDay(Date.now())
  const meals = useMeals(today)
  const water = useWater(today)
  const activity = useActivity(dayKey(Date.now()))
  const sleeps = useSleep(today)
  const weight = useLatestWeight()
  if (!meals || !water || !activity || !sleeps || weight === undefined) return null

  const protein = Math.round(meals.reduce((a, m) => a + m.protein, 0))
  const ml = water.reduce((a, d) => a + d.amount, 0)
  const steps = activity[0]?.steps ?? 0
  const night = lastNight(sleeps)
  const hours = night ? sleepHours(night) : 0
  const litres = (n: number) => (n < 1000 ? `${n} ml` : `${Math.round(n / 100) / 10} L`)

  const tiles: Tile[] = [
    { key: 'protein', label: 'Protein', icon: Utensils, color: 'var(--color-tile-purple)', value: protein, target: profile?.proteinTarget, shown: `${protein} g`, of: profile?.proteinTarget ? `of ${profile.proteinTarget} g` : undefined, to: '/nutrition', spoken: `Protein ${protein} grams${profile?.proteinTarget ? ` of ${profile.proteinTarget}` : ''}` },
    { key: 'water', label: 'Water', icon: Droplet, color: 'var(--color-tile-blue)', value: ml, target: profile?.waterTarget, shown: litres(ml), of: profile?.waterTarget ? `of ${litres(profile.waterTarget)}` : undefined, to: '/nutrition', spoken: `Water ${ml} millilitres${profile?.waterTarget ? ` of ${profile.waterTarget}` : ''}` },
    { key: 'steps', label: 'Steps', icon: Footprints, color: 'var(--color-tile-green)', value: steps, target: profile?.stepsTarget, shown: steps.toLocaleString(), of: profile?.stepsTarget ? `of ${profile.stepsTarget.toLocaleString()}` : undefined, to: '/log/steps', spoken: `Steps ${steps}${profile?.stepsTarget ? ` of ${profile.stepsTarget}` : ''}` },
    { key: 'sleep', label: 'Sleep', icon: Moon, color: 'var(--color-tile-indigo)', value: hours, target: profile?.sleepTarget, shown: night ? formatHours(hours) : '—', of: profile?.sleepTarget ? `of ${profile.sleepTarget} h` : undefined, to: night ? `/log/sleep?id=${night.id}` : '/log/sleep', spoken: night ? `Sleep last night ${formatHours(hours)}` : 'Sleep not logged yet' },
  ]
  const noGoals = tiles.every((t) => !t.target)
  const kg = weightKg(weight ?? undefined)
  const toGoal = kg !== undefined && profile?.weightGoal ? Math.round((kg - profile.weightGoal) * 10) / 10 : undefined

  return (
    <Section prominent title="At a Glance" action={<MLink to="/goals" className="text-accent">Goals</MLink>}>
      <div className="card p-3">
        <div className="grid grid-cols-4 gap-1">
          {tiles.map((t) => (
            <MLink key={t.key} to={t.to} className="flex flex-col items-center rounded-2xl px-0.5 py-2 text-center active:bg-fill" aria-label={t.spoken}>
              <ProgressRing value={t.value} max={t.target ?? 0} size={54} stroke={6} color={t.color}>
                <t.icon size={19} style={{ color: t.color }} />
              </ProgressRing>
              <span className="font-rounded mt-1.5 text-[0.9375rem] leading-tight font-semibold tabular-nums" data-testid={`glance-${t.key}`}>{t.shown}</span>
              <span className="text-[0.75rem] leading-tight text-muted">{t.of ?? t.label}</span>
            </MLink>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {[250, 500].map((a) => (
            <button key={a} type="button" onClick={() => drinkWater(a)} className="chip !min-h-9 !px-3 !text-[0.875rem]" aria-label={`Log ${a} ml of water`}>
              <Plus size={13} strokeWidth={2.6} /> {a} ml
            </button>
          ))}
          <MLink to="/log/meal" className="chip !min-h-9 !px-3 !text-[0.875rem]"><Plus size={13} strokeWidth={2.6} /> Meal</MLink>
        </div>
      </div>
      <MLink to="/weight" className="card cell cell-press mt-3">
        <IconTile icon={Scale} color="orange" />
        <span className="min-w-0 flex-1">
          <span className="block">{weight ? `Weight ${weight.value} ${weight.unit}` : 'Log your weight'}</span>
          <span className="block truncate text-[0.875rem] text-muted">
            {weight ? [relativeAge(weight.recordedAt), toGoal !== undefined && (Math.abs(toGoal) < 0.1 ? 'at your goal' : `${Math.abs(toGoal)} kg ${toGoal > 0 ? 'to go' : 'below goal'}`)].filter(Boolean).join(' · ') : 'See your trend and BMI'}
          </span>
        </span>
        <ChevronRight size={18} className="-mr-1 text-faint" />
      </MLink>
      {noGoals && <p className="section-footer">Set goals to fill the rings — <MLink to="/goals" className="text-accent">Goals</MLink>.</p>}
    </Section>
  )
}
