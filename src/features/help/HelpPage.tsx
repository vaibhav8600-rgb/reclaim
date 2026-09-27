import { useEffect, useMemo, useRef, type MouseEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import source from '../../../docs/USER_MANUAL.md?raw'
import { NavBar, Section } from '../../components/ui'
import { markdownToHtml } from '../../lib/markdown'

/** The user manual (docs/USER_MANUAL.md), bundled at build time; its screenshots load from /help and are cached for offline. */
export function HelpPage() {
  const { html, toc } = useMemo(
    () =>
      markdownToHtml(
        source
          .split('\n## Updating the screenshots')[0] // for developers
          .replace(/\nYou can also read this manual in the app:.*\n/, '\n'), // you're reading it in the app
      ),
    [],
  )
  const body = useRef<HTMLDivElement>(null)

  // Screens taller than one iPhone screen start folded, with a button to see the rest.
  useEffect(() => {
    const figures = [...(body.current?.querySelectorAll('figure.manual-shot') ?? [])]
    const cleanups = figures.map((fig) => {
      const img = fig.querySelector('img')!
      const check = () => {
        if (img.naturalHeight / img.naturalWidth > 844 / 390 + 0.05) {
          fig.classList.add('tall')
          fig.querySelector('button')!.hidden = false
        }
      }
      if (img.complete) check()
      img.addEventListener('load', check)
      return () => img.removeEventListener('load', check)
    })
    return () => cleanups.forEach((c) => c())
  }, [html])

  function onClick(e: MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    const more = target.closest('button.manual-more')
    if (more) {
      const fig = more.closest('figure')!
      more.textContent = fig.classList.toggle('open') ? 'Show less' : 'Show the whole screen'
      if (!fig.classList.contains('open')) fig.scrollIntoView({ block: 'nearest' })
      return
    }
    // Links within the manual: scroll there, without adding to the app's history
    const hash = target.closest('a')?.getAttribute('href')
    if (hash?.startsWith('#')) {
      e.preventDefault()
      jump(hash.slice(1))
    }
  }

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="User Manual" subtitle="How to use every part of Reclaim" back="/settings" />
      <Section title="Contents">
        <nav className="card rows overflow-hidden" aria-label="Contents">
          {toc.map((t, k) => (
            <button key={t.id} type="button" className="cell w-full text-left" onClick={() => jump(t.id)}>
              <span className="w-6 shrink-0 font-rounded font-semibold text-accent tabular-nums">{k + 1}</span>
              <span className="min-w-0 flex-1">{t.title}</span>
              <ChevronRight size={17} className="shrink-0 text-faint" />
            </button>
          ))}
        </nav>
      </Section>
      <div ref={body} className="manual px-5" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}
