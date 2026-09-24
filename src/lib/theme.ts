/**
 * Appearance: follow the system, or always light or dark. Saved on this device (it's a display preference,
 * not data). public/theme.js applies it before the first paint; this keeps it in step afterwards.
 */
export type Theme = 'system' | 'light' | 'dark'

const KEY = 'theme'
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)')

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(t = getTheme()) {
  const dark = t === 'dark' || (t === 'system' && systemDark().matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  // The status bar colour: per scheme when following the system, otherwise the chosen one.
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const forDark = t === 'system' ? m.media.includes('dark') : dark
    m.content = forDark ? '#000000' : '#f2f2f7'
  }
}

export function setTheme(t: Theme) {
  try {
    if (t === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, t)
  } catch {
    // Private mode: still applies for this visit.
  }
  applyTheme(t)
}

/** Follow the system switching between light and dark (e.g. at sunset) while set to System. */
export function watchSystemTheme() {
  systemDark().addEventListener('change', () => getTheme() === 'system' && applyTheme())
}
