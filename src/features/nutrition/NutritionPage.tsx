import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Apple, Info, Plus, Sparkles, Target, Utensils } from 'lucide-react'
import type { AiOutput } from '../../../shared/ai'
import { db, type SavedMeal } from '../../db/db'
import { useFacts, useInjuryMap, useMeals, useProfile, useSavedMeals, useWater } from '../../db/hooks'
import { alive, save, setMeta, softDelete } from '../../db/repo'
import { AiAction } from '../../components/ai'
import { ENTRY_INSET, EntryRow } from '../../components/EntryRow'
import { MLink } from '../../components/MLink'
import { GlassButton, Group, IconTile, NavBar, Row, Section, Segmented } from '../../components/ui'
import { runAi } from '../../lib/ai'
import { dayKey, daysAgo, relativeAge, startOfDay } from '../../lib/dates'
import { haptic } from '../../lib/haptics'
import { dailyTotals, grams, macroGuide, nutrientLine, scale, slotFor, slotLabel, totals } from '../../lib/nutrition'
import { toast } from '../../lib/toast'
import { DayCard, WaterCard } from './components'

export function NutritionPage() {
  const profile = useProfile()
  const week = useMeals(daysAgo(6))
  const saved = useSavedMeals()
  const injuries = useInjuryMap()
  const water = useWater(daysAgo(6))
  const foods = useLiveQuery(async () => (await db.foods.toArray()).filter(alive).sort((a, b) => a.name.localeCompare(b.name)), [])
  if (!week || !saved || !water || !foods || profile === undefined) return null

  const days = dailyTotals(week, 7)
  const todayMeals = week.filter((m) => m.recordedAt >= startOfDay(Date.now()))
  const today = totals(todayMeals)
  const guide = macroGuide(profile?.calorieTarget, profile?.proteinTarget)
  const goals = { calories: profile?.calorieTarget, protein: profile?.proteinTarget, carbs: guide?.carbs, fat: guide?.fat, fiber: profile?.fiberTarget }
  const todayWater = water.filter((d) => d.recordedAt >= startOfDay(Date.now())).reduce((a, d) => a + d.amount, 0)

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Nutrition" back="/" trailing={<GlassButton label="Log meal" to="/log/meal"><Plus size={22} strokeWidth={2.2} /></GlassButton>} />

      <Section prominent title="Today" footer={guide ? 'Carbs and fat goals are a guide worked out from your calorie and protein goals.' : undefined}>
        <DayCard
          totals={{ calories: today.calories ?? 0, protein: today.protein, carbs: today.carbs, fat: today.fat, fiber: today.fiber, sugar: today.sugar, sodium: today.sodium }}
          meals={todayMeals.length}
          partial={today.carbs !== undefined && todayMeals.some((m) => m.carbs === undefined)}
          goals={goals}
        />
        <MLink to="/log/meal" className="btn btn-primary mt-3 w-full"><Plus size={19} /> Log a Meal</MLink>
      </Section>

      <MealIdeas left={{ calories: goals.calories && goals.calories - (today.calories ?? 0), protein: goals.protein && goals.protein - today.protein }} />

      <Section prominent title="Water">
        <WaterCard total={todayWater} target={profile?.waterTarget} />
      </Section>

      <Week days={days} goals={goals} waterDays={new Set(Object.entries(Object.groupBy(water, (d) => dayKey(d.recordedAt))).filter(([, ds]) => profile?.waterTarget && ds!.reduce((a, d) => a + d.amount, 0) >= profile.waterTarget).map(([k]) => k))} waterGoal={profile?.waterTarget} />

      <Section
        prominent
        title="Saved Meals & Recipes"
        action={<MLink to="/log/meal?saved=" className="text-accent">Add</MLink>}
        footer={saved.length ? 'Tap one to log it now (a recipe logs one serving). Tap ⓘ to edit.' : undefined}
      >
        {saved.length ? (
          <Group inset="3.625rem">
            {saved.map((m) => <SavedMealRow key={m.id} meal={m} />)}
          </Group>
        ) : (
          <p className="px-1 text-muted">Save meals you eat often — your usual breakfast, a protein shake — or a recipe that makes several servings, to log them with one tap.</p>
        )}
      </Section>

      <Section prominent title="My Foods" action={<MLink to="/nutrition/foods/new" className="text-accent">Add</MLink>} footer={foods.length ? undefined : 'Add packaged foods from their nutrition label, so they’re one search away.'}>
        {foods.length > 0 && (
          <Group inset="3.625rem">
            {foods.map((f) => <Row key={f.id} icon={<IconTile icon={Apple} color="green" />} title={f.name} subtitle={`${f.serving} · ${nutrientLine(f)}`} to={`/nutrition/foods/${f.id}`} />)}
          </Group>
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
              <span className="block text-[0.875rem] text-muted">Search a food, snap a photo, or type the protein.</span>
            </span>
          </MLink>
        )}
      </Section>

      <Section footer="Your clinician or a dietitian can help set the right goals for your recovery.">
        <Group inset="3.625rem">
          <Row icon={<IconTile icon={Target} color="orange" />} title="Goals" subtitle="Calories, protein, fiber and water" to="/goals" />
        </Group>
      </Section>
    </div>
  )
}

