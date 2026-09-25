import { useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import type { Exercise } from '../../db/db'
import { isOpenInjury, useExercises, useInjuries, usePrescriptions } from '../../db/hooks'
import { Chips, GlassButton, Group, NavBar, Row, Section } from '../../components/ui'
import { BODY_REGIONS } from '../../lib/constants'
import { cautionsFor } from '../../lib/fitness'

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'rehab', label: 'Rehab' },
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
] as const
type Category = (typeof CATEGORIES)[number]['value']
const categoryOf = (e: Exercise): Exclude<Category, 'all'> => e.category ?? 'rehab'

export function LibraryPage() {
  const exercises = useExercises()
  const prescriptions = usePrescriptions()
  const injuries = useInjuries()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('all')
  if (!exercises || !prescriptions || !injuries) return null

  const open = injuries.filter(isOpenInjury)
  const inPlan = new Set(prescriptions.map((p) => p.exerciseId))
  const q = query.trim().toLowerCase()
  const matches = exercises
    .filter((e) => (category === 'all' || categoryOf(e) === category) && (!q || e.name.toLowerCase().includes(q) || e.bodyRegion.toLowerCase().includes(q)))
    .sort((a, b) => BODY_REGIONS.indexOf(a.bodyRegion) - BODY_REGIONS.indexOf(b.bodyRegion) || a.name.localeCompare(b.name))
  const sections = CATEGORIES.filter((c) => c.value !== 'all' && matches.some((e) => categoryOf(e) === c.value))

  return (
    <div className="space-y-6 pb-4">
      <NavBar title="Exercise Library" back="/rehab" trailing={<GlassButton label="New exercise" to="/rehab/exercises/new"><Plus size={24} strokeWidth={2.2} /></GlassButton>} />

      <Section className="space-y-3">
        <label className="flex h-10 items-center gap-2 rounded-full bg-fill px-3.5 text-muted">
          <Search size={17} />
          <input
            type="search"
            className="w-full bg-transparent text-ink outline-none placeholder:text-muted"
            placeholder="Search exercises or body region"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search exercises"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search" className="flex h-5 w-5 items-center justify-center rounded-full bg-faint text-surface">
              <X size={12} strokeWidth={3} />
            </button>
          )}
        </label>
        <Chips options={[...CATEGORIES]} value={category} onChange={setCategory} />
      </Section>

      {sections.length === 0 && <p className="px-5 text-muted">No exercises match{q ? ` “${query}”` : ''}.</p>}

      {sections.map((c) => (
        <Section key={c.value} title={c.label} footer={c.value !== 'rehab' && open.length ? '“Ask physio” marks exercises that load one of your injuries heavily; “Adjust” ones have a tip for it.' : undefined}>
          <Group>
            {matches
              .filter((e) => categoryOf(e) === c.value)
              .map((e) => {
                const cautions = cautionsFor(e.id, open)
                const avoid = cautions.some((x) => x.level === 'avoid')
                return (
                  <Row
                    key={e.id}
                    title={e.name}
                    subtitle={[e.category === 'cardio' ? 'Minutes' : e.mode === 'time' ? 'Timed hold' : 'Reps', e.bodyRegion !== 'Other' && e.bodyRegion, e.equipment].filter(Boolean).join(' · ')}
                    value={
                      <span className="flex items-center gap-1.5">
                        {cautions.length > 0 && (
                          <span className={`rounded-full px-2 py-0.5 text-[0.75rem] font-semibold ${avoid ? 'bg-danger/12 text-danger' : 'bg-tile-orange/15 text-tile-orange'}`} data-testid={`caution-${e.id}`}>
                            {avoid ? 'Ask physio' : 'Adjust'}
                          </span>
                        )}
                        {inPlan.has(e.id) && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.75rem] font-semibold text-accent">In Plan</span>}
                      </span>
                    }
                    to={`/rehab/exercises/${e.id}`}
                  />
                )
              })}
          </Group>
        </Section>
      ))}
    </div>
  )
}
