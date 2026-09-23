import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Camera, Plus, Sparkles, X } from 'lucide-react'
import { MEAL_PHOTO_MAX_SIDE } from '../../../shared/ai'
import { db, type FoodItem, type MealSlot, type SavedMeal, type Source } from '../../db/db'
import { useSavedMeals } from '../../db/hooks'
import { restore, save, softDelete } from '../../db/repo'
import { AiAction } from '../../components/ai'
import { Field, Group, Segmented, Toggle } from '../../components/ui'
import { imageForAi, runAi } from '../../lib/ai'
import { haptic } from '../../lib/haptics'
import { useBack } from '../../lib/nav'
import { grams, MEAL_SLOTS, slotFor, totals } from '../../lib/nutrition'
import { requestPersistence } from '../../lib/platform'
import { toast } from '../../lib/toast'
import { DeleteRow, SheetForm, WhenRow } from '../log/shared'

interface FoodDraft {
  name: string
  amount: string
  protein: string
  calories: string
  /** Straight from the AI and not yet touched by the user. */
  estimated?: boolean
}

const num = (s: string) => parseFloat(s.replace(',', '.'))
const toDraft = (f: FoodItem): FoodDraft => ({ name: f.name, amount: f.amount ?? '', protein: String(f.protein), calories: f.calories === undefined ? '' : String(f.calories) })

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

  function fill(m: Pick<SavedMeal, 'name' | 'protein' | 'calories' | 'items'>) {
    setName(m.name)
    setFoods(m.items.map(toDraft))
    setProtein(m.items.length ? '' : String(m.protein))
    setCalories(m.items.length || m.calories === undefined ? '' : String(m.calories))
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
    name: f.name.trim(),
    amount: f.amount.trim() || undefined,
    protein: num(f.protein),
    calories: f.calories.trim() ? num(f.calories) : undefined,
  }))
  const okNumber = (n: number | undefined) => n === undefined || (Number.isFinite(n) && n >= 0)
  const total = foods.length ? totals(items) : { protein: num(protein), calories: calories.trim() ? num(calories) : undefined }
  const valid =
    !!name.trim() &&
    items.every((i) => i.name && okNumber(i.protein) && okNumber(i.calories)) &&
    Number.isFinite(total.protein) &&
    okNumber(total.protein) &&
    okNumber(total.calories)

  const editFood = (index: number, patch: Partial<FoodDraft>) => setFoods((all) => all.map((f, i) => (i === index ? { ...f, ...patch, estimated: false } : f)))
  // The first food carries over a protein/calorie total typed before foods were added.
  const addFood = () => setFoods((all) => [...all, all.length ? { name: '', amount: '', protein: '', calories: '' } : { name: '', amount: '', protein, calories }])

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
    setFoods(r.items.map((i) => ({ name: i.name, amount: i.amount, protein: String(Math.round(i.protein)), calories: String(Math.round(i.calories)), estimated: true })))
    setAssumptions(r.assumptions)
    setSource('ai_estimate')
  }

  async function submit() {
    haptic()
    const values = { name: name.trim(), protein: total.protein, calories: total.calories, items }
    if (editingSaved) {
      await save(db.savedMeals, { id: savedId, ...values })
      toast(savedId ? 'Saved meal updated' : `${values.name} added to Saved Meals`)
      return back()
    }
    await save(db.meals, {
      id,
      ...values,
      slot,
      recordedAt,
      notes: notes.trim() || undefined,
      // Reviewed and saved by the user: an AI estimate becomes a confirmed value.
      source: source === 'ai_estimate' ? 'user_confirmed' : source,
    })
    if (keep) await save(db.savedMeals, values)
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
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2 eggs on toast, chicken rice bowl" maxLength={120} autoComplete="off" />
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
            <AiAction label="Estimate Protein" runningLabel="Looking at your meal…" run={estimate} disabled={!photo && !name.trim()} />
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
          <button type="button" className="btn btn-quiet mt-3 w-full" onClick={addFood}><Plus size={19} /> Add Foods</button>
          <p className="section-footer">Optional: list each food, and the totals add up for you.</p>
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
          <button type="button" className="btn btn-quiet mt-3 w-full" onClick={addFood}><Plus size={19} /> Add Food</button>
          <p className="mt-3 px-1 font-semibold" data-testid="meal-total" aria-live="polite">
            Total: {Number.isFinite(total.protein) ? grams(total.protein) : '—'} protein{total.calories !== undefined && Number.isFinite(total.calories) ? ` · ${Math.round(total.calories)} kcal` : ''}
          </p>
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
      {food.estimated && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[0.75rem] font-semibold text-accent">
          <Sparkles size={12} /> AI estimate — adjust if needed
        </p>
      )}
    </div>
  )
}
