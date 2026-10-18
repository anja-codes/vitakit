import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as shared from '../src/shared/index'
import type { Entry } from '../src/shared/types'
import { dateRange } from '../src/primitives'
import { loadContent } from '../src/content'
import { compileVue, renderVue } from './vue'

const component = (name: string) => new URL(`../src/runtime/components/${name}.vue`, import.meta.url)
const imports = {
  '@anja.codes/vitakit/shared': shared,
  '#imports': { useSection: () => [] },
}
const VitaSection = compileVue(component('VitaSection'), imports)
const VitaEntry = compileVue(component('VitaEntry'), imports)
const VitaDate = compileVue(component('VitaDate'), imports)
const entry = (fields: Record<string, unknown> = {}): Entry => ({
  id: 'test-0', visibility: 'public', title: 'A title', ...fields,
})
const render = async (entries: Entry[], props: Record<string, unknown> = {}) =>
  // Drop Vue's hydration markers, not any of the rendered elements or text.
  (await renderVue(VitaSection, { entries, ...props }, { VitaEntry, VitaDate }))
    .replace(/<!--[\s\S]*?-->/g, '')

// These exercise compiled SFC templates and the real VitaEntry / VitaDate, not
// source-code patterns or component stubs that could hide a broken date slot.
describe('VitaSection SSR', () => {
  it('links institutions while preserving secondary order, separators, title URL and note', async () => {
    const html = await render([entry({
      title: { text: 'A title', html: '<em>A title</em>' },
      url: 'https://example.org/talk',
      role: 'Speaker', event: 'Conference',
      institution: { name: 'University', url: 'https://uni.example.org/' },
      location: 'Graz', note: 'An extra note',
    })])
    expect(html).toContain('<a href="https://example.org/talk"><em>A title</em></a>')
    expect(html).toContain('<p class="vita-entry__meta">Speaker · Conference · <a href="https://uni.example.org/">University</a> · Graz</p>')
    expect(html).toContain('<p class="vita-entry__note">An extra note</p>')
    expect(html).not.toContain('Slides')
    expect(html).not.toContain('in progress')
  })

  it.each(['institution', 'issuer', 'organisation'])('links the selected %s field', async (field) => {
    const html = await render([entry({ [field]: { name: 'Selected', url: 'https://selected.example/' } })])
    expect(html).toContain('<p class="vita-entry__meta"><a href="https://selected.example/">Selected</a></p>')
  })

  it('keeps an institution without URL as text, and does not use a lower-priority institution', async () => {
    const html = await render([entry({
      institution: { name: 'First' },
      issuer: { name: 'Second', url: 'https://second.example/' },
      organisation: { name: 'Third', url: 'https://third.example/' },
    })])
    expect(html).toContain('<p class="vita-entry__meta">First</p>')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('Second')
    expect(html).not.toContain('Third')
    expect(html).not.toContain(' · ')
  })

  it('escapes secondary text, institution names, notes and link attributes', async () => {
    const html = await render([entry({
      event: '<b>Conference</b> & friends',
      institution: { name: '<em>Uni</em>', url: 'https://example.org/?a=1&b="x"' },
      location: '<Graz>', note: '<script>bad()</script>',
    })])
    expect(html).toContain('&lt;b&gt;Conference&lt;/b&gt; &amp; friends · ')
    expect(html).toContain('href="https://example.org/?a=1&amp;b=&quot;x&quot;">&lt;em&gt;Uni&lt;/em&gt;</a> · &lt;Graz&gt;')
    expect(html).toContain('<p class="vita-entry__note">&lt;script&gt;bad()&lt;/script&gt;</p>')
    expect(html).not.toContain('<script>')
  })

  it('renders a labelled slides link separately from the title link', async () => {
    const html = await render([entry({ url: 'https://example.org/talk', slides: 'https://example.org/slides.pdf?a=1&b=2' })])
    expect(html).toContain('<a href="https://example.org/talk">A title</a>')
    expect(html).toContain('<p class="vita-entry__links"><a href="https://example.org/slides.pdf?a=1&amp;b=2">Slides</a></p>')
    expect(html.match(/<a /g)).toHaveLength(2)
  })

  it.each([undefined, '', null, false, 42, { url: '/slides.pdf' }])('does not invent a slides link for %j', async (slides) => {
    const html = await render([entry({ slides })])
    expect(html).not.toContain('Slides')
    expect(html).not.toContain('vita-entry__links')
    expect(html).not.toContain('<a ')
  })

  it('marks ongoing entries independently of their date range', async () => {
    const html = await render([entry({ ongoing: true, date: dateRange.parse(2024) })])
    expect(html).toContain('<span>A title</span><span class="vita-entry__status"> (in progress)</span>')
    expect(html).toContain('<time class="vita-date" datetime="2024">2024</time>')
  })

  it.each([undefined, false, 'true', 1])('does not mark ongoing=%j as in progress', async (ongoing) => {
    const html = await render([entry({ ongoing })])
    expect(html).not.toContain('in progress')
    expect(html).not.toContain('vita-entry__status')
  })

  it('uses a teaching term instead of the date and removes only the term from the secondary line', async () => {
    const html = await render([entry({
      date: dateRange.parse(2024), term: 'Winter <2025/26>',
      role: 'Lecturer', institution: { name: 'Uni' },
    })])
    expect(html).toContain('<div class="vita-entry__date">Winter &lt;2025/26&gt;</div>')
    expect(html).not.toContain('<time')
    expect(html).not.toContain('2024')
    expect(html.match(/Winter/g)).toHaveLength(1)
    expect(html).toContain('<p class="vita-entry__meta">Lecturer · Uni</p>')
  })

  it('does not remove an event just because it has the same text as the term', async () => {
    const html = await render([entry({ term: '2025S', event: '2025S' })])
    expect(html).toContain('<div class="vita-entry__date">2025S</div>')
    expect(html).toContain('<p class="vita-entry__meta">2025S</p>')
  })

  it('does not create an empty meta paragraph for a term-only entry', async () => {
    const html = await render([entry({ term: '2025S' })])
    expect(html).toContain('<div class="vita-entry__date">2025S</div>')
    expect(html).not.toContain('vita-entry__meta')
  })

  it.each([undefined, '', null, 2025])('keeps the normal date fallback for term=%j', async (term) => {
    const html = await render([entry({ date: dateRange.parse({ from: 2023, to: 'present' }), term })])
    expect(html).toContain('<time class="vita-date" datetime="2023">2023–present</time>')
    // DateRange.ongoing is not the entry-level in-progress flag.
    expect(html).not.toContain('in progress')
  })

  it('preserves custom title fields and does not duplicate the title in metadata', async () => {
    const html = await render([entry({ role: 'Lecturer', institution: { name: 'Uni' } })], { titleFields: ['role'] })
    expect(html).toContain('<span>Lecturer</span>')
    expect(html).toContain('<p class="vita-entry__meta">Uni</p>')
    expect(html.match(/Lecturer/g)).toHaveLength(1)
  })

  it('renders no empty meta, optional links, note or date when their fields are absent', async () => {
    const html = await render([entry()])
    expect(html).toContain('<span>A title</span>')
    expect(html).not.toMatch(/vita-entry__(?:meta|links|note|status)/)
    expect(html).not.toContain('<time')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain(' · ')
    expect(await render([])).not.toContain('<ul')
  })

  it('renders already resolved deployment-base URLs from the content loader exactly once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitakit-components-'))
    try {
      await mkdir(join(root, 'content'))
      await writeFile(join(root, 'content/profile.yml'), 'name: Example\nsummary: Example site\n')
      await writeFile(join(root, 'content/talks.yml'), [
        '- date: 2025',
        '  title: A talk',
        '  url: /talk/',
        '  slides: /slides/talk.pdf',
      ].join('\n'))
      await writeFile(join(root, 'content/teaching.yml'), [
        '- date: 2025',
        '  title: A course',
        '  term: Winter 2025/26',
        '  institution: { name: Uni, url: /university/ }',
      ].join('\n'))
      const content = await loadContent(root, { baseURL: '/my-site/' })
      expect(content.issues).toEqual([])
      const html = await render([...content.sections.talks!, ...content.sections.teaching!])
      expect(html).toContain('<a href="/my-site/talk/">A talk</a>')
      expect(html).toContain('<a href="/my-site/university/">Uni</a>')
      expect(html).toContain('<a href="/my-site/slides/talk.pdf">Slides</a>')
      expect(html).toContain('<div class="vita-entry__date">Winter 2025/26</div>')
      expect(html.match(/Winter 2025\/26/g)).toHaveLength(1)
      expect(html).not.toContain('/my-site/my-site/')
      expect(html).not.toContain('__vitakitPath')
      expect(html).not.toMatch(/href="\/(?:talk|slides|university)\//)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
