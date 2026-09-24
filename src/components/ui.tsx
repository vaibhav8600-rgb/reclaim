import { useEffect, useRef, useState, type ReactNode, type ComponentType } from 'react'
import { MLink } from './MLink'
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown, UserRound, X } from 'lucide-react'
import { severityBucket } from '../lib/constants'
import { useBack } from '../lib/nav'

type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

/* ───────────────────────── Navigation ───────────────────────── */

/** iOS large-title navigation bar: the title collapses into a glass bar as the page scrolls. */
export function NavBar({ title, subtitle, back, trailing }: { title: string; subtitle?: string; back?: string; trailing?: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const goBack = useBack(back)

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), {
      rootMargin: `-${bar.current?.offsetHeight ?? 44}px 0px 0px 0px`,
    })
    if (sentinel.current) io.observe(sentinel.current)
    return () => io.disconnect()
  }, [])

  return (
    <>
      <div ref={bar} className={`sticky top-0 z-20 pt-safe transition-[background-color] duration-200 ${scrolled ? 'nav-scrolled' : ''}`}>
        <div className="relative flex h-13 items-center justify-between gap-2 px-4">
          <div className="flex flex-1 items-center">
            {back && (
              <GlassButton label="Back" onClick={goBack}>
                <ChevronLeft size={24} strokeWidth={2.2} />
              </GlassButton>
            )}
          </div>
          <p
            className={`pointer-events-none absolute left-1/2 max-w-[55%] -translate-x-1/2 truncate font-semibold transition-opacity duration-200 ${scrolled ? 'opacity-100' : 'opacity-0'}`}
            aria-hidden={!scrolled}
          >
            {title}
          </p>
          <div className="flex flex-1 items-center justify-end gap-2">{trailing}</div>
        </div>
      </div>
      <header className="px-4 pt-1 pb-3">
        <h1 className="text-[2rem] leading-[1.15] font-bold tracking-[0.01em]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-muted">{subtitle}</p>}
        <div ref={sentinel} />
      </header>
    </>
  )
}

/** iOS 26 bar button: a glass circle (icon) or capsule (text). `prominent` fills it with the tint. */
export function GlassButton({ children, label, onClick, to, prominent, disabled, type = 'button' }: {
  children: ReactNode
  label: string
  onClick?: () => void
  to?: string
  prominent?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  const cls = `inline-flex h-11 min-w-11 items-center justify-center rounded-full px-2.5 font-semibold transition active:scale-95 ${
    prominent ? (disabled ? 'bg-fill text-faint' : 'bg-accent text-accent-ink shadow-md') : 'glass text-ink'
  }`
  if (to) return <MLink to={to} aria-label={label} className={cls}>{children}</MLink>
  return <button type={type} aria-label={label} onClick={onClick} disabled={disabled} className={cls}>{children}</button>
}

/** Header for sheet-style screens (forms): ✕ to cancel, ✓ to confirm, as in iOS 26. */
export function SheetHeader({ title, canSave, onClose }: { title: string; canSave: boolean; onClose: () => void }) {
  return (
    <header className="nav-scrolled sticky top-0 z-20 pt-safe">
      <div className="relative flex h-14 items-center justify-between px-4">
        <GlassButton label="Cancel" onClick={onClose}><X size={22} strokeWidth={2.2} /></GlassButton>
        <h1 className="absolute left-1/2 -translate-x-1/2 font-semibold">{title}</h1>
        <GlassButton label="Save" type="submit" prominent disabled={!canSave}><Check size={22} strokeWidth={2.6} /></GlassButton>
      </div>
    </header>
  )
}

/* ───────────────────────── Layout ───────────────────────── */

/** A content section. `prominent` = Health-style bold heading; otherwise an iOS grouped-list header. */
export function Section({ title, action, footer, prominent, children, className = '' }: {
  title?: string
  action?: ReactNode
  footer?: ReactNode
  prominent?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`px-4 ${className}`}>
      {(title || action) &&
        (prominent ? (
          <div className="mb-2 flex items-end justify-between px-1">
            <h2 className="text-[1.25rem] leading-tight font-bold">{title}</h2>
            {action}
          </div>
        ) : (
          <div className="flex items-end justify-between">
            <h2 className="section-label">{title}</h2>
            {action}
          </div>
        ))}
      {children}
      {footer && <p className="section-footer">{footer}</p>}
    </section>
  )
}

