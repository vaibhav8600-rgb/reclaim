/**
 * iOS-style navigation motion using the View Transitions API (Safari 18+, Chrome).
 * Every navigation says what kind of motion it is; CSS in index.css animates it.
 * Falls back to an instant change when unsupported or when Reduce Motion is on.
 */
export type Motion = 'push' | 'pop' | 'tab' | 'sheet-up' | 'sheet-down'

let pending: (() => void) | null = null

export const supportsViewTransitions = () =>
  typeof document !== 'undefined' &&
  'startViewTransition' in document &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Called from a layout effect once the new route has committed to the DOM. */
export function routeCommitted() {
  pending?.()
  pending = null
}

export function navigateWithMotion(motion: Motion, go: () => void) {
  if (!supportsViewTransitions()) return go()
  const root = document.documentElement
  root.dataset.motion = motion
  const t = document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        pending = resolve
        go()
        setTimeout(resolve, 400) // never hold the screen if a route doesn't change
      }),
  )
  t.finished.finally(() => {
    if (root.dataset.motion === motion) delete root.dataset.motion
  })
}
