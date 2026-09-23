import type { FoodItem, Meal, MealSlot } from '../db/db'
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

/** Totals of a list of foods; calories only when at least one food has them. */
export function totals(items: FoodItem[]) {
  const protein = Math.round(items.reduce((a, i) => a + i.protein, 0) * 10) / 10
  const withCalories = items.filter((i) => i.calories !== undefined)
  return { protein, calories: withCalories.length ? Math.round(withCalories.reduce((a, i) => a + i.calories!, 0)) : undefined }
}

/** Protein (and calories) per day for the last `days` days, oldest first. Days with no meals have `meals: 0`. */
export function dailyProtein(meals: Meal[], days: number, now = Date.now()) {
  const out = Array.from({ length: days }, (_, i) => ({ key: dayKey(daysAgo(days - 1 - i, now)), at: daysAgo(days - 1 - i, now), protein: 0, calories: 0, meals: 0 }))
  const byKey = new Map(out.map((d) => [d.key, d]))
  for (const m of meals) {
    const d = byKey.get(dayKey(m.recordedAt))
    if (!d) continue
    d.protein += m.protein
    d.calories += m.calories ?? 0
    d.meals++
  }
  for (const d of out) d.protein = Math.round(d.protein)
  return out
}

export const grams = (g: number) => `${Math.round(g)} g`
