type Cell = string | number | undefined | null
/** CSV with a byte-order mark, so Excel reads accents and dashes correctly. */
export function csv(header: string[], rows: Cell[][]) {
  const cell = (v: Cell) => {
    const s = v === undefined || v === null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '\uFEFF' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
