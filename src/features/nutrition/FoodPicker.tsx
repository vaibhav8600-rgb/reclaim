import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Minus, Plus, Search, X } from 'lucide-react'
import { db, type CustomFood, type FoodItem } from '../../db/db'
import { alive, save } from '../../db/repo'
import { Group } from '../../components/ui'
import { daysAgo } from '../../lib/dates'
import { forGrams, searchFoods, type DbFood } from '../../lib/foodDb'
import { nutrientLine, scale } from '../../lib/nutrition'

type Picked = { kind: 'db'; food: DbFood } | { kind: 'mine'; food: CustomFood }

/**
 * Find a food and choose how much: search the built-in list and My Foods, or tap a recent one. A portion is a
 * familiar serving × a count (½ steps). New foods (from a label) can be made here without leaving the meal.
 */
export function FoodPicker({ onPick, onClose }: { onPick: (item: FoodItem) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Picked>()
  const [creating, setCreating] = useState(false)
  const mine = useLiveQuery(async () => (await db.foods.toArray()).filter(alive).sort((a, b) => b.updatedAt - a.updatedAt), [])
  // Recently eaten foods from the lists, latest portion first: one tap to have it again.
  const recent = useLiveQuery(async () => {
    const meals = (await db.meals.where('recordedAt').aboveOrEqual(daysAgo(60)).toArray()).filter(alive).sort((a, b) => b.recordedAt - a.recordedAt)
    const seen = new Map<string, FoodItem>()
    for (const m of meals) for (const i of m.items) if (i.foodId && !seen.has(i.foodId)) seen.set(i.foodId, i)
    return [...seen.values()].slice(0, 12)
  }, [])

  const q = query.trim().toLowerCase()
  const dbHits = useMemo(() => (q ? searchFoods(q) : []), [q])
  const mineHits = (mine ?? []).filter((m) => !q || m.name.toLowerCase().includes(q))

  const pick = (item: FoodItem) => {
    onPick(item)
    onClose()
  }

  return createPortal(
    <div className="animate-fade fixed inset-0 z-50 overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="Add food">
      <div className="mx-auto max-w-xl pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <header className="nav-scrolled sticky top-0 z-10 pt-safe">
          <div className="flex h-14 items-center gap-2 px-4">
            {picked || creating ? (
              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full glass" aria-label="Back" onClick={() => (setPicked(undefined), setCreating(false))}><ChevronLeft size={22} /></button>
            ) : (
              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full glass" aria-label="Close" onClick={onClose}><X size={22} /></button>
            )}
            <h2 className="flex-1 text-center text-[1.0625rem] font-semibold">{creating ? 'New Food' : picked ? 'How Much?' : 'Add Food'}</h2>
            <span className="w-11" />
          </div>
          {!picked && !creating && (
            <div className="px-4 pb-3">
              <label className="flex items-center gap-2 rounded-xl bg-fill px-3 py-2">
                <Search size={17} className="text-muted" />
                <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search foods, e.g. roti, dal, eggs" aria-label="Search foods" autoFocus />
              </label>
            </div>
          )}
        </header>

        <div className="space-y-6 px-4 pt-3">
          {creating ? (
            <CustomFoodForm initialName={query} onSaved={(food) => (setCreating(false), setPicked({ kind: 'mine', food }))} />
          ) : picked ? (
            <Portion picked={picked} onAdd={pick} />
          ) : (
            <>
              {!q && !!recent?.length && (
                <List title="Recent">
                  {recent.map((i) => (
                    <button key={i.foodId} type="button" className="cell cell-press text-left" onClick={() => pick(i)} aria-label={`Add ${i.name}, ${i.amount ?? ''}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{i.name}</span>
                        <span className="block truncate text-[0.875rem] text-muted">{[i.amount, nutrientLine(i)].filter(Boolean).join(' · ')}</span>
                      </span>
                      <Plus size={20} className="shrink-0 text-accent" />
                    </button>
                  ))}
                </List>
              )}

              {mineHits.length > 0 && (
                <List title="My Foods">
                  {mineHits.map((m) => (
                    <button key={m.id} type="button" className="cell cell-press text-left" onClick={() => setPicked({ kind: 'mine', food: m })}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{m.name}</span>
                        <span className="block truncate text-[0.875rem] text-muted">{m.serving} · {nutrientLine(m)}</span>
                      </span>
                    </button>
                  ))}
                </List>
              )}

              {dbHits.length > 0 && (
                <List title="Foods" footer="Approximate values for typical home recipes and portions. A packaged food’s label is more accurate — add it to My Foods.">
                  {dbHits.map((d) => {
                    const [label, g] = d.servings[0]
                    return (
                      <button key={d.id} type="button" className="cell cell-press text-left" onClick={() => setPicked({ kind: 'db', food: d })}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{d.name}</span>
                          <span className="block truncate text-[0.875rem] text-muted">{label} · {nutrientLine(forGrams(d, g))}</span>
                        </span>
                      </button>
                    )
                  })}
                </List>
              )}

              {q && !dbHits.length && !mineHits.length && <p className="px-1 text-muted">No foods called “{query.trim()}” yet.</p>}
              {!q && !recent?.length && !mineHits.length && <p className="px-1 text-muted">Search about 110 common foods — roti, dal, rice, paneer, eggs, chicken, fruit, snacks — or add your own from a label.</p>}

              <button type="button" className="btn btn-quiet w-full" onClick={() => setCreating(true)}>
                <Plus size={19} /> {q ? `Create “${query.trim()}”` : 'Create a Food'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function List({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  return (
    <section>
      <span className="section-label block">{title}</span>
      <Group>{children}</Group>
      {footer && <p className="section-footer">{footer}</p>}
    </section>
  )
}

const COUNTS = [0.5, 1, 1.5, 2, 3]

/** Choose a serving and how many; see the nutrients before adding. */
function Portion({ picked, onAdd }: { picked: Picked; onAdd: (item: FoodItem) => void }) {
  const servings: [string, number | undefined][] = picked.kind === 'db' ? picked.food.servings : [[picked.food.serving, picked.food.grams]]
  const [serving, setServing] = useState(0)
  const [count, setCount] = useState(1)
  const [label, grams] = servings[serving]
  const nutrients = picked.kind === 'db' ? forGrams(picked.food, grams! * count) : scale(picked.food, count)
  const amount = count === 1 ? label : `${count} × ${label}`

  function add() {
    const { protein, calories, carbs, fat, fiber, sugar, sodium } = nutrients
    onAdd({ name: picked.food.name, amount, foodId: picked.kind === 'db' ? `db:${picked.food.id}` : picked.food.id, protein, calories, carbs, fat, fiber, sugar, sodium })
  }

  return (
    <>
      <div className="px-1">
        <h3 className="text-[1.375rem] leading-tight font-bold">{picked.food.name}</h3>
        {picked.kind === 'db' && <p className="text-[0.875rem] text-muted">Approximate values</p>}
      </div>

      {servings.length > 1 && (
        <div>
          <span className="section-label block">Serving</span>
          <div className="flex flex-wrap gap-2">
            {servings.map(([l], i) => <button key={l} type="button" className="chip" aria-pressed={i === serving} onClick={() => setServing(i)}>{l}</button>)}
          </div>
        </div>
      )}

      <div>
        <span className="section-label block">How Many</span>
        <div className="card flex items-center justify-between p-2">
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full bg-fill disabled:opacity-40" onClick={() => setCount((c) => Math.max(0.5, c - 0.5))} disabled={count <= 0.5} aria-label="Less"><Minus size={20} /></button>
          <span className="font-rounded text-[1.75rem] font-semibold tabular-nums" aria-live="polite" data-testid="portion-count">{count}</span>
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full bg-fill" onClick={() => setCount((c) => c + 0.5)} aria-label="More"><Plus size={20} /></button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {COUNTS.map((c) => <button key={c} type="button" className="chip !min-h-8 !text-[0.875rem]" aria-pressed={c === count} onClick={() => setCount(c)}>{c}</button>)}
        </div>
      </div>

      <div className="card p-4">
        <p className="text-[0.9375rem] text-muted">{amount}{grams ? ` · ${Math.round(grams * count)} g` : ''}</p>
        <p className="font-rounded mt-1 text-[1.75rem] leading-tight font-semibold" data-testid="portion-kcal">{nutrients.calories ?? '—'} <span className="text-[1rem] font-medium text-muted">kcal</span></p>
        <div className="mt-2 grid grid-cols-4 gap-2 text-center text-[0.8125rem]">
          {([['Protein', nutrients.protein], ['Carbs', nutrients.carbs], ['Fat', nutrients.fat], ['Fiber', nutrients.fiber]] as const).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-fill py-1.5">
              <p className="font-rounded text-[1rem] font-semibold text-ink tabular-nums">{v === undefined ? '—' : `${Math.round(v * 10) / 10} g`}</p>
              <p className="text-muted">{k}</p>
            </div>
          ))}
        </div>
      </div>

      <button type="button" className="btn btn-primary w-full" onClick={add}>Add to Meal</button>
    </>
  )
}

const NUM_FIELDS = [
  ['calories', 'Calories', 'kcal'],
  ['protein', 'Protein', 'g'],
  ['carbs', 'Carbs', 'g'],
  ['sugar', '  of which sugar', 'g'],
  ['fat', 'Fat', 'g'],
  ['fiber', 'Fiber', 'g'],
  ['sodium', 'Sodium', 'mg'],
] as const

/** A food from its nutrition label (per serving). Also used to edit one from My Foods. */
export function CustomFoodForm({ initialName = '', existing, onSaved, submitLabel = 'Save Food' }: { initialName?: string; existing?: CustomFood; onSaved: (food: CustomFood) => void; submitLabel?: string }) {
  const [name, setName] = useState(existing?.name ?? initialName)
  const [serving, setServing] = useState(existing?.serving ?? '1 serving')
  const [grams, setGrams] = useState(existing?.grams?.toString() ?? '')
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(NUM_FIELDS.map(([k]) => [k, existing?.[k]?.toString() ?? ''])))
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')))
  const parsed = Object.fromEntries(NUM_FIELDS.map(([k]) => [k, num(values[k])])) as Record<(typeof NUM_FIELDS)[number][0], number | undefined>
  const valid = !!name.trim() && !!serving.trim() && parsed.protein !== undefined && Object.values(parsed).every((v) => v === undefined || (Number.isFinite(v) && v >= 0)) && (num(grams) === undefined || num(grams)! > 0)

  async function submit() {
    const food = { id: existing?.id, name: name.trim(), serving: serving.trim(), grams: num(grams), ...parsed, protein: parsed.protein! }
    const id = await save(db.foods, food)
    onSaved((await db.foods.get(id))!)
  }

  return (
    <>
      <label className="block">
        <span className="section-label block">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Protein bar (brand)" aria-label="Food name" />
      </label>
      <div>
        <span className="section-label block">One Serving</span>
        <Group>
          <label className="cell">
            <span className="flex-1">Serving</span>
            <input className="w-40 bg-transparent text-right outline-none placeholder:text-faint" value={serving} onChange={(e) => setServing(e.target.value)} placeholder="1 bar" aria-label="Serving" />
          </label>
          <label className="cell">
            <span className="flex-1">Weight</span>
            <input className="w-20 bg-transparent text-right outline-none placeholder:text-faint" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="Optional" aria-label="Serving weight (g)" />
            <span className="w-8 text-muted">g</span>
          </label>
        </Group>
      </div>
      <div>
        <span className="section-label block">Per Serving</span>
        <Group>
          {NUM_FIELDS.map(([k, label, unit]) => (
            <label key={k} className="cell">
              <span className={`flex-1 ${label.startsWith(' ') ? 'pl-3 text-muted' : ''}`}>{label.trim()}</span>
              <input className="w-20 bg-transparent text-right outline-none placeholder:text-faint" inputMode="decimal" value={values[k]} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} placeholder={k === 'protein' ? '0' : 'Optional'} aria-label={`${label.trim()} (${unit})`} />
              <span className="w-8 text-muted">{unit}</span>
            </label>
          ))}
        </Group>
        <p className="section-footer">Copy these from the nutrition label, per serving. Protein is needed; the rest is optional.</p>
      </div>
      <button type="button" className="btn btn-primary w-full" disabled={!valid} onClick={submit}>{submitLabel}</button>
    </>
  )
}
