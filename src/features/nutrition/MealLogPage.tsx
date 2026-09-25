import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Camera, Plus, Search, Sparkles, X } from 'lucide-react'
import { MEAL_PHOTO_MAX_SIDE } from '../../../shared/ai'
import { db, type FoodItem, type MealSlot, type Nutrients, type SavedMeal, type Source } from '../../db/db'
import { useSavedMeals } from '../../db/hooks'
import { restore, save, softDelete } from '../../db/repo'
import { AiAction } from '../../components/ai'
import { Field, Group, Segmented, Toggle } from '../../components/ui'
import { imageForAi, runAi } from '../../lib/ai'
import { haptic } from '../../lib/haptics'
import { useBack } from '../../lib/nav'
import { grams, MEAL_SLOTS, scale, slotFor, totals } from '../../lib/nutrition'
import { requestPersistence } from '../../lib/platform'
import { toast } from '../../lib/toast'
import { DeleteRow, SheetForm, WhenRow } from '../log/shared'
import { FoodPicker } from './FoodPicker'

interface FoodDraft {
  name: string
  amount: string
  protein: string
  calories: string
  carbs: string
  fat: string
  fiber: string
  /** Kept as they came (from the food list, a label or the AI): not edited on this screen. */
  extra?: Pick<FoodItem, 'sugar' | 'sodium' | 'foodId'>
  /** Straight from the AI and not yet touched by the user. */
  estimated?: boolean
}

const num = (s: string) => parseFloat(s.replace(',', '.'))
const str = (n?: number) => (n === undefined ? '' : String(n))
const opt = (s: string) => (s.trim() ? num(s) : undefined)
const toDraft = (f: FoodItem): FoodDraft => ({
  name: f.name,
  amount: f.amount ?? '',
  protein: String(f.protein),
  calories: str(f.calories),
  carbs: str(f.carbs),
  fat: str(f.fat),
  fiber: str(f.fiber),
  extra: { sugar: f.sugar, sodium: f.sodium, foodId: f.foodId },
})
const EMPTY: FoodDraft = { name: '', amount: '', protein: '', calories: '', carbs: '', fat: '', fiber: '' }

/**
 * Log a meal (`?id=` edits one), or edit a saved meal (`?saved=<id>`, or `?saved=` for a new one).
 * Protein first: a name and grams of protein is enough. Foods are optional; with foods, totals are their sum.
 * An AI estimate (photo and/or description) fills the foods for the user to check before saving.
 */
