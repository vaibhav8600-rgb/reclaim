/**
 * Parse JSON that is still being streamed: close any open string, array or object, and drop a trailing
 * incomplete key or value. Returns undefined until there's something usable.
 *   '{"headline":"Your pain ea'      → { headline: 'Your pain ea' }
 *   '{"a":["x","y'                   → { a: ['x', 'y'] }
 */
export function parsePartialJson(text: string): unknown {
  const s = text.trim()
  if (!s) return undefined
  try {
    return JSON.parse(s)
  } catch {
    // fall through to repair
  }
  // Try the whole text first, then back off to earlier structural boundaries.
  for (let end = s.length; end > 0; end = previousBoundary(s, end)) {
    try {
      return JSON.parse(close(s.slice(0, end)))
    } catch {
      // keep backing off
    }
  }
  return undefined
}

/** Append whatever closes the open string and containers of this prefix. */
function close(prefix: string) {
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (const ch of prefix) {
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') stack.pop()
  }
  let out = prefix
  if (inString) out += escaped ? '\\"' : '"'
  out = out.replace(/[,:\s]+$/, '')
  return out + stack.reverse().join('')
}

function previousBoundary(s: string, end: number) {
  for (let i = end - 1; i > 0; i--) if (s[i] === ',' || s[i] === '{' || s[i] === '[') return i
  return 0
}
