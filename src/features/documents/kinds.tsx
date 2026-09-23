import { Dumbbell, FileText, FlaskConical, Mail, Pill, ScanLine } from 'lucide-react'
import type { DocumentKind, MedicalDocument } from '../../db/db'
import { MLink } from '../../components/MLink'
import { IconTile } from '../../components/ui'
import { formatMediumDate, fromDayKey } from '../../lib/dates'
import { formatBytes } from '../../lib/platform'

export const DOCUMENT_KINDS: { value: DocumentKind; label: string; icon: typeof FileText; color: string }[] = [
  { value: 'imaging', label: 'Scan / Imaging', icon: ScanLine, color: 'indigo' },
  { value: 'lab', label: 'Lab Report', icon: FlaskConical, color: 'pink' },
  { value: 'prescription', label: 'Prescription', icon: Pill, color: 'orange' },
  { value: 'letter', label: 'Clinic Letter', icon: Mail, color: 'blue' },
  { value: 'physio', label: 'Physio Notes', icon: Dumbbell, color: 'green' },
  { value: 'other', label: 'Other', icon: FileText, color: 'gray' },
]

export const kindOf = (k: DocumentKind) => DOCUMENT_KINDS.find((x) => x.value === k) ?? DOCUMENT_KINDS[DOCUMENT_KINDS.length - 1]

export function DocumentTile({ kind }: { kind: DocumentKind }) {
  const k = kindOf(kind)
  return <IconTile icon={k.icon} color={k.color} />
}

export function DocumentRow({ doc, injuryName }: { doc: MedicalDocument; injuryName?: string }) {
  return (
    <MLink to={`/documents/${doc.id}`} className="cell cell-press">
      <DocumentTile kind={doc.kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{doc.title}</span>
        <span className="block truncate text-[0.875rem] text-muted">
          {[kindOf(doc.kind).label, formatMediumDate(fromDayKey(doc.date)), injuryName, formatBytes(doc.size)].filter(Boolean).join(' · ')}
        </span>
      </span>
    </MLink>
  )
}

/** Files people add: PDFs and photos/scans. iOS offers camera, photo library and Files. */
export const DOCUMENT_ACCEPT = 'application/pdf,image/*'
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
