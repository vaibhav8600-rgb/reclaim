import type { FormEvent, ReactNode } from 'react'
import type { Injury } from '../../db/db'
import { DateRow, Group, SheetHeader } from '../../components/ui'
import { formatWhen, fromLocalInput, toLocalInput } from '../../lib/dates'
import { supportsViewTransitions } from '../../lib/transitions'

/** Full-screen sheet form: slides up, ✕/✓ header, grouped content. */
export function SheetForm({ title, canSave, onSubmit, onClose, children }: {
  title: string
  canSave: boolean
  onSubmit: () => void
  onClose: () => void
  children: ReactNode
}) {
  function submit(e: FormEvent) {
    e.preventDefault()
    if (canSave) onSubmit()
  }
  return (
    <form onSubmit={submit} className={`${supportsViewTransitions() ? '' : 'animate-sheet '}mx-auto min-h-dvh max-w-xl bg-bg pb-[calc(3rem+env(safe-area-inset-bottom))]`}>
      <SheetHeader title={title} canSave={canSave} onClose={onClose} />
      <div className="space-y-6 px-4 pt-4">{children}</div>
    </form>
  )
}

/** Time row — defaults to now; tap to open the native date & time picker. */
export function WhenRow({ value, onChange }: { value: number; onChange: (ms: number) => void }) {
  return (
    <DateRow
      label="Time"
      type="datetime-local"
      value={toLocalInput(value)}
      max={toLocalInput(Date.now())}
      display={formatWhen(value)}
      onChange={(v) => onChange(fromLocalInput(v))}
    />
  )
}

export function InjuryPicker({ injuries, value, onChange, noneLabel = 'General' }: { injuries: Injury[]; value: string | undefined; onChange: (id: string | undefined) => void; noneLabel?: string }) {
  if (!injuries.length) return null
  return (
    <div>
      <span className="section-label block">For</span>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {injuries.map((i) => (
          <button key={i.id} type="button" className="chip" aria-pressed={value === i.id} onClick={() => onChange(i.id)}>
            {i.name}
          </button>
        ))}
        <button type="button" className="chip" aria-pressed={!value} onClick={() => onChange(undefined)}>
          {noneLabel}
        </button>
      </div>
    </div>
  )
}

/** Destructive action in its own group at the end of a form, as in iOS. */
export function DeleteRow({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <Group>
      <button type="button" onClick={onDelete} className="cell cell-press justify-center text-danger">
        {label}
      </button>
    </Group>
  )
}