/** Inset grouped list container. `inset` is where separators start (aligns with row text). */
export function Group({ children, inset = '1rem', className = '' }: { children: ReactNode; inset?: string; className?: string }) {
  return (
    <div className={`card rows overflow-hidden ${className}`} style={{ ['--inset' as string]: inset }}>
      {children}
    </div>
  )
}

/** A list row: optional leading tile, title/subtitle, trailing value, chevron when it navigates. */
export function Row({ icon, title, subtitle, value, to, onClick, tone, chevron = !!to }: {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  value?: ReactNode
  to?: string
  onClick?: () => void
  tone?: 'accent' | 'danger'
  chevron?: boolean
}) {
  const color = tone === 'accent' ? 'text-accent' : tone === 'danger' ? 'text-danger' : ''
  const inner = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${color}`}>{title}</span>
        {subtitle && <span className="block truncate text-[0.875rem] text-muted">{subtitle}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-muted">{value}</span>}
      {chevron && <ChevronRight size={18} className="-mr-1 shrink-0 text-faint" />}
    </>
  )
  if (to) return <MLink to={to} className="cell cell-press">{inner}</MLink>
  if (onClick) return <button type="button" onClick={onClick} className="cell cell-press">{inner}</button>
  return <div className="cell">{inner}</div>
}

/** Row whose value opens the native iOS picker (wheel/menu). */
export function PickerRow<T extends string>({ label, value, options, onChange, placeholder = 'Choose' }: {
  label: string
  value: T | undefined
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  placeholder?: string
}) {
  const current = options.find((o) => o.value === value)?.label
  return (
    <label className="cell cell-press relative">
      <span className="flex-1">{label}</span>
      <span className={`flex items-center gap-1 ${current ? 'text-muted' : 'text-faint'}`}>
        {current ?? placeholder}
        <ChevronsUpDown size={15} />
      </span>
      <select className="absolute inset-0 opacity-0" value={value ?? ''} onChange={(e) => onChange(e.target.value as T)} aria-label={label}>
        {!value && <option value="" disabled>{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

/** Row with a native date/time input, shown as a tinted capsule like UIDatePicker's compact style. */
export function DateRow({ label, type, value, display, max, onChange }: {
  label: string
  type: 'date' | 'datetime-local'
  value: string
  display: string
  max?: string
  onChange: (v: string) => void
}) {
  return (
    <label className="cell relative">
      <span className="flex-1">{label}</span>
      <span className="rounded-lg bg-fill px-2.5 py-1 text-[0.9375rem]">{display}</span>
      <input type={type} className="absolute inset-0 opacity-0" value={value} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label={label} />
    </label>
  )
}

/** A single form field presented as its own grouped section: header, cell, footer. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="section-label block">{label}</span>
      {children}
      {hint && <span className="section-footer block">{hint}</span>}
    </label>
  )
}

/** Coloured rounded-square icon, as in iOS Settings. */
export function IconTile({ icon: I, color, size = 'md' }: { icon: Icon; color: string; size?: 'md' | 'lg' }) {
  return (
    <span className={`icon-tile ${size === 'lg' ? '!h-10 !w-10 !rounded-[0.7rem]' : ''}`} style={{ background: `var(--color-tile-${color})` }}>
      <I size={size === 'lg' ? 22 : 18} strokeWidth={2.2} />
    </span>
  )
}

/* ───────────────────────── Controls ───────────────────────── */

export function Chips<T extends string>({ options, value, onChange, wrap = false }: { options: { value: T; label: string }[]; value: T | undefined; onChange: (v: T) => void; wrap?: boolean }) {
  return (
    <div className={`flex gap-2 ${wrap ? 'flex-wrap' : 'no-scrollbar -mx-4 overflow-x-auto px-4'}`}>
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** iOS segmented control; the selected thumb slides between segments. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const index = options.findIndex((o) => o.value === value)
  return (
    <div className="relative flex w-full rounded-full bg-fill p-0.5" role="radiogroup">
      <span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 left-0.5 rounded-full bg-surface shadow-[0_2px_6px_rgb(0_0_0/0.12)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] dark:bg-[#636366]"
        style={{ width: `calc((100% - 0.25rem) / ${options.length})`, transform: `translateX(${Math.max(index, 0) * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className="relative h-8 flex-1 rounded-full text-[0.8125rem] font-semibold"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** iOS stepper: value with − / + buttons. */
export function Stepper({ label, value, onChange, min = 0, max = 999, step = 1, unit }: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
}) {
  const btn = 'flex h-8 w-11 items-center justify-center text-[1.25rem] font-medium text-ink disabled:text-faint active:bg-fill'
  return (
    <div className="cell">
      <span className="flex-1">{label}</span>
      <span className="font-rounded min-w-12 text-right text-[1.0625rem] font-semibold tabular-nums" aria-live="polite">
        {value}
        {unit && <span className="ml-0.5 text-[0.875rem] font-medium text-muted">{unit}</span>}
      </span>
      <span className="flex divide-x divide-line overflow-hidden rounded-lg bg-fill">
        <button type="button" className={btn} aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}>−</button>
        <button type="button" className={btn} aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))}>+</button>
      </span>
    </div>
  )
}

