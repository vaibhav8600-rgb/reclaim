import { useState } from 'react'
import { MLink } from '../../components/MLink'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bandage, ChevronRight, FolderHeart, Plus } from 'lucide-react'
import { db, type Injury, type InjuryStatus } from '../../db/db'
import { isOpenInjury, useDocuments, useInjuries } from '../../db/hooks'
import { alive } from '../../db/repo'
import { EmptyState, GlassButton, Group, IconTile, NavBar, Row, Section, Segmented, SeverityBadge } from '../../components/ui'
import { injuryPlace, statusLabel } from '../../lib/constants'
import { daysBetween, formatShortDate, fromDayKey } from '../../lib/dates'

export function InjuriesPage() {
  const injuries = useInjuries()
  const [tab, setTab] = useState<'open' | 'resolved'>('open')
  const documents = useDocuments()
  if (!injuries) return null

  const list = injuries
    .filter((i) => (tab === 'open' ? isOpenInjury(i) : !isOpenInjury(i)))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))

  return (
    <div>
      <NavBar title="Injuries" trailing={<GlassButton label="Add injury" to="/injuries/new"><Plus size={24} strokeWidth={2.2} /></GlassButton>} />
      <Section className="mb-5">
        <Group inset="3.625rem">
          <Row icon={<IconTile icon={FolderHeart} color="indigo" />} title="Medical Records" value={documents?.length || undefined} to="/documents" />
        </Group>
      </Section>
      <Section className="mb-5">
        <Segmented options={[{ value: 'open', label: 'Current' }, { value: 'resolved', label: 'Resolved' }]} value={tab} onChange={setTab} />
      </Section>
      {list.length ? (
        <Section>
          <Group>
            {list.map((i) => <InjuryRow key={i.id} injury={i} />)}
          </Group>
        </Section>
      ) : tab === 'open' ? (
        <EmptyState
          icon={Bandage}
          title="No current injuries"
          body="Add an injury, condition or surgery you're recovering from."
          action={<MLink to="/injuries/new" className="btn btn-primary"><Plus size={20} /> Add Injury</MLink>}
        />
      ) : (
        <EmptyState icon={Bandage} title="Nothing resolved yet" body="Injuries you mark as resolved will appear here." />
      )}
    </div>
  )
}

function InjuryRow({ injury }: { injury: Injury }) {
  const latest = useLiveQuery(
    async () =>
      (await db.symptoms.where('injuryId').equals(injury.id).toArray())
        .filter((s) => alive(s) && s.type === 'pain')
        .sort((a, b) => b.recordedAt - a.recordedAt)[0],
    [injury.id],
  )
  const days = daysBetween(fromDayKey(injury.startDate), Date.now())
  return (
    <MLink to={`/injuries/${injury.id}`} className="cell cell-press !py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold">{injury.name}</p>
          <StatusPill status={injury.status} />
        </div>
        <p className="truncate text-[0.875rem] text-muted">
          {injuryPlace(injury)} · since {formatShortDate(fromDayKey(injury.startDate))} · day {days + 1}
        </p>
      </div>
      {latest && <SeverityBadge value={latest.severity} size="sm" />}
      <ChevronRight size={18} className="-mr-1 text-faint" />
    </MLink>
  )
}

export function StatusPill({ status }: { status: InjuryStatus }) {
  const tone = status === 'resolved' || status === 'improving' ? 'bg-accent-soft text-accent' : 'bg-fill text-muted'
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.75rem] font-semibold ${tone}`}>{statusLabel(status)}</span>
}
