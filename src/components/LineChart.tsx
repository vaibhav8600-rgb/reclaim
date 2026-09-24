import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react'

export interface ChartPoint {
  key: string
  /** null = gap (nothing logged in that slot). */
  value: number | null
  /** Tooltip line under the value, e.g. "18 Sept · 2 logs". */
  caption: string
}

const H = 150
const PAD = { top: 14, right: 38, bottom: 22, left: 26 }

/**
 * Single-series line chart: 2px line that draws in, 10% area wash, hairline grid,
 * touch-and-drag crosshair with tooltip, latest value labelled at the end.
 */
export function LineChart({ points, min = 0, max, ticks, format = (v) => v.toFixed(1), startLabel, endLabel, summary, empty = 'Nothing logged yet' }: {
  points: ChartPoint[]
  /** Bottom of the value axis (0 unless a range like body weight reads better from a floor). */
  min?: number
  max: number
  ticks: number[]
  format?: (v: number) => string
  startLabel: string
  endLabel: string
  /** Accessible description of what the chart shows. */
  summary: string
  empty?: string
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const [hover, setHover] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const plotW = width - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const step = points.length > 1 ? plotW / (points.length - 1) : 0
  const x = (i: number) => (points.length > 1 ? PAD.left + i * step : PAD.left + plotW / 2)
  const y = (v: number) => PAD.top + plotH - ((Math.min(Math.max(v, min), max) - min) / (max - min || 1)) * plotH

  const data = points.map((p, i) => ({ ...p, i })).filter((p) => p.value !== null) as (ChartPoint & { i: number; value: number })[]
  const line = data.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.value)}`).join('')
  const area = data.length > 1 ? `${line}L${x(data[data.length - 1].i)},${y(min)}L${x(data[0].i)},${y(min)}Z` : ''
  const last = data[data.length - 1]
  const showAllDots = step >= 16

  function onMove(e: PointerEvent<SVGSVGElement>) {
    if (!data.length) return
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.round((e.clientX - rect.left - PAD.left) / (step || 1))
    // Snap to the nearest slot that has data.
    setHover(data.reduce((a, b) => (Math.abs(b.i - i) < Math.abs(a.i - i) ? b : a)).i)
  }

  const h = hover !== null ? data.find((p) => p.i === hover) : undefined

  return (
    <div ref={wrap} className="relative select-none">
      <svg width={width} height={H} role="img" aria-label={summary} className="block touch-pan-y" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-faint)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {t}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 4} fontSize={11} fill="var(--color-faint)">{startLabel}</text>
        <text x={width - PAD.right} y={H - 4} fontSize={11} fill="var(--color-faint)" textAnchor="end">{endLabel}</text>

        {/* keyed on the data so a new range redraws */}
        <g key={points.length + ':' + data.length}>
          {area && <path d={area} fill="var(--color-accent)" fillOpacity={0.1} className="animate-area" />}
          {data.length > 1 && (
            <path d={line} pathLength={1} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="animate-draw" />
          )}
          {data.map((p) =>
            showAllDots || p === last ? (
              <circle key={p.key} cx={x(p.i)} cy={y(p.value)} r={4} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} className="animate-area" />
            ) : null,
          )}
        </g>
        {last && (
          <text x={x(last.i) + 8} y={y(last.value)} dy="0.32em" fontSize={12} fontWeight={600} fill="var(--color-ink)">
            {format(last.value)}
          </text>
        )}
        {h && (
          <g pointerEvents="none">
            <line x1={x(h.i)} x2={x(h.i)} y1={PAD.top} y2={y(min)} stroke="var(--color-muted)" strokeWidth={1} />
            <circle cx={x(h.i)} cy={y(h.value)} r={5} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && (
        <div className="glass pointer-events-none absolute top-0 rounded-2xl px-3 py-1.5 text-[0.75rem]" style={{ left: Math.min(Math.max(x(h.i) - 64, 0), width - 128), width: 128 }}>
          <div className="font-rounded text-[1.125rem] font-semibold">{format(h.value)}</div>
          <div className="text-muted">{h.caption}</div>
        </div>
      )}
      {!data.length && <div className="absolute inset-0 flex items-center justify-center pb-4 text-[0.875rem] text-muted">{empty}</div>}
    </div>
  )
}

/** A clean upper bound for a value axis: 4 → 5, 13 → 15, 27 → 30, 120 → 150. */
export function niceMax(v: number) {
  if (v <= 0) return 1
  const mag = 10 ** Math.floor(Math.log10(v))
  const n = v / mag
  return (n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 5 ? 5 : 10) * mag
}