type Days = ReturnType<typeof dailyTotals>

/** The last 7 days as bars (calories or protein, one hue, goal as a dashed line), and the week in numbers. */
function Week({ days, goals, waterDays, waterGoal }: { days: Days; goals: { calories?: number; protein?: number }; waterDays: Set<string>; waterGoal?: number }) {
  const [metric, setMetric] = useState<'calories' | 'protein'>('protein')
  const target = goals[metric]
  const logged = days.filter((d) => d.meals > 0)
  const unit = metric === 'calories' ? ' kcal' : ' g'
  const max = Math.max(target ?? 0, ...days.map((d) => d[metric]), 1) * 1.1
  const avg = (k: 'calories' | 'protein') => (logged.length ? Math.round(logged.reduce((a, d) => a + d[k], 0) / logged.length) : undefined)
  const hit = goals.protein ? logged.filter((d) => d.protein >= goals.protein!).length : undefined
  const H = 120
  const summary = logged.length
    ? `${metric === 'calories' ? 'Calories' : 'Protein'} per day over the last 7 days: ${days.map((d) => `${new Date(d.at).toLocaleDateString(undefined, { weekday: 'long' })} ${d.meals ? `${d[metric]}${unit}` : 'nothing logged'}`).join(', ')}.`
    : 'No meals logged in the last 7 days.'
  return (
    <Section prominent title="Last 7 Days">
      <Segmented options={[{ value: 'protein' as const, label: 'Protein' }, { value: 'calories' as const, label: 'Calories' }]} value={metric} onChange={setMetric} />
      <div className="card mt-3 p-4">
        <div className="relative" style={{ height: H }} role="img" aria-label={summary}>
          {target && (
            <div className="absolute inset-x-0 border-t-2 border-dashed border-faint/60" style={{ bottom: (target / max) * H }}>
              <span className="absolute -top-5 right-0 text-[0.75rem] text-muted">Goal {target.toLocaleString()}{unit}</span>
            </div>
          )}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {days.map((d, i) => (
              <div key={d.key} className="flex h-full flex-1 items-end justify-center">
                {d.meals > 0 && <div className="animate-bar w-[60%] max-w-7 rounded-t-[4px] bg-accent" style={{ height: Math.max(2, (d[metric] / max) * H), animationDelay: `${i * 40}ms` }} />}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex gap-[2px] border-t border-line pt-1.5 text-center" aria-hidden>
          {days.map((d, i) => (
            <div key={d.key} className="flex-1">
              <p className="text-[0.75rem] text-muted">{i === 6 ? 'Today' : new Date(d.at).toLocaleDateString(undefined, { weekday: 'narrow' })}</p>
              <p className="font-rounded text-[0.8125rem] font-semibold tabular-nums" data-testid={`${metric}-day`}>{d.meals ? d[metric].toLocaleString() : '—'}</p>
            </div>
          ))}
        </div>
      </div>
      <Group className="mt-3">
        <Row title="Average Calories" value={avg('calories') !== undefined ? `${avg('calories')!.toLocaleString()} kcal` : '—'} />
        <Row title="Average Protein" value={avg('protein') !== undefined ? `${avg('protein')} g` : '—'} />
        {hit !== undefined && <Row title="Protein Goal Reached" value={`${hit} of ${logged.length} ${logged.length === 1 ? 'day' : 'days'}`} />}
        {waterGoal && <Row title="Water Goal Reached" value={`${waterDays.size} of 7 days`} />}
      </Group>
      <p className="section-footer">Averages are over the days you logged meals.</p>
    </Section>
  )
}

interface StoredIdeas {
  result: AiOutput<'meal-ideas'>
  at: number
}

/** AI ideas for the next meal that fit what's left of today's goals, using the foods you usually eat. */
function MealIdeas({ left }: { left: { calories?: number; protein?: number } }) {
  const stored = useLiveQuery(async () => (await db.meta.get('mealIdeas'))?.value as StoredIdeas | undefined, [])
  const [writing, setWriting] = useState<Partial<AiOutput<'meal-ideas'>>>()
  const facts = useFacts()
  const profile = useProfile()
  const fresh = stored && stored.at >= startOfDay(Date.now()) ? stored : undefined
  const shown = writing ?? fresh?.result

  async function run() {
    const since = daysAgo(13)
    const recent = (await db.meals.where('recordedAt').aboveOrEqual(since).toArray()).filter(alive)
    const counts = new Map<string, number>()
    for (const m of recent) for (const name of m.items.length ? m.items.map((i) => i.name) : [m.name]) counts.set(name, (counts.get(name) ?? 0) + 1)
    const context = {
      slot: slotLabel(slotFor(Date.now())),
      remaining: { calories: left.calories, proteinGrams: left.protein },
      diet: profile?.diet,
      usualFoods: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n]) => n),
      conditions: (facts ?? []).filter((f) => f.kind === 'condition' || (f.kind === 'lab' && f.flag)).slice(0, 15).map((f) => (f.kind === 'lab' ? `${f.name} (${f.flag})` : f.name)),
    }
    try {
      const result = await runAi('meal-ideas', { context }, setWriting)
      await setMeta('mealIdeas', { result, at: Date.now() } satisfies StoredIdeas)
    } finally {
      setWriting(undefined)
    }
  }

  return (
    <Section prominent title="What to Eat Next">
      {shown && (
        <div className="card mb-3 divide-y divide-line overflow-hidden" aria-live={writing ? 'polite' : undefined}>
          {shown.ideas?.filter(Boolean).map((idea, i) => (
            <div key={i} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{idea!.name}</p>
                {idea!.calories !== undefined && <p className="shrink-0 text-[0.875rem] text-muted tabular-nums">~{Math.round(idea!.calories)} kcal · {Math.round(idea!.protein ?? 0)} g protein</p>}
              </div>
              {idea!.portion && <p className="text-[0.875rem] text-muted">{idea!.portion}</p>}
              {idea!.why && <p className="mt-1 text-[0.9375rem]">{idea!.why}</p>}
            </div>
          ))}
          <p className="flex items-center gap-1.5 px-4 py-2 text-[0.75rem] text-faint">
            {writing ? <><Sparkles size={12} className="animate-pulse" /> Thinking…</> : <>AI ideas with approximate numbers · {relativeAge(fresh!.at)}{shown.note ? ` · ${shown.note}` : ''}</>}
          </p>
        </div>
      )}
      <div className={writing ? 'hidden' : ''}>
        <AiAction label={fresh ? 'More Ideas' : 'Suggest Meals'} runningLabel="Thinking about your day…" run={run} className={fresh ? 'btn btn-quiet w-full' : 'btn btn-soft w-full'} />
      </div>
      {!shown && <p className="section-footer">Ideas that fit what’s left of today’s goals, from foods you usually eat.</p>}
    </Section>
  )
}

