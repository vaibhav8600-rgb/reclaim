import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { markdownToHtml } from '../src/lib/markdown'

test('markdown: sections, nested lists, screenshot pairs, and text is escaped', () => {
  const { html, toc } = markdownToHtml([
    '# Title',
    'Intro with **bold**, *italic*, `code` and <script>alert(1)</script>.',
    '## Contents',
    '1. [Today](#1-today)',
    '## 1. Today',
    '- One',
    '  - Nested [link](https://example.com)',
    '- Two',
    '',
    '### How You’re Doing',
    '| A | B |',
    '|---|---|',
    '| <img src="../public/help/a.jpg" width="260" alt="A shot"> | <img src="../public/help/b.jpg" width="260" alt="B shot"> |',
  ].join('\n'))
  expect(toc).toEqual([{ id: '1-today', title: 'Today' }])
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).toContain('<strong>bold</strong>, <em>italic</em>, <code>code</code>')
  expect(html).toContain('<section id="1-today"><h2><span class="manual-num">1</span>Today</h2>')
  expect(html).toContain('<ul><li>One<ul><li>Nested <a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a></li></ul></li><li>Two</li></ul>')
  expect(html).toContain('<h3 id="how-youre-doing">')
  expect(html).toContain('class="manual-pair"')
  expect(html).toContain('<img src="/help/a.jpg" alt="A shot" loading="lazy"><button')
  expect(html).not.toContain('Contents')
})

test('the manual: every link inside it lands on a section, and every screenshot exists', () => {
  const { html } = markdownToHtml(readFileSync('docs/USER_MANUAL.md', 'utf8'))
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]))
  const links = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])
  expect(links.length).toBeGreaterThan(20)
  expect(links.filter((l) => !ids.has(l))).toEqual([])
  const images = [...html.matchAll(/<img src="\/help\/([^"]+)"/g)].map((m) => m[1])
  expect(images.length).toBeGreaterThan(50)
  expect(images.filter((f) => !existsSync(`public/help/${f}`))).toEqual([])
})

test('the user manual opens from Settings, jumps to a section and unfolds a long screen', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('link', { name: /User Manual/ }).click()
  await expect(page.getByRole('heading', { name: 'User Manual', level: 1 })).toBeVisible()

  await page.getByRole('navigation', { name: 'Contents' }).getByRole('button', { name: /Warning signs/ }).click()
  await expect(page.locator('[id="9-warning-signs"] h2')).toBeInViewport()
  const shot = page.getByRole('img', { name: 'Warning signs check' })
  await expect(shot).toBeVisible()
  await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)

  // The safety screen is longer than one iPhone screen: folded, then shown whole
  const fig = page.locator('figure', { has: shot })
  await fig.getByRole('button', { name: 'Show the whole screen' }).click()
  await expect(fig.getByRole('button', { name: 'Show less' })).toBeVisible()
})
