import type { DayPoint } from '../lib/stats'
import { formatShortDate } from '../lib/dates'
import { LineChart } from './LineChart'

/** Daily average severity (0–10) over consecutive days. */
export function PainChart({ points, label = 'Pain' }: { points: DayPoint[]; label?: string }) {
  const logged = points.filter((p) => p.avg !== null)
  const last = logged[logged.length - 1]
  return (
    <LineChart
      points={points.map((p) => ({ key: p.day, value: p.avg, caption: `${formatShortDate(p.ms)} · ${p.count} ${p.count === 1 ? 'log' : 'logs'}` }))}
      max={10}
      ticks={[0, 5, 10]}
      startLabel={formatShortDate(points[0].ms)}
      endLabel="Today"
      summary={
        last
          ? `${label} daily average over ${points.length} days, ${logged.length} days logged. Latest ${last.avg!.toFixed(1)} on ${formatShortDate(last.ms)}.`
          : `No ${label.toLowerCase()} logged in the last ${points.length} days.`
      }
    />
  )
}
