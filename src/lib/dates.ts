const DAY = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

/** Intl formatters are costly to create; lists format hundreds of dates, so reuse them. */
const formatters = new Map<string, Intl.DateTimeFormat>()
function fmt(ms: number, options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(options)
  let f = formatters.get(key)
  if (!f) formatters.set(key, (f = new Intl.DateTimeFormat(undefined, options)))
  return f.format(ms)
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function startOfDay(ms: number) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Parse a YYYY-MM-DD key as a local date. */
export function fromDayKey(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

export function daysAgo(n: number, from = Date.now()) {
  return startOfDay(from) - n * DAY
}

export function daysBetween(a: number, b: number) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY)
}

export const formatTime = (ms: number) =>
  fmt(ms, { hour: 'numeric', minute: '2-digit' })

export function formatDay(ms: number) {
  const diff = daysBetween(ms, Date.now())
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  const d = new Date(ms)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return fmt(ms, {
    weekday: diff < 7 ? 'long' : 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

export const formatShortDate = (ms: number) =>
  fmt(ms, { day: 'numeric', month: 'short' })

export const formatLongDate = (ms: number) =>
  fmt(ms, { weekday: 'long', day: 'numeric', month: 'long' })

export function formatWhen(ms: number) {
  return `${formatDay(ms)}, ${formatTime(ms)}`
}

/** Value for <input type="datetime-local">. */
export function toLocalInput(ms: number) {
  const d = new Date(ms)
  return `${dayKey(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const fromLocalInput = (v: string) => new Date(v).getTime()

export function greeting(ms = Date.now()) {
  const h = new Date(ms).getHours()
  if (h < 5) return 'Good evening'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function relativeAge(ms: number) {
  const days = daysBetween(ms, Date.now())
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.round(days / 30)
  return months < 12 ? `${months} mo ago` : `${Math.round(days / 365)} yr ago`
}

export const formatMediumDate = (ms: number) =>
  fmt(ms, { day: 'numeric', month: 'short', year: 'numeric' })