export function MealLogPage() {
  const [params] = useSearchParams()
  const id = params.get('id') || undefined
  const editingSaved = params.has('saved')
  const savedId = params.get('saved') || undefined
  const back = useBack(editingSaved ? '/nutrition' : '/', 'sheet-down')
  const savedMeals = useSavedMeals()

  const [name, setName] = useState('')
  const [slot, setSlot] = useState<MealSlot>(slotFor(Date.now()))
  const [recordedAt, setRecordedAt] = useState(Date.now())
  const [foods, setFoods] = useState<FoodDraft[]>([])
  const [protein, setProtein] = useState('')
  const [calories, setCalories] = useState('')
  const [notes, setNotes] = useState('')
  const [source, setSource] = useState<Source>('user')
  const [keep, setKeep] = useState(false)
  const [photo, setPhoto] = useState<{ blob: Blob; url: string }>()
  const [assumptions, setAssumptions] = useState<string[]>([])
  const [notFood, setNotFood] = useState(false)
  const [loaded, setLoaded] = useState(!id && !savedId)
  const [picking, setPicking] = useState(false)
  /** A recipe: the foods are for `batch` servings, of which `eaten` are logged. */
  const [batch, setBatch] = useState(1)
  const [eaten, setEaten] = useState(1)

  function fill(m: Pick<SavedMeal, 'name' | 'protein' | 'calories' | 'items' | 'servings'>) {
    setName(m.name)
    setFoods(m.items.map(toDraft))
    setProtein(m.items.length ? '' : String(m.protein))
    setCalories(m.items.length || m.calories === undefined ? '' : String(m.calories))
    setBatch(m.servings ?? 1)
    setEaten(1)
  }

  useEffect(() => {
    if (id) {
      db.meals.get(id).then((m) => {
        if (m) {
          fill(m)
          setSlot(m.slot)
          setRecordedAt(m.recordedAt)
          setNotes(m.notes ?? '')
          setSource(m.source)
        }
        setLoaded(true)
      })
    } else if (savedId) {
      db.savedMeals.get(savedId).then((m) => {
        if (m) fill(m)
        setLoaded(true)
      })
    }
  }, [id, savedId])

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo])

  if (!loaded) return null

  const items: FoodItem[] = foods.map((f) => ({
    ...f.extra,
    name: f.name.trim(),
    amount: f.amount.trim() || undefined,
    protein: num(f.protein),
    calories: opt(f.calories),
    carbs: opt(f.carbs),
    fat: opt(f.fat),
    fiber: opt(f.fiber),
  }))
  const okNumber = (n: number | undefined) => n === undefined || (Number.isFinite(n) && n >= 0)
  const recipe = !editingSaved && batch > 1
  // Logging part of a recipe: every food (and so the total) scales to the servings eaten.
  const logged = recipe ? items.map((i) => ({ ...scale(i, eaten / batch), amount: i.amount && `${i.amount} × ${eaten}/${batch}` })) : items
  const total: Nutrients = foods.length ? totals(logged) : { protein: num(protein), calories: opt(calories) }
  // Left blank, the meal is named after its foods ("Egg, boiled + Roti / chapati").
  const mealName = name.trim() || items.map((i) => i.name).filter(Boolean).join(' + ').slice(0, 120)
  const valid =
    !!mealName &&
    items.every((i) => i.name && okNumber(i.protein) && okNumber(i.calories) && okNumber(i.carbs) && okNumber(i.fat) && okNumber(i.fiber)) &&
    Number.isFinite(total.protein) &&
    okNumber(total.protein) &&
    okNumber(total.calories)

  const editFood = (index: number, patch: Partial<FoodDraft>) => setFoods((all) => all.map((f, i) => (i === index ? { ...f, ...patch, estimated: false } : f)))
  // The first food carries over a protein/calorie total typed before foods were added.
  const addFood = () => setFoods((all) => [...all, all.length ? EMPTY : { ...EMPTY, protein, calories }])
  // A food from the list keeps its values; the first one also replaces a quick protein total typed before.
  const addPicked = (item: FoodItem) => setFoods((all) => [...all, toDraft(item)])

  function pickPhoto(file: File | undefined) {
    if (!file) return
    setPhoto({ blob: file, url: URL.createObjectURL(file) })
    setNotFood(false)
  }

  async function estimate() {
    const image = photo ? await imageForAi(photo.blob, MEAL_PHOTO_MAX_SIDE) : undefined
    const r = await runAi('estimate-meal', { description: name.trim() || undefined, image })
    setNotFood(!r.isFood)
    if (!r.isFood) return
    setName(r.name)
    setFoods(r.items.map((i) => ({ ...EMPTY, name: i.name, amount: i.amount, protein: String(Math.round(i.protein)), calories: String(Math.round(i.calories)), carbs: str(i.carbs), fat: str(i.fat), fiber: str(i.fiber), estimated: true })))
    setAssumptions(r.assumptions)
    setSource('ai_estimate')
  }

  /** Every nutrient, even the missing ones: saving merges into the old record, so a removed value must be written as empty. */
  const all = (n: Nutrients): Nutrients => ({ protein: n.protein, calories: n.calories, carbs: n.carbs, fat: n.fat, fiber: n.fiber, sugar: n.sugar, sodium: n.sodium })

  async function submit() {
    haptic()
    if (editingSaved) {
      await save(db.savedMeals, { id: savedId, name: mealName, ...all(foods.length ? totals(items) : total), items, servings: batch > 1 ? batch : undefined })
      toast(savedId ? 'Saved meal updated' : `${mealName} added to Saved Meals`)
      return back()
    }
    const values = { name: mealName, ...all(total), items: logged }
    await save(db.meals, {
      id,
      ...values,
      slot,
      recordedAt,
      notes: notes.trim() || undefined,
      // Reviewed and saved by the user: an AI estimate becomes a confirmed value.
      source: source === 'ai_estimate' ? 'user_confirmed' : source,
    })
    if (keep) await save(db.savedMeals, { ...values, items })
    void requestPersistence()
    toast(`${values.name} · ${grams(values.protein)} protein ${id ? 'updated' : 'logged'}`)
    back()
  }

  async function remove() {
    if (editingSaved) {
      await softDelete(db.savedMeals, savedId!)
      toast('Saved meal deleted', { label: 'Undo', onClick: () => restore(db.savedMeals, savedId!) })
    } else {
      await softDelete(db.meals, id!)
      toast('Meal deleted', { label: 'Undo', onClick: () => restore(db.meals, id!) })
    }
    back()
  }

  const title = editingSaved ? (savedId ? 'Edit Saved Meal' : 'New Saved Meal') : id ? 'Edit Meal' : 'Meal'
  const anyEstimated = foods.some((f) => f.estimated)

  return (
    <SheetForm title={title} canSave={valid} onSubmit={submit} onClose={back}>
      {!editingSaved && !id && !!savedMeals?.length && (
        <div>
          <span className="section-label block">Saved Meals</span>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {savedMeals.map((m) => (
              <button key={m.id} type="button" className="chip shrink-0" onClick={() => fill(m)}>
                {m.name} · {grams(m.protein)}
              </button>
            ))}
          </div>
        </div>
      )}

      <Field label="Meal">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={name.trim() ? undefined : mealName || 'e.g. 2 eggs on toast, chicken rice bowl'} maxLength={120} autoComplete="off" />
      </Field>

      {!editingSaved && <Segmented options={MEAL_SLOTS} value={slot} onChange={setSlot} />}

      {!editingSaved && (
        <div>
          <span className="section-label block">Estimate with AI</span>
          <div className="card flex items-center gap-3 p-3">
            {photo ? (
              <>
                <img src={photo.url} alt="Meal photo" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                <span className="min-w-0 flex-1 text-[0.9375rem] text-muted">Photo added. Tap Estimate below.</span>
                <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-muted" aria-label="Remove photo" onClick={() => setPhoto(undefined)}>
                  <X size={16} strokeWidth={2.6} />
                </button>
              </>
            ) : (
              <label className="btn btn-quiet w-full cursor-pointer">
                <Camera size={19} /> Add Photo
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0])} />
              </label>
            )}
          </div>
          <div className="mt-3">
            <AiAction label="Estimate with AI" runningLabel="Looking at your meal…" run={estimate} disabled={!photo && !name.trim()} />
          </div>
          {notFood ? (
            <p className="section-footer !text-danger" role="alert">That doesn’t look like food. Try another photo, or describe the meal above.</p>
          ) : (
            <p className="section-footer">From a photo, the meal description above, or both. You check the numbers before saving. The photo isn’t kept.</p>
          )}
        </div>
      )}

      {foods.length === 0 ? (
        <div>
          <span className="section-label block">Protein</span>
          <Group>
            <label className="flex items-baseline gap-2 px-5 py-3">
              <input
                className="font-rounded w-full min-w-0 bg-transparent text-[2.5rem] font-semibold outline-none placeholder:text-faint"
                inputMode="decimal"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder="0"
                aria-label="Protein (g)"
              />
              <span className="shrink-0 text-[1.25rem] font-medium text-muted">g</span>
            </label>
            <label className="cell">
              <span className="flex-1">Calories</span>
              <input className="w-24 bg-transparent text-right outline-none placeholder:text-faint" inputMode="decimal" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="Optional" aria-label="Calories (kcal)" />
              <span className="text-muted">kcal</span>
            </label>
          </Group>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button type="button" className="btn btn-soft" onClick={() => setPicking(true)}><Search size={18} /> Search Foods</button>
            <button type="button" className="btn btn-quiet" onClick={addFood}><Plus size={18} /> Add by Hand</button>
          </div>
          <p className="section-footer">Or list each food — from the food list, or typed in — and the totals add up for you.</p>
        </div>
      ) : (
        <div>
          <span className="section-label block">Foods</span>
          {anyEstimated && (
            <p className="mb-2 flex items-start gap-2 px-1 text-[0.9375rem] text-muted">
              <Sparkles size={17} className="mt-0.5 shrink-0 text-accent" />
              AI estimates from typical portions. Check each one and adjust anything that’s off.
            </p>
          )}
          <div className="space-y-3">
            {foods.map((f, i) => (
              <FoodCard key={i} food={f} onChange={(patch) => editFood(i, patch)} onRemove={() => setFoods((all) => all.filter((_, k) => k !== i))} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button type="button" className="btn btn-soft" onClick={() => setPicking(true)}><Search size={18} /> Search Foods</button>
            <button type="button" className="btn btn-quiet" onClick={addFood}><Plus size={18} /> Add by Hand</button>
          </div>
          {editingSaved && (
            <Group className="mt-3">
              <label className="cell">
                <span className="flex-1">Makes</span>
                <input className="w-14 bg-transparent text-right outline-none" inputMode="numeric" value={batch} onChange={(e) => setBatch(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))} aria-label="Servings this recipe makes" />
                <span className="text-muted">{batch === 1 ? 'serving' : 'servings'}</span>
              </label>
            </Group>
          )}
          {recipe && (
            <Group className="mt-3">
              <label className="cell">
                <span className="flex-1">Servings Eaten</span>
                <input className="w-14 bg-transparent text-right outline-none" inputMode="decimal" value={eaten} onChange={(e) => setEaten(Math.max(0.5, Math.min(batch, num(e.target.value) || 1)))} aria-label="Servings eaten" />
                <span className="text-muted">of {batch}</span>
              </label>
            </Group>
          )}
          <p className="mt-3 px-1 font-semibold" data-testid="meal-total" aria-live="polite">
            Total{recipe ? ` (${eaten} of ${batch} servings)` : ''}: {Number.isFinite(total.protein) ? grams(total.protein) : '—'} protein{total.calories !== undefined && Number.isFinite(total.calories) ? ` · ${Math.round(total.calories)} kcal` : ''}
          </p>
          {(total.carbs !== undefined || total.fat !== undefined || total.fiber !== undefined) && (
            <p className="px-1 text-[0.9375rem] text-muted" data-testid="meal-macros">
              {[total.carbs !== undefined && `Carbs ${Math.round(total.carbs)} g`, total.fat !== undefined && `Fat ${Math.round(total.fat)} g`, total.fiber !== undefined && `Fiber ${Math.round(total.fiber)} g`].filter(Boolean).join(' · ')}
            </p>
          )}
          {assumptions.length > 0 && (
            <ul className="section-footer list-disc space-y-0.5 pl-9">
              {assumptions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}
        </div>
      )}

      {!editingSaved && (
        <>
          <Group>
            <WhenRow value={recordedAt} onChange={setRecordedAt} />
          </Group>
          <Field label="Notes">
            <textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </Field>
        </>
      )}

      {!editingSaved && !id && (
        <div>
          <Group>
            <Toggle label="Add to Saved Meals" checked={keep} onChange={setKeep} />
          </Group>
          <p className="section-footer">Log it again later with one tap.</p>
        </div>
      )}

      {(id || savedId) && <DeleteRow label={editingSaved ? 'Delete Saved Meal' : 'Delete Meal'} onDelete={remove} />}
      {picking && <FoodPicker onPick={addPicked} onClose={() => setPicking(false)} />}
    </SheetForm>
  )
}

function FoodCard({ food, onChange, onRemove }: { food: FoodDraft; onChange: (patch: Partial<FoodDraft>) => void; onRemove: () => void }) {
  const small = 'w-full min-w-0 bg-transparent outline-none placeholder:text-faint'
  return (
    <div className={`card p-3 ${food.estimated ? 'ring-1 ring-accent/40' : ''}`}>
      <div className="flex items-center gap-2">
        <input className={`${small} font-semibold`} value={food.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Food" aria-label="Food name" maxLength={80} />
        <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-muted" aria-label={`Remove ${food.name || 'food'}`} onClick={onRemove}>
          <X size={16} strokeWidth={2.6} />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_5rem_4.5rem] gap-2 text-[0.8125rem] text-muted">
        <label className="rounded-xl bg-fill px-2.5 py-1.5">
          Amount
          <input className={`${small} text-[1rem] text-ink`} value={food.amount} onChange={(e) => onChange({ amount: e.target.value })} placeholder="1 bowl" maxLength={60} />
        </label>
        <label className="rounded-xl bg-fill px-2.5 py-1.5">
          Protein
          <span className="flex items-baseline gap-0.5">
            <input className={`${small} font-rounded text-[1rem] font-semibold text-ink`} inputMode="decimal" value={food.protein} onChange={(e) => onChange({ protein: e.target.value })} placeholder="0" aria-label="Protein grams" />
            <span className="text-[0.875rem]">g</span>
          </span>
        </label>
        <label className="rounded-xl bg-fill px-2.5 py-1.5">
          kcal
          <input className={`${small} text-[1rem] text-ink`} inputMode="decimal" value={food.calories} onChange={(e) => onChange({ calories: e.target.value })} placeholder="—" />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[0.8125rem] text-muted">
        {(['carbs', 'fat', 'fiber'] as const).map((k) => (
          <label key={k} className="rounded-xl bg-fill px-2.5 py-1">
            {k === 'carbs' ? 'Carbs' : k === 'fat' ? 'Fat' : 'Fiber'}
            <span className="flex items-baseline gap-0.5">
              <input className={`${small} text-[0.9375rem] text-ink`} inputMode="decimal" value={food[k]} onChange={(e) => onChange({ [k]: e.target.value })} placeholder="—" aria-label={`${k} grams`} />
              <span>g</span>
            </span>
          </label>
        ))}
      </div>
      {food.estimated && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[0.75rem] font-semibold text-accent">
          <Sparkles size={12} /> AI estimate — adjust if needed
        </p>
      )}
    </div>
  )
}
