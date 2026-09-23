import { useNavigate, type NavigateOptions, type To } from 'react-router'
import { navigateWithMotion, type Motion } from './transitions'

/** navigate() with iOS motion. */
export function useGo() {
  const navigate = useNavigate()
  return (to: To, motion: Motion = 'push', opts?: NavigateOptions) => navigateWithMotion(motion, () => navigate(to, opts))
}

/**
 * Go back with motion: history back, or to `fallback` when this screen was opened directly
 * (Home Screen apps have no back button). Sheets pass 'sheet-down'.
 */
export function useBack(fallback = '/', motion: Motion = 'pop') {
  const navigate = useNavigate()
  return () =>
    navigateWithMotion(motion, () =>
      (window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate(fallback, { replace: true }),
    )
}
