/**
 * Just enough Markdown for the user manual (docs/USER_MANUAL.md): headings, paragraphs, nested lists, tables, fenced
 * code, **bold**, *italic*, `code`, links and <img> screenshots. Text is escaped; the input is our own bundled file.
 */

export interface Manual {
  html: string
  /** The numbered sections, for the contents list. */
  toc: { id: string; title: string }[]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** GitHub's heading anchors, so the manual's own #links work in both places. */
export const slug = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/ /g, '-')

/** Screenshots are referenced from docs/ as ../public/help/x.jpg; the app serves them at /help/x.jpg. */
function screenshot(tag: string) {
  const src = tag.match(/src="([^"]+)"/)?.[1].replace(/^\.\.\/public\//, '/') ?? ''
  const alt = tag.match(/alt="([^"]*)"/)?.[1] ?? ''
  return `<figure class="manual-shot"><div class="manual-screen"><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy"><button type="button" class="manual-more" hidden>Show the whole screen</button></div></figure>`
}

function inline(t: string): string {
  if (t.trimStart().startsWith('<img')) return screenshot(t)
  return t
    .split(/(`[^`]+`)/)
    .map((p) => {
      if (/^`[^`]+`$/.test(p)) return `<code>${esc(p.slice(1, -1))}</code>`
      return esc(p)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, href: string) =>
          href.startsWith('#') ? `<a href="${href}">${text}</a>` : `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`,
        )
    })
    .join('')
}

const ITEM = /^\s*(?:- |\d+\. )(.*)$/
const indent = (l: string) => l.length - l.trimStart().length

function list(lines: string[], start: number): [string, number] {
  const build = (i: number, base: number): [string, number] => {
    const tag = /^\s*\d+\. /.test(lines[i]) ? 'ol' : 'ul'
    const items: string[] = []
    while (i < lines.length) {
      const l = lines[i]
      if (!l.trim()) {
        // A blank line ends the list unless an item or an indented continuation follows
        const next = lines[i + 1]
        if (next?.trim() && indent(next) >= base && (ITEM.test(next) || indent(next) > base)) i++
        else break
        continue
      }
      const m = l.match(ITEM)
      if (indent(l) < base) break
      if (indent(l) > base) {
        if (m) {
          const [sub, j] = build(i, indent(l))
          items[items.length - 1] += sub
          i = j
        } else {
          items[items.length - 1] += `<br>${inline(l.trim())}`
          i++
        }
        continue
      }
      if (!m) break
      items.push(inline(m[1]))
      i++
    }
    return [`<${tag}>${items.map((x) => `<li>${x}</li>`).join('')}</${tag}>`, i]
  }
  return build(start, indent(lines[start]))
}

export function markdownToHtml(md: string): Manual {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  const toc: Manual['toc'] = []
  let para: string[] = []
  let open = false
  const flush = () => {
    if (para.length) out.push(para[0].startsWith('<img') ? para.map(inline).join('') : `<p>${para.map(inline).join('<br>')}</p>`)
    para = []
  }

  for (let i = 0; i < lines.length; ) {
    const l = lines[i]
    const heading = l.match(/^(#{1,3}) (.*)$/)
    if (l.startsWith('```')) {
      flush()
      const end = lines.indexOf('```', i + 1)
      out.push(`<pre><code>${esc(lines.slice(i + 1, end).join('\n'))}</code></pre>`)
      i = end + 1
    } else if (!l.trim() || l.trim() === '---') {
      flush()
      i++
    } else if (heading) {
      flush()
      const [, hashes, text] = heading
      i++
      if (hashes === '#') continue // the page's own title bar names it
      if (text === 'Contents') {
        while (i < lines.length && !lines[i].startsWith('## ')) i++ // the page builds its own
        continue
      }
      const id = slug(text)
      if (hashes === '###') {
        out.push(`<h3 id="${id}">${inline(text)}</h3>`)
        continue
      }
      const num = text.match(/^(\d+)\. (.*)$/)
      if (num) toc.push({ id, title: num[2] })
      if (open) out.push('</section>')
      out.push(`<section id="${id}"><h2>${num ? `<span class="manual-num">${num[1]}</span>${inline(num[2])}` : inline(text)}</h2>`)
      open = true
    } else if (l.startsWith('|')) {
      flush()
      const rows: string[][] = []
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
      const [head, , ...body] = rows
      if (body.length === 1 && body[0].every((c) => c.startsWith('<img'))) {
        out.push(`<div class="manual-pair">${head.map((h, k) => `<div><p class="manual-pair-label">${inline(h)}</p>${inline(body[0][k])}</div>`).join('')}</div>`)
      } else {
        out.push(
          `<div class="manual-table"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>` +
            body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') +
            '</tbody></table></div>',
        )
      }
    } else if (ITEM.test(l)) {
      flush()
      const [html, next] = list(lines, i)
      out.push(html)
      i = next
    } else {
      para.push(l.trim())
      i++
    }
  }
  flush()
  if (open) out.push('</section>')
  return { html: out.join('\n'), toc }
}