/** iOS switch. */
export function Toggle({ label, checked, onChange, icon }: { label: string; checked: boolean; onChange: (v: boolean) => void; icon?: ReactNode }) {
  return (
    <label className="cell cursor-pointer">
      {icon}
      <span className="flex-1">{label}</span>
      <input type="checkbox" role="switch" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`relative h-[1.9rem] w-[3.1rem] shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-tile-green' : 'bg-surface-2'}`}>
        <span className={`absolute top-0.5 left-0.5 h-[1.65rem] w-[1.65rem] rounded-full bg-white shadow-md transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${checked ? 'translate-x-[1.2rem]' : ''}`} />
      </span>
    </label>
  )
}

/** Activity-style progress ring; animates as progress changes. */
/** A ring that fills towards a target. `color` is a CSS colour (the accent by default); the track is a faint tint of it. */
export function ProgressRing({ value, max, size = 64, stroke = 8, color = 'var(--color-accent)', children }: { value: number; max: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct)) // start empty, then fill
    return () => cancelAnimationFrame(id)
  }, [pct])
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color === 'var(--color-accent)' ? 'var(--color-accent-soft)' : `color-mix(in srgb, ${color} 18%, transparent)`} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.32,0.72,0,1)' }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  )
}

/** Severity number on the sequential warm ramp. The number is always shown, so colour never carries it alone. */
export function SeverityBadge({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const b = severityBucket(value)
  const dims = size === 'lg' ? 'h-14 w-14 text-2xl' : size === 'sm' ? 'h-7 w-7 text-sm' : 'h-9 w-9 text-[1.0625rem]'
  return (
    <span
      className={`font-rounded inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${dims}`}
      style={{ background: `var(--color-sev-${b})`, color: `var(--color-sev-${b}-ink)` }}
    >
      {Number.isInteger(value) ? value : value.toFixed(1)}
    </span>
  )
}

/** iOS ContentUnavailableView. */
export function EmptyState({ icon: I, title, body, action }: { icon: Icon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-12 text-center">
      <I size={52} strokeWidth={1.5} className="mb-4 text-faint" />
      <h3 className="text-[1.25rem] font-bold">{title}</h3>
      <p className="mt-1.5 max-w-xs text-muted">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/** A dismissible tip card with a coloured tile, like iOS suggestions. */
export function Tip({ icon, color, title, body, to, onDismiss }: { icon: Icon; color: string; title: string; body: string; to?: string; onDismiss?: () => void }) {
  const inner = (
    <div className="flex items-start gap-3 p-4 pr-10">
      <IconTile icon={icon} color={color} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-[0.9375rem] text-muted">{body}</p>
      </div>
    </div>
  )
  return (
    <div className="card relative">
      {to ? <MLink to={to} className="block active:opacity-70">{inner}</MLink> : inner}
      {onDismiss && (
        <button onClick={onDismiss} className="absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-fill text-muted" aria-label="Dismiss">
          <X size={14} strokeWidth={2.6} />
        </button>
      )}
    </div>
  )
}

/** The profile picture: the photo, else the name's initial, else a person symbol. */
export function Avatar({ photo, initial, size }: { photo?: string; initial?: string; size: number }) {
  if (photo) return <img src={photo} alt="" className="block rounded-full object-cover" style={{ width: size, height: size }} />
  return (
    <span className="font-rounded flex items-center justify-center rounded-full bg-gradient-to-b from-[#9aa0a6] to-[#6d7278] font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.46 }}>
      {initial ?? <UserRound size={size / 2} />}
    </span>
  )
}
