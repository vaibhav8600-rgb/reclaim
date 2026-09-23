import { memo } from 'react'
import { MLink } from './MLink'
import { Bandage, Dumbbell, NotebookPen, Ruler, Utensils } from 'lucide-react'
import type { Injury } from '../db/db'
import type { Entry } from '../db/hooks'
import { injuryPlace, kindInfo, sideLabel, symptomLabel, statusLabel } from '../lib/constants'
import { formatTime } from '../lib/dates'
import { grams, slotLabel } from '../lib/nutrition'
import { IconTile, SeverityBadge } from './ui'
import { DocumentTile, kindOf } from '../features/documents/kinds'

/** Separator inset for lists of EntryRows (aligns hairlines with the text, past the icon). */
export const ENTRY_INSET = '3.75rem'

/** Memoized: long timelines re-render only rows that changed. */
export const EntryRow = memo(function EntryRow({ entry, injuries, hideInjury = false }: { entry: Entry; injuries: Map<string, Injury>; hideInjury?: boolean }) {
  const injuryName = (id?: string) => (hideInjury ? undefined : id ? injuries.get(id)?.name ?? 'Removed injury' : 'General')
  let to: string, icon, title: string, detail: string | undefined

  switch (entry.kind) {
    case 'symptom': {
      const s = entry.item
      to = `/log/symptom?id=${s.id}`
      icon = <SeverityBadge value={s.severity} />
      title = symptomLabel(s.type)
      detail = [injuryName(s.injuryId), s.trigger, s.notes].filter(Boolean).join(' · ')
      break
    }
    case 'measurement': {
      const m = entry.item
      const info = kindInfo(m.kind)
      to = `/log/measurement?id=${m.id}`
      icon = <span className="flex w-9 justify-center"><IconTile icon={Ruler} color="blue" /></span>
      title = `${info.value === 'other' ? m.method || 'Measurement' : info.label} ${m.value}${m.unit === '°' ? '' : ' '}${m.unit}`
      detail = [sideLabel(m.side), m.injuryId && injuryName(m.injuryId), info.value !== 'other' ? m.method : undefined, m.notes].filter(Boolean).join(' · ')
      break
    }
    case 'note': {
      to = `/log/note?id=${entry.item.id}`
      icon = <span className="flex w-9 justify-center"><IconTile icon={NotebookPen} color="orange" /></span>
      title = 'Note'
      detail = entry.item.text
      break
    }
    case 'session': {
      const s = entry.item
      const done = s.items.filter((i) => i.sets.some((x) => x.done)).length
      to = `/rehab/session?id=${s.id}`
      icon = <span className="flex w-9 justify-center"><IconTile icon={Dumbbell} color="green" /></span>
      title = 'Rehab Session'
      detail = [
        `${done} ${done === 1 ? 'exercise' : 'exercises'}`,
        s.painBefore !== undefined && s.painAfter !== undefined ? `pain ${s.painBefore} → ${s.painAfter}` : undefined,
        injuryName(s.injuryId) !== 'General' ? injuryName(s.injuryId) : undefined,
      ].filter(Boolean).join(' · ')
      break
    }
    case 'document': {
      const d = entry.item
      to = `/documents/${d.id}`
      icon = <span className="flex w-9 justify-center"><DocumentTile kind={d.kind} /></span>
      title = d.title
      detail = [kindOf(d.kind).label, d.injuryId && injuryName(d.injuryId)].filter(Boolean).join(' · ')
      break
    }
    case 'meal': {
      const m = entry.item
      to = `/log/meal?id=${m.id}`
      icon = <span className="flex w-9 justify-center"><IconTile icon={Utensils} color="purple" /></span>
      title = m.name
      detail = [
        slotLabel(m.slot),
        `${grams(m.protein)} protein`,
        m.source === 'user_confirmed' ? 'AI estimate, checked' : undefined,
        m.calories !== undefined ? `${Math.round(m.calories)} kcal` : undefined,
      ].filter(Boolean).join(' · ')
      break
    }
    case 'injury': {
      const i = entry.item
      to = `/injuries/${i.id}`
      icon = <span className="flex w-9 justify-center"><IconTile icon={Bandage} color="indigo" /></span>
      title = `Started: ${i.name}`
      detail = `${injuryPlace(i)} · ${statusLabel(i.status)}`
      break
    }
  }

  return (
    <MLink to={to} className={`cell cell-press ${entry.item.createdAt > Date.now() - 4000 ? 'animate-row-in' : ''}`}>
      {icon}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        {detail && <p className="truncate text-[0.875rem] text-muted">{detail}</p>}
      </div>
      {entry.kind !== 'injury' && entry.kind !== 'document' && <span className="shrink-0 text-[0.875rem] text-faint tabular-nums">{formatTime(entry.at)}</span>}
    </MLink>
  )
})
