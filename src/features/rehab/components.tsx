import { ChevronRight, Dumbbell, Play } from 'lucide-react'
import type { Exercise, Injury, Prescription } from '../../db/db'
import { useMeta, usePrescriptions, useSessions } from '../../db/hooks'
import { MLink } from '../../components/MLink'
import { IconTile, ProgressRing } from '../../components/ui'
import { severityBucket } from '../../lib/constants'
import { DRAFT_KEY, formatFrequency, formatTarget, startOfWeek, todayAdherence, weeklyAdherence, type SessionDraft } from '../../lib/rehab'

/** One-row 0–10 scale (or 0–max) for pain before/after a session. Tap the selected value again to clear. */
export function CompactScale({ label, value, onChange, max = 10, min = 0 }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; max?: number; min?: number }) {
  return (
    <div>
      <span className="section-label block">{label}</span>
      <div className="flex justify-between gap-1" role="radiogroup" aria-label={label}>
        {Array.from({ length: max - min + 1 }, (_, k) => k + min).map((n) => {
          const selected = value === n
          const b = severityBucket(n)
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${label} ${n}`}
              onClick={() => onChange(selected ? undefined : n)}
              className={`font-rounded h-[2.1rem] min-w-0 flex-1 rounded-full text-[0.9375rem] font-semibold transition active:scale-90 ${selected ? 'scale-110 shadow-md' : 'bg-fill'}`}
              style={selected ? { background: `var(--color-sev-${b})`, color: `var(--color-sev-${b}-ink)` } : undefined}
            >
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Weekly adherence ring + today's count + start/resume button. Calm wording, no streaks. */
export function WeekCard({ compact = false }: { compact?: boolean }) {
  const prescriptions = usePrescriptions()
  const sessions = useSessions(startOfWeek(Date.now()))
  const draft = useMeta<SessionDraft>(DRAFT_KEY)
  if (!prescriptions || !sessions) return null
  const week = weeklyAdherence(prescriptions, sessions)
  const today = todayAdherence(prescriptions, sessions)
  const pct = week.planned ? Math.round((Math.min(week.done, week.planned) / week.planned) * 100) : 0

  return (
    <div className="card p-4">
      <div className="flex items-center gap-4">
        <ProgressRing value={week.done} max={week.planned} size={compact ? 64 : 76} stroke={compact ? 8 : 10}>
          <span className="font-rounded text-[0.9375rem] font-semibold">{pct}%</span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="text-[0.8125rem] font-semibold text-muted uppercase">This Week</p>
          <p className="font-rounded text-[1.5rem] leading-tight font-semibold" data-testid="week-adherence">
            {week.done} <span className="text-[1rem] font-medium text-muted">of {week.planned} exercises</span>
          </p>
          <p className="text-[0.875rem] text-muted" data-testid="today-adherence">
            Today: {today.done} of {today.planned}
          </p>
        </div>
      </div>
      <MLink to="/rehab/session" className="btn btn-primary mt-4 w-full">
        <Play size={18} fill="currentColor" /> {draft ? 'Resume Session' : 'Start Session'}
      </MLink>
    </div>
  )
}

export function PlanRow({ p, exercise, injury }: { p: Prescription; exercise?: Exercise; injury?: Injury }) {
  const mode = exercise?.mode ?? 'reps'
  return (
    <MLink to={`/rehab/exercises/${p.exerciseId}`} className="cell cell-press">
      <IconTile icon={Dumbbell} color={p.active ? 'green' : 'gray'} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{exercise?.name ?? 'Removed exercise'}</span>
        <span className="block truncate text-[0.875rem] text-muted">
          {formatTarget(p, mode)} · {formatFrequency(p)}
          {injury ? ` · ${injury.name}` : ''}
        </span>
      </span>
      <ChevronRight size={18} className="-mr-1 shrink-0 text-faint" />
    </MLink>
  )
}
