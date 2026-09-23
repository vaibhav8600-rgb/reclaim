import { useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { useExercises, usePrescriptions } from '../../db/hooks'
import { GlassButton, Group, NavBar, Row, Section } from '../../components/ui'
import { BODY_REGIONS } from '../../lib/constants'

export function LibraryPage() {
  const exercises = useExercises()
  const prescriptions = usePrescriptions()
  const [query, setQuery] = useState('')
  if (!exercises || !prescriptions) return null

  const inPlan = new Set(prescriptions.map((p) => p.exerciseId))
  const q = query.trim().toLowerCase()
  const matches = exercises.filter((e) => !q || e.name.toLowerCase().includes(q) || e.bodyRegion.toLowerCase().includes(q))
  const regions = [...new Set(matches.map((e) => e.bodyRegion))].sort((a, b) => BODY_REGIONS.indexOf(a) - BODY_REGIONS.indexOf(b))

  return (
    <div className="space-y-6 pb-4">
      <NavBar title="Exercise Library" back="/rehab" trailing={<GlassButton label="New exercise" to="/rehab/exercises/new"><Plus size={24} strokeWidth={2.2} /></GlassButton>} />

      <Section>
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
      </Section>

      {regions.length === 0 && <p className="px-5 text-muted">No exercises match “{query}”.</p>}

      {regions.map((region) => (
        <Section key={region} title={region}>
          <Group>
            {matches
              .filter((e) => e.bodyRegion === region)
              .map((e) => (
                <Row
                  key={e.id}
                  title={e.name}
                  subtitle={[e.mode === 'time' ? 'Timed hold' : 'Reps', e.equipment].filter(Boolean).join(' · ')}
                  value={inPlan.has(e.id) ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.75rem] font-semibold text-accent">In Plan</span> : undefined}
                  to={`/rehab/exercises/${e.id}`}
                />
              ))}
          </Group>
        </Section>
      ))}
    </div>
  )
}
