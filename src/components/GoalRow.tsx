import { useState, type ReactNode } from 'react'
import { db, type Profile } from '../db/db'
import { save } from '../db/repo'
import { toast } from '../lib/toast'

export type GoalField = 'proteinTarget' | 'waterTarget' | 'stepsTarget' | 'sleepTarget' | 'weightGoal' | 'height'

/** One editable number on the profile (a goal, or the height): saved when you leave the field, with Undo. */
export function GoalRow({ field, label, unit, value, decimals = false, placeholder = 'None', icon }: {
  field: GoalField
  icon?: ReactNode
  label: string
  unit: string
  value?: number
  decimals?: boolean
  placeholder?: string
}) {
  const [typed, setTyped] = useState<string>()
  const shown = typed ?? (value !== undefined ? String(value) : '')

  async function commit() {
    if (typed === undefined) return
    const n = parseFloat(typed.replace(',', '.'))
    const next = Number.isFinite(n) && n > 0 ? (decimals ? Math.round(n * 10) / 10 : Math.round(n)) : undefined
    setTyped(undefined)
    if (next === value) return
    const me = await db.profile.get('me')
    await save(db.profile, { id: 'me', name: me?.name ?? '', [field]: next } as Partial<Profile> & { name: string })
    toast(next !== undefined ? `${label}: ${next.toLocaleString()}${unit ? ` ${unit}` : ''}` : `${label} removed`, {
      label: 'Undo',
      onClick: () => save(db.profile, { id: 'me', name: me?.name ?? '', [field]: value } as Partial<Profile> & { name: string }),
    })
  }

  return (
    <label className="cell">
      {icon}
      <span className="flex-1">{label}</span>
      <input
        className="font-rounded w-24 bg-transparent text-right font-semibold outline-none placeholder:font-normal placeholder:text-faint"
        inputMode={decimals ? 'decimal' : 'numeric'}
        value={shown}
        onChange={(e) => setTyped(e.target.value.replace(decimals ? /[^\d.,]/g : /[^\d]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        placeholder={placeholder}
        aria-label={unit ? `${label} (${unit})` : label}
      />
      <span className="w-8 text-muted">{unit}</span>
    </label>
  )
}
