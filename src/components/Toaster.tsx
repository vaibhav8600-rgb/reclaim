import { CheckCircle2 } from 'lucide-react'
import { dismissToast, useToast } from '../lib/toast'
import { TAB_BAR_BOTTOM } from './Layout'

/** Glass confirmation capsule above the tab bar, with an optional Undo. */
export function Toaster() {
  const t = useToast()
  if (!t) return null
  return (
    <div className="toast pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4" style={{ bottom: `calc(${TAB_BAR_BOTTOM} + 4.625rem)` }}>
      <div key={t.id} role="status" className="glass animate-pop pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full py-2 pr-2 pl-3.5">
        <CheckCircle2 size={20} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">{t.message}</span>
        {t.action && (
          <button
            className="shrink-0 rounded-full bg-fill px-3.5 py-1.5 text-[0.9375rem] font-semibold text-accent"
            onClick={() => {
              t.action!.onClick()
              dismissToast()
            }}
          >
            {t.action.label}
          </button>
        )}
      </div>
    </div>
  )
}
