import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Info, Plus, Utensils } from 'lucide-react'
import { db, type SavedMeal } from '../../db/db'
import { useInjuryMap, useMeals, useProfile, useSavedMeals, useWater } from '../../db/hooks'
import { alive, save, softDelete } from '../../db/repo'
import { ENTRY_INSET, EntryRow } from '../../components/EntryRow'
import { MLink } from '../../components/MLink'
import { GlassButton, Group, IconTile, NavBar, Section } from '../../components/ui'
import { daysAgo, startOfDay } from '../../lib/dates'
import { haptic } from '../../lib/haptics'
import { dailyProtein, grams, slotFor } from '../../lib/nutrition'
import { toast } from '../../lib/toast'
import { ml, TodayCard, WaterCard } from './components'

export function NutritionPage() {
  const profile = useProfile()
  const week = useMeals(daysAgo(6))
  const saved = useSavedMeals()
  const injuries = useInjuryMap()
  const water = useWater(startOfDay(Date.now()))
  if (!week || !saved || !water) return null

  const target = profile?.proteinTarget
  const days = dailyProtein(week, 7)
  const today = days[6]
  const todayMeals = week.filter((m) => m.recordedAt >= startOfDay(Date.now()))

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Nutrition" back="/" trailing={<GlassButton label="Log meal" to="/log/meal"><Plus size={22} strokeWidth={2.2} /></GlassButton>} />

      <Section prominent title="Today">
        <TodayCard protein={today.protein} calories={today.calories} meals={today.meals} target={target} />
      </Section>

      <Section prominent title="Water">
        <WaterCard total={water.reduce((a, d) => a + d.amount, 0)} target={profile?.waterTarget} />
      </Section>

      <Section prominent title="Last 7 Days">
        <ProteinWeek days={days} target={target} />
      </Section>

      <Section
        prominent
        title="Saved Meals"
        action={<MLink to="/log/meal?saved=" className="text-accent">Add</MLink>}
        footer={saved.length ? 'Tap a meal to log it now. Tap ⓘ to edit it.' : undefined}
      >
        {saved.length ? (
          <Group inset="3.625rem">
            {saved.map((m) => <SavedMealRow key={m.id} meal={m} />)}
          </Group>
        ) : (
          <p className="px-1 text-muted">Save meals you eat often — your usual breakfast, a protein shake — to log them with one tap.</p>
        )}
      </Section>

      <Section prominent title="Meals Today">
        {todayMeals.length ? (
          <Group inset={ENTRY_INSET}>
            {todayMeals.map((m) => <EntryRow key={m.id} entry={{ kind: 'meal', at: m.recordedAt, item: m }} injuries={injuries} />)}
          </Group>
        ) : (
          <MLink to="/log/meal" className="card cell cell-press !py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent"><Plus size={20} strokeWidth={2.4} /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">No meals logged today</span>
              <span className="block text-[0.875rem] text-muted">Type the protein, or snap a photo for an estimate.</span>
            </span>
          </MLink>
        )}
      </Section>

      <GoalSection
        field="proteinTarget"
        title="Daily Protein Goal"
        unit="g"
        target={target}
        footer={(weight, goal) => `${weight && goal ? `That’s ${Math.round((goal / weight) * 10) / 10} g per kg of your latest weight (${weight} kg). ` : ''}Your clinician or a dietitian can suggest the right goal for your recovery.`}
      />
      <GoalSection
        field="waterTarget"
        title="Daily Water Goal"
        unit="ml"
        target={profile?.waterTarget}
        footer={(weight) =>
          `A common starting point is 30–35 ml per kg of body weight${weight ? ` (${(Math.round((weight * 30) / 50) * 50).toLocaleString()}–${ml(Math.round((weight * 35) / 50) * 50)} for ${weight} kg)` : ''}, more in heat or with exercise. With heart or kidney problems, ask your clinician first — some people need to drink less.`
        }
      />
    </div>
  )
}

/**
 * Daily protein as bars (one hue), with the goal as a dashed line. Every day's number is printed under its bar,
 * so the chart never relies on bar height alone.
 */
