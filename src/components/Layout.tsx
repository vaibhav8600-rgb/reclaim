import { useState, type MouseEvent } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { Bandage, CalendarDays, Dumbbell, HeartPulse, Plus } from 'lucide-react'
import { useGo } from '../lib/nav'
import { QuickLogSheet } from './QuickLogSheet'

const tabs = [
  { to: '/', label: 'Today', icon: HeartPulse },
  { to: '/rehab', label: 'Rehab', icon: Dumbbell },
  { to: '/timeline', label: 'Timeline', icon: CalendarDays },
  { to: '/injuries', label: 'Injuries', icon: Bandage },
]

/** Bottom offset shared by the tab bar and toasts: sits just above the home indicator. */
export const TAB_BAR_BOTTOM = 'max(0.75rem, calc(env(safe-area-inset-bottom, 0px) - 0.5rem))'

const activeTab = (path: string) => {
  if (path.startsWith('/documents')) path = '/injuries' // Medical Records lives under Injuries
  if (path.startsWith('/nutrition')) path = '/' // Nutrition opens from Today
  return tabs.findIndex((t) => (t.to === '/' ? path === '/' : path === t.to || path.startsWith(`${t.to}/`)))
}

export function Layout() {
  const [logOpen, setLogOpen] = useState(false)
  const { pathname } = useLocation()
  const go = useGo()
  const active = activeTab(pathname)

  function switchTab(e: MouseEvent, to: string) {
    e.preventDefault()
    if (to === pathname) window.scrollTo({ top: 0, behavior: 'smooth' }) // tap the current tab: scroll to top, as in iOS
    else go(to, 'tab')
  }

  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <main className="pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
        <Outlet context={{ openLog: () => setLogOpen(true) }} />
      </main>

      {/* iOS 26 floating Liquid Glass tab bar, with the primary action as a separate button */}
      <nav className="tabbar fixed inset-x-0 z-30 mx-auto flex max-w-xl items-center gap-3 px-4" style={{ bottom: TAB_BAR_BOTTOM }}>
        <div className="glass relative flex h-[3.875rem] flex-1 items-center rounded-full p-1">
          {/* Selection lens slides between tabs */}
          <span
            aria-hidden
            className="absolute top-1 bottom-1 left-1 rounded-full bg-fill transition-[transform,opacity] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{ width: `calc((100% - 0.5rem) / ${tabs.length})`, transform: `translateX(${Math.max(active, 0) * 100}%)`, opacity: active < 0 ? 0 : 1 }}
          />
          {tabs.map((t, i) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              onClick={(e) => switchTab(e, t.to)}
              className={`relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[0.625rem] font-semibold transition-colors duration-300 ${i === active ? 'text-accent' : 'text-ink'}`}
            >
              <t.icon size={23} strokeWidth={i === active ? 2.3 : 1.8} />
              {t.label}
            </NavLink>
          ))}
        </div>
        <button
          onClick={() => setLogOpen(true)}
          aria-label="Quick log"
          className="flex h-[3.875rem] w-[3.875rem] shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_10px_24px_-6px_var(--color-accent),inset_0_1px_0_rgb(255_255_255/0.35)] transition active:scale-90"
        >
          <Plus size={30} strokeWidth={2.4} className={`transition-transform duration-300 ${logOpen ? 'rotate-45' : ''}`} />
        </button>
      </nav>

      <QuickLogSheet open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  )
}
