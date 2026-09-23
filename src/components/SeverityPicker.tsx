import { severityBucket, severityWord } from '../lib/constants'

/** 0–10 as large tap targets in two rows — faster and more precise than a slider on a phone. */
export function SeverityPicker({ value, onChange }: { value: number | undefined; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Severity from 0 to 10">
        {Array.from({ length: 11 }, (_, n) => {
          const selected = value === n
          const b = severityBucket(n)
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(n)}
              className={`font-rounded h-[3.25rem] rounded-2xl text-[1.3rem] font-semibold transition active:scale-90 ${selected ? 'scale-105 shadow-md' : 'bg-surface'}`}
              style={selected ? { background: `var(--color-sev-${b})`, color: `var(--color-sev-${b}-ink)` } : undefined}
            >
              {n}
            </button>
          )
        })}
      </div>
      <p className="mt-2.5 h-5 px-1 text-[0.8125rem] text-muted">
        {value === undefined ? '0 = none · 10 = worst imaginable' : <><span className="font-semibold text-ink">{value}</span> · {severityWord(value)}</>}
      </p>
    </div>
  )
}
