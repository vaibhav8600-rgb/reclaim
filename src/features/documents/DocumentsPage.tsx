import { useState } from 'react'
import { FolderHeart, Plus } from 'lucide-react'
import { useDocuments, useInjuryMap } from '../../db/hooks'
import { MLink } from '../../components/MLink'
import { Chips, EmptyState, GlassButton, Group, NavBar, Section } from '../../components/ui'
import { DOCUMENT_KINDS, DocumentRow } from './kinds'
import type { DocumentKind } from '../../db/db'

export function DocumentsPage() {
  const docs = useDocuments()
  const injuries = useInjuryMap()
  const [kind, setKind] = useState<DocumentKind | 'all'>('all')
  if (!docs) return null

  const shown = kind === 'all' ? docs : docs.filter((d) => d.kind === kind)
  const years = [...new Set(shown.map((d) => d.date.slice(0, 4)))]

  return (
    <div className="space-y-6 pb-4">
      <NavBar title="Medical Records" back="/injuries" trailing={<GlassButton label="Add document" to="/documents/new"><Plus size={24} strokeWidth={2.2} /></GlassButton>} />

      {docs.length === 0 ? (
        <EmptyState
          icon={FolderHeart}
          title="Keep your records together"
          body="Add scans, lab reports, prescriptions and clinic letters. They stay on this iPhone and, if you connect Google Drive, are backed up encrypted."
          action={<MLink to="/documents/new" className="btn btn-primary"><Plus size={20} /> Add Document</MLink>}
        />
      ) : (
        <>
          <Section>
            <Chips options={[{ value: 'all' as const, label: 'All' }, ...DOCUMENT_KINDS.filter((k) => docs.some((d) => d.kind === k.value))]} value={kind} onChange={setKind} />
          </Section>
          {years.map((y) => (
            <Section key={y} title={y}>
              <Group inset="3.625rem">
                {shown.filter((d) => d.date.startsWith(y)).map((d) => (
                  <DocumentRow key={d.id} doc={d} injuryName={d.injuryId ? injuries.get(d.injuryId)?.name : undefined} />
                ))}
              </Group>
            </Section>
          ))}
        </>
      )}
    </div>
  )
}
