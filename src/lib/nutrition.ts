import type { Meal, MealSlot, Nutrients, Profile } from '../db/db'
import { dayKey, daysAgo } from './dates'

export const MEAL_SLOTS: { value: MealSlot; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
]
export const slotLabel = (slot: MealSlot) => MEAL_SLOTS.find((s) => s.value === slot)!.label

/** The meal you're most likely logging at this time of day. */
export function slotFor(ms: number): MealSlot {
  const h = new Date(ms).getHours()
  return h >= 5 && h < 11 ? 'breakfast' : h >= 11 && h < 15 ? 'lunch' : h >= 18 && h < 22 ? 'dinner' : 'snack'
}

export const OPTIONAL_NUTRIENTS = ['calories', 'carbs', 'fat', 'fiber', 'sugar', 'sodium'] as const
const round1 = (n: number) => Math.round(n * 10) / 10
const whole = (k: string) => k === 'calories' || k === 'sodium'

/** Totals of a list of foods. An optional nutrient is summed only when at least one food has it. */
export function totals(items: Nutrients[]): Nutrients {
  const out: Nutrients = { protein: round1(items.reduce((a, i) => a + i.protein, 0)) }
  for (const k of OPTIONAL_NUTRIENTS) {
    const known = items.filter((i) => i[k] !== undefined)
    if (known.length) {
      const sum = known.reduce((a, i) => a + i[k]!, 0)
      out[k] = whole(k) ? Math.round(sum) : round1(sum)
    }
  }
  return out
}

/** A food's nutrients for `factor` portions (half a serving, three servings…). */
export function scale<T extends Nutrients>(n: T, factor: number): T {
  const out = { ...n, protein: round1(n.protein * factor) }
  for (const k of OPTIONAL_NUTRIENTS) if (n[k] !== undefined) out[k] = whole(k) ? Math.round(n[k]! * factor) : round1(n[k]! * factor)
  return out
}

/** Totals per day for the last `days` days, oldest first. Days with no meals have `meals: 0`. */
export function dailyTotals(meals: Meal[], days: number, now = Date.now()) {
  const out = Array.from({ length: days }, (_, i) => ({ key: dayKey(daysAgo(days - 1 - i, now)), at: daysAgo(days - 1 - i, now), protein: 0, calories: 0, carbs: 0, fat: 0, fiber: 0, meals: 0 }))
  const byKey = new Map(out.map((d) => [d.key, d]))
  for (const m of meals) {
    const d = byKey.get(dayKey(m.recordedAt))
    if (!d) continue
    d.protein += m.protein
    d.calories += m.calories ?? 0
    d.carbs += m.carbs ?? 0
    d.fat += m.fat ?? 0
    d.fiber += m.fiber ?? 0
    d.meals++
  }
  for (const d of out) for (const k of ['protein', 'calories', 'carbs', 'fat', 'fiber'] as const) d[k] = Math.round(d[k])
  return out
}

export const grams = (g: number) => `${Math.round(g)} g`

/* ─────────── calorie goal ─────────── */

export const ACTIVITY_LEVELS = [
  { value: 'sedentary' as const, label: 'Mostly sitting', factor: 1.2 },
  { value: 'light' as const, label: 'Lightly active', factor: 1.375 },
  { value: 'moderate' as const, label: 'Active', factor: 1.55 },
  { value: 'active' as const, label: 'Very active', factor: 1.725 },
]

/**
 * A starting calorie goal: Mifflin–St Jeor resting energy × activity, then −500 kcal a day to lose weight
 * (about 0.5 kg a week) or +300 to gain. Never below 1,200 (women) / 1,500 (men) kcal without supervision.
 * Undefined until weight, height, year of birth, sex and activity are known.
 */
export function suggestedCalories(p: Pick<Profile, 'sex' | 'birthYear' | 'height' | 'activity' | 'weightPlan'>, weightKg?: number, now = new Date()) {
  if (!p.sex || !p.birthYear || !p.height || !p.activity || !weightKg) return undefined
  const age = now.getFullYear() - p.birthYear
  const bmr = 10 * weightKg + 6.25 * p.height - 5 * age + (p.sex === 'male' ? 5 : -161)
  const maintain = bmr * ACTIVITY_LEVELS.find((a) => a.value === p.activity)!.factor
  const goal = p.weightPlan === 'lose' ? maintain - 500 : p.weightPlan === 'gain' ? maintain + 300 : maintain
  return Math.round(Math.max(goal, p.sex === 'male' ? 1500 : 1200) / 10) * 10
}

/** Carbs and fat that fit the calorie and protein goals: fat about 30% of calories, carbs the rest. A guide, not stored. */
export function macroGuide(calories?: number, protein?: number) {
  if (!calories) return undefined
  const fat = Math.round((calories * 0.3) / 9)
  const carbs = Math.max(0, Math.round((calories - (protein ?? 0) * 4 - fat * 9) / 4))
  return { fat, carbs }
}

/** "320 kcal · P 12 · C 40 · F 9" */
export function nutrientLine(n: Nutrients) {
  return [n.calories !== undefined && `${Math.round(n.calories)} kcal`, `P ${Math.round(n.protein)}`, n.carbs !== undefined && `C ${Math.round(n.carbs)}`, n.fat !== undefined && `F ${Math.round(n.fat)}`].filter(Boolean).join(' · ')
}