function ProteinWeek({ days, target }: { days: ReturnType<typeof dailyProtein>; target?: number }) {
  const max = Math.max(target ?? 0, ...days.map((d) => d.protein), 1) * 1.1
  const logged = days.filter((d) => d.meals > 0)
  const summary = logged.length
    ? `Protein per day over the last 7 days: ${days.map((d) => `${new Date(d.at).toLocaleDateString(undefined, { weekday: 'long' })} ${d.meals ? `${d.protein} grams` : 'nothing logged'}`).join(', ')}.`
    : 'No meals logged in the last 7 days.'
  const H = 120
  return (
    <div className="card p-4">
      <div className="relative" style={{ height: H }} role="img" aria-label={summary}>
        {target && (
          <div className="absolute inset-x-0 border-t-2 border-dashed border-faint/60" style={{ bottom: (target / max) * H }}>
            <span className="absolute -top-5 right-0 text-[0.75rem] text-muted">Goal {target} g</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {days.map((d, i) => (
            <div key={d.key} className="flex h-full flex-1 items-end justify-center">
              {d.meals > 0 && (
                <div
                  className="animate-bar w-[60%] max-w-7 rounded-t-[4px] bg-accent"
                  style={{ height: Math.max(2, (d.protein / max) * H), animationDelay: `${i * 40}ms` }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex gap-[2px] border-t border-line pt-1.5 text-center" aria-hidden>
        {days.map((d, i) => (
          <div key={d.key} className="flex-1">
            <p className="text-[0.75rem] text-muted">{i === 6 ? 'Today' : new Date(d.at).toLocaleDateString(undefined, { weekday: 'narrow' })}</p>
            <p className="font-rounded text-[0.8125rem] font-semibold tabular-nums" data-testid="protein-day">{d.meals ? d.protein : '—'}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[0.8125rem] text-faint">
        {logged.length ? `Average ${Math.round(logged.reduce((a, d) => a + d.protein, 0) / logged.length)} g on the ${logged.length} ${logged.length === 1 ? 'day' : 'days'} you logged.` : 'Grams of protein per day.'}
      </p>
    </div>
  )
}

function SavedMealRow({ meal }: { meal: SavedMeal }) {
  async function log() {
    haptic()
    const now = Date.now()
    const id = await save(db.meals, { name: meal.name, slot: slotFor(now), protein: meal.protein, calories: meal.calories, items: meal.items, recordedAt: now, source: 'user' })
    await save(db.savedMeals, { ...meal }) // most recently used first
    toast(`${meal.name} · ${grams(meal.protein)} protein logged`, { label: 'Undo', onClick: () => softDelete(db.meals, id) })
  }
  return (
    <div className="flex items-center">
      <button type="button" onClick={log} className="cell cell-press min-w-0 flex-1 text-left" aria-label={`Log ${meal.name}`}>
        <IconTile icon={Utensils} color="purple" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{meal.name}</span>
          <span className="block truncate text-[0.875rem] text-muted">
            {grams(meal.protein)} protein{meal.calories !== undefined ? ` · ${Math.round(meal.calories)} kcal` : ''}
          </span>
        </span>
      </button>
      <MLink to={`/log/meal?saved=${meal.id}`} className="flex h-11 w-11 shrink-0 items-center justify-center text-accent" aria-label={`Edit ${meal.name}`}>
        <Info size={22} />
      </MLink>
    </div>
  )
}

/** A daily goal (protein or water), explained against the latest logged body weight when there is one. */
function GoalSection({ field, title, unit, target, footer }: {
  field: 'proteinTarget' | 'waterTarget'
  title: string
  unit: string
  target?: number
  footer: (weightKg: number | undefined, goal: number | undefined) => string
}) {
  const [value, setValue] = useState<string>()
  const weight = useLiveQuery(async () => (await db.measurements.where('kind').equals('weight').toArray()).filter(alive).sort((a, b) => b.recordedAt - a.recordedAt)[0], [])
  const shown = value ?? (target ? String(target) : '')
  const typed = parseFloat(shown)
  const kg = weight?.unit === 'kg' ? weight.value : undefined
  const name = title.replace('Daily ', '').toLowerCase()

  async function commit() {
    if (value === undefined) return
    const next = parseFloat(value)
    const goal = Number.isFinite(next) && next > 0 ? Math.round(next) : undefined
    setValue(undefined)
    if (goal === target) return
    const profile = await db.profile.get('me')
    await save(db.profile, { id: 'me', name: profile?.name ?? '', [field]: goal })
    toast(goal ? `Daily ${name}: ${goal.toLocaleString()} ${unit}` : `${name[0].toUpperCase()}${name.slice(1)} removed`, target ? { label: 'Undo', onClick: () => save(db.profile, { id: 'me', name: profile?.name ?? '', [field]: target }) } : undefined)
  }

  return (
    <Section title={title} footer={footer(kg, typed > 0 ? typed : undefined)}>
      <Group>
        <label className="cell">
          <span className="flex-1">Goal</span>
          <input
            className="font-rounded w-20 bg-transparent text-right font-semibold outline-none placeholder:text-faint"
            inputMode="numeric"
            value={shown}
            onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
            placeholder="None"
            aria-label={`${title} (${unit})`}
          />
          <span className="text-muted">{unit}</span>
        </label>
      </Group>
    </Section>
  )
}
