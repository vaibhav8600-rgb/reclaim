// Runs before the first paint (a plain script, not a module): the theme chosen in Settings, or the system's.
// Kept in step with src/lib/theme.ts. A separate file because the Content-Security-Policy forbids inline scripts.
;(function () {
  var t
  try { t = localStorage.getItem('theme') } catch (e) {}
  var dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
})()
