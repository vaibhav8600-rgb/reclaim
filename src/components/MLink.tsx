import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { useGo } from '../lib/nav'
import type { Motion } from '../lib/transitions'

/** Screens presented as sheets (forms); everything else pushes. */
const SHEET = /^\/(log\/|injuries\/new|injuries\/[^/]+\/edit|documents\/(new|import)|documents\/[^/]+\/edit|health\/(review|facts)(\/|$)|settings\/drive|welcome|rehab\/(session|plan|exercises\/new|exercises\/[^/]+\/edit))/

export const motionFor = (to: string): Motion => (SHEET.test(to) ? 'sheet-up' : 'push')

/** A Link that navigates with iOS motion. */
export function MLink({ to, motion, replace, className, children, ...rest }: {
  to: string
  motion?: Motion
  replace?: boolean
  className?: string
  children: ReactNode
  'aria-label'?: string
}) {
  const go = useGo()
  function onClick(e: MouseEvent) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    go(to, motion ?? motionFor(to), { replace })
  }
  return <Link to={to} replace={replace} className={className} onClick={onClick} {...rest}>{children}</Link>
}