function SavedMealRow({ meal }: { meal: SavedMeal }) {
  const servings = meal.servings ?? 1
  // A recipe logs one serving: every food scales down with it.
  const items = meal.items.map((i) => (servings > 1 ? { ...scale(i, 1 / servings), amount: i.amount && `${i.amount} × 1/${servings}` } : i))
  const portion = items.length ? totals(items) : scale({ protein: meal.protein, calories: meal.calories }, 1 / servings)

  async function log() {
    haptic()
    const now = Date.now()
    const id = await save(db.meals, { name: meal.name, slot: slotFor(now), ...portion, items, recordedAt: now, source: 'user' })
    await save(db.savedMeals, { ...meal }) // most recently used first
    toast(`${meal.name} · ${grams(portion.protein)} protein logged`, { label: 'Undo', onClick: () => softDelete(db.meals, id) })
  }
  return (
    <div className="flex items-center">
      <button type="button" onClick={log} className="cell cell-press min-w-0 flex-1 text-left" aria-label={`Log ${meal.name}`}>
        <IconTile icon={Utensils} color="purple" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{meal.name}</span>
          <span className="block truncate text-[0.875rem] text-muted">
            {servings > 1 ? `1 of ${servings} servings · ` : ''}{nutrientLine(portion)}
          </span>
        </span>
      </button>
      <MLink to={`/log/meal?saved=${meal.id}`} className="flex h-11 w-11 shrink-0 items-center justify-center text-accent" aria-label={`Edit ${meal.name}`}>
        <Info size={22} />
      </MLink>
    </div>
  )
}
