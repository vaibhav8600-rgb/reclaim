import { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'
import { haptic } from '../../lib/haptics'

/** Counts down the rest after a set, floating above the keyboard area; a buzz and "Go" when it's up. */
export function RestTimer({ until, onAdd, onDone }: { until: number; onAdd: (seconds: number) => void; onDone: () => void }) {
  const [now, setNow] = useState(Date.now())
  const left = Math.max(0, Math.ceil((until - now) / 1000))

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (left > 0) return
    haptic()
    const id = setTimeout(onDone, 2500) // "Go" stays up briefly, then the bar goes
    return () => clearTimeout(id)
  }, [left === 0]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="animate-pop fixed inset-x-3 z-40 mx-auto flex max-w-xl items-center gap-3 rounded-full bg-ink px-4 py-2.5 text-bg shadow-2xl" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }} role="timer" aria-live="polite" data-testid="rest-timer">
      <Timer size={20} />
      <span className="font-rounded min-w-0 flex-1 text-[1.0625rem] font-semibold tabular-nums">{left > 0 ? `Rest ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Go — next set'}</span>
      {left > 0 && (
        <>
          <button type="button" className="rounded-full bg-bg/15 px-3 py-1 text-[0.875rem] font-semibold" onClick={() => onAdd(15)}>+15 s</button>
          <button type="button" className="rounded-full bg-bg/15 px-3 py-1 text-[0.875rem] font-semibold" onClick={onDone}>Skip</button>
        </>
      )}
    </div>
  )
}
