import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useGo } from '../lib/nav'
import { Activity, Dumbbell, FolderHeart, NotebookPen, Ruler, Utensils, X } from 'lucide-react'
import { db } from '../db/db'
import { isOpenInjury, useInjuries, useMeta } from '../db/hooks'
import { save, setMeta, softDelete } from '../db/repo'
import { requestPersistence } from '../lib/platform'
import { severityWord } from '../lib/constants'
import { haptic } from '../lib/haptics'
import { toast } from '../lib/toast'
import { SeverityPicker } from './SeverityPicker'
import { IconTile } from './ui'

const GENERAL = '__general'
const EASE = 'cubic-bezier(0.32,0.72,0,1)'

/** The 5-second log: pick the injury (remembered), tap a number, done. Swipe down to dismiss. */
export function QuickLogSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useGo()
  const injuries = useInjuries()?.filter(isOpenInjury)
  const lastInjuryId = useMeta<string>('lastInjuryId')
  const [injuryId, setInjuryId] = useState<string>()
  const [drag, setDrag] = useState(0)
  const [closing, setClosing] = useState(false)
  const dragStart = useRef<number | null>(null)

  const selected = injuryId ?? injuries?.find((i) => i.id === lastInjuryId)?.id ?? injuries?.[0]?.id ?? GENERAL

  useEffect(() => {
    if (!open) {
      setInjuryId(undefined)
      setDrag(0)
      setClosing(false)
    }
  }, [open])

  if (!open) return null

  /** Slide down, then unmount. */
  function dismiss() {
    if (closing) return
    setClosing(true)
    setTimeout(onClose, 280)
  }

  async function logPain(severity: number) {
    haptic()
    const id = await save(db.symptoms, {
      type: 'pain',
      severity,
      injuryId: selected === GENERAL ? undefined : selected,
      recordedAt: Date.now(),
      source: 'user',
    })
    if (selected !== GENERAL) setMeta('lastInjuryId', selected)
    void requestPersistence()
    dismiss()
    const where = injuries?.find((i) => i.id === selected)?.name
    toast(`Pain ${severity} · ${severityWord(severity)}${where ? ` — ${where}` : ''}`, {
      label: 'Undo',
      onClick: () => softDelete(db.symptoms, id),
    })
  }

  function go(path: string) {
    onClose()
    nav(path, 'sheet-up')
  }

  const onDown = (e: PointerEvent) => {
    dragStart.current = e.clientY
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => dragStart.current !== null && setDrag(Math.max(0, e.clientY - dragStart.current))
  const onUp = () => {
    dragStart.current = null
    if (drag > 90) dismiss()
    else setDrag(0)
  }

  const injuryParam = selected === GENERAL ? '' : `?injury=${selected}`
  const dragging = dragStart.current !== null

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Quick log">
      <div
        className="animate-fade absolute inset-0 bg-black/30"
        onClick={dismiss}
        style={{ opacity: closing ? 0 : 1 - drag / 400, transition: dragging ? 'none' : `opacity 0.28s ${EASE}` }}
      />
      <div
        className="animate-sheet absolute inset-x-2 mx-auto max-w-xl rounded-[2.25rem] bg-bg shadow-2xl"
        style={{
          bottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))',
          transform: closing ? 'translateY(110%)' : drag ? `translateY(${drag}px)` : undefined,
          transition: dragging ? 'none' : `transform 0.28s ${EASE}`,
        }}
      >
        <div className="touch-none cursor-grab pt-2" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="mx-auto h-1.5 w-9 rounded-full bg-faint/50" />
          <div className="flex items-start justify-between px-5 pt-3">
            <div>
              <h2 className="text-[1.375rem] font-bold">Log Pain</h2>
              <p className="text-[0.9375rem] text-muted">Tap a number — it saves instantly.</p>
            </div>
            <button onClick={dismiss} onPointerDown={(e) => e.stopPropagation()} className="flex h-9 w-9 items-center justify-center rounded-full bg-fill text-muted" aria-label="Close">
              <X size={18} strokeWidth={2.6} />
            </button>
          </div>
        </div>

        <div className="px-4 pt-4 pb-4">
          {!!injuries?.length && (
            <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
              {[...injuries.map((i) => ({ value: i.id, label: i.name })), { value: GENERAL, label: 'General' }].map((o) => (
                <button key={o.value} className="chip" aria-pressed={o.value === selected} onClick={() => setInjuryId(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          )}

          <SeverityPicker value={undefined} onChange={logPain} />

          {/* Shortcuts as a compact grid (like Control Center), so the sheet stays around half the screen. */}
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              { icon: Dumbbell, color: 'green', label: 'Rehab Session', to: `/rehab/session${injuryParam}` },
              { icon: Activity, color: 'pink', label: 'Symptom Details', to: `/log/symptom${injuryParam}` },
              { icon: Ruler, color: 'blue', label: 'Measurement', to: `/log/measurement${injuryParam}` },
              { icon: Utensils, color: 'purple', label: 'Meal', to: '/log/meal' },
              { icon: NotebookPen, color: 'orange', label: 'Note', to: '/log/note' },
              { icon: FolderHeart, color: 'indigo', label: 'Document', to: `/documents/new${injuryParam}` },
            ].map((s) => (
              <button key={s.label} onClick={() => go(s.to)} className="card flex flex-col items-center gap-1.5 px-1 pt-3 pb-2.5 transition active:scale-95">
                <IconTile icon={s.icon} color={s.color} />
                <span className="text-[0.8125rem] leading-tight font-medium">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
