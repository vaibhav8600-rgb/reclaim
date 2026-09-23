import { useLayoutEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { routeCommitted } from './transitions'

/**
 * Runs after each route commit: new screens start at the top (going back keeps the
 * restored position), then any running view transition may capture the new screen.
 */
export function ScrollToTop() {
  const { key } = useLocation()
  const type = useNavigationType()
  useLayoutEffect(() => {
    if (type !== 'POP') window.scrollTo(0, 0)
    routeCommitted()
  }, [key, type])
  return null
}
