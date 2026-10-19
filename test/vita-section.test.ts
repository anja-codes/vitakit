/**
 * `VitaSection`, compiled from its SFC and rendered on the server together with
 * the real `VitaEntry` and `VitaDate`.
 */
import { describe, expect, it, vi } from 'vitest'
import { h, type Slots } from 'vue'
import * as shared from '../src/shared/index'
import type { Entry, VitaSectionSlotProps } from '../src/shared/index'
import { dateRange } from '../src/primitives'
import { loadContent } from '../src/content'
import { project } from './support/project'
import { compileVue, renderVue } from './support/vue'

const useSection = vi.fn<(id: string) => Entry[]>(() => [])
const imports = { '@anja.codes/vitakit/shared': shared, '#imports': { useSection } }
const component = (name: string) => compileVue(new URL(`../src/runtime/components/${name}.vue`, import.meta.url), imports)
const components = { VitaSection: component('VitaSection'), VitaEntry: component('VitaEntry'), VitaDate: component('VitaDate') }

const entry = (fields: Record<string, unknown> = {}): Entry => ({ id: 'talks-0', visibility: 'public', title: 'A title', ...fields })
/** An entry using every field the default layout shows. */
const complete = () => entry({
  date: dateRange.parse(2024), role: 'Speaker', note: 'A note', url: '/talk/', slides: '/slides.pdf', ongoing: true,
})

/** Server-rendered HTML, without Vue's hydration comments. */
const strip = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')
const render = async (props: Record<string, unknown>, slots?: Slots) =>
  strip(await renderVue(components.VitaSection, props, components, slots))
const renderEntries = (...entries: Entry[]) => render({ entries })

/** Rendered inside a real parent template, which is how Vue produces empty and conditional slots. */
async function renderInParent(slotTemplate: string, props: Record<string, unknown>) {
  const Parent = compileVue(new URL('./Parent.vue', import.meta.url), imports, `
    <script setup>defineProps(['entries', 'show'])</script>
    <template><VitaSection :entries="entries">${slotTemplate}</VitaSection></template>
  `)
  return strip(await renderVue(Parent, props, components))
}

/** Every slot invocation, and what a slot returned. */
function capture(output: () => ReturnType<typeof h>[] = () => []) {
  const calls: VitaSectionSlotProps[] = []
  return { calls, slot: (context: VitaSectionSlotProps) => (calls.push(context), output()) }
}

describe('default layout', () => {
  it('renders date, linked title, status, meta, note and slides, in that order', async () => {
    expect(await renderEntries(complete())).toBe('<ul class="vita-section"><li class="vita-entry">'
      + '<div class="vita-entry__date"><time class="vita-date" datetime="2024">2024</time></div>'
      + '<div class="vita-entry__body"><p class="vita-entry__title"><a href="/talk/">A title</a>'
      + '<span class="vita-entry__status"> (in progress)</span></p>'
      + '<p class="vita-entry__meta">Speaker</p><p class="vita-entry__note">A note</p>'
      + '<p class="vita-entry__links"><a href="/slides.pdf">Slides</a></p></div></li></ul>')
  })

  it('renders only the title when there is nothing else', async () => {
    expect(await renderEntries(entry())).toBe('<ul class="vita-section"><li class="vita-entry">'
      + '<div class="vita-entry__date"></div><div class="vita-entry__body">'
      + '<p class="vita-entry__title"><span>A title</span></p></div></li></ul>')
  })

  it('renders nothing for no entries', async () => {
    expect(await renderEntries()).toBe('')
  })

  it('uses rendered rich-text HTML for the title, and titleFields to choose it', async () => {
    expect(await renderEntries(entry({ title: { text: '*A*', html: '<em>A</em>' } }))).toContain('<span><em>A</em></span>')

    const html = await render({ entries: [entry({ role: 'Lecturer', institution: { label: 'Uni' } })], titleFields: ['missing', 'role'] })
    expect(html).toContain('<span>Lecturer</span>')
    expect(html).toContain('<p class="vita-entry__meta">Uni</p>')
  })

  it('joins the meta line with ·, linking the first linked field only if it has a URL', async () => {
    expect(await renderEntries(entry({
      role: 'Speaker', event: 'Conference', institution: { label: 'University', url: 'https://uni.example.org/' }, location: 'Graz',
    }))).toContain('<p class="vita-entry__meta">Speaker · Conference · <a href="https://uni.example.org/">University</a> · Graz</p>')

    expect(await renderEntries(entry({ issuer: { label: 'Issuer', url: 'https://i.example/' } })))
      .toContain('<p class="vita-entry__meta"><a href="https://i.example/">Issuer</a></p>')
    expect(await renderEntries(entry({ institution: { label: 'First' }, organisation: { label: 'Second', url: 'https://s.example/' } })))
      .toContain('<p class="vita-entry__meta">First</p>')
  })

  it('escapes every text field and attribute', async () => {
    const html = await renderEntries(entry({
      event: '<b>Conference</b> & friends',
      institution: { label: '<em>Uni</em>', url: 'https://example.org/?a=1&b="x"' },
      note: '<script>bad()</script>',
    }))
    expect(html).toContain('&lt;b&gt;Conference&lt;/b&gt; &amp; friends · <a href="https://example.org/?a=1&amp;b=&quot;x&quot;">&lt;em&gt;Uni&lt;/em&gt;</a>')
    expect(html).toContain('<p class="vita-entry__note">&lt;script&gt;bad()&lt;/script&gt;</p>')
  })

  it('shows a teaching term instead of the date, and not in the meta line', async () => {
    const html = await renderEntries(entry({ date: dateRange.parse(2024), term: 'Winter 2025/26', role: 'Lecturer', event: 'Winter 2025/26' }))
    expect(html).toContain('<div class="vita-entry__date">Winter 2025/26</div>')
    expect(html).not.toContain('<time')
    // An event that happens to read the same is still shown.
    expect(html).toContain('<p class="vita-entry__meta">Lecturer · Winter 2025/26</p>')
  })

  it.each([
    ['term', { term: 2025 }],
    ['slides', { slides: { url: '/slides.pdf' } }],
    ['ongoing', { ongoing: 'true' }],
    ['note', { note: 42 }],
    ['url', { url: 42 }],
  ])('ignores a %s that is not of the expected type', async (_field, fields) => {
    expect(await renderEntries(entry(fields))).toBe(await renderEntries(entry()))
  })

  it('shows an empty note, which was written on purpose', async () => {
    expect(await renderEntries(entry({ note: '' }))).toContain('<p class="vita-entry__note"></p>')
  })

  it('takes the in-progress status from `ongoing`, not from an open date range', async () => {
    const html = await renderEntries(entry({ date: dateRange.parse({ from: 2023, to: 'present' }) }))
    expect(html).toContain('<time class="vita-date" datetime="2023">2023–present</time>')
    expect(html).not.toContain('in progress')
  })
})

describe('choosing entries', () => {
  it('looks up a section by id and applies the limit', async () => {
    useSection.mockReturnValueOnce([entry({ id: 'z', title: 'Z' }), entry({ id: 'a', title: 'A' }), entry({ id: 'm', title: 'M' })])
    const html = await render({ id: 'talks', limit: 2 })
    expect(useSection).toHaveBeenCalledWith('talks')
    expect(html.match(/<span>(\w)<\/span>/g)).toEqual(['<span>Z</span>', '<span>A</span>'])
  })

  it('shows given entries as they are, ignoring the id', async () => {
    useSection.mockClear()
    const html = await render({ id: 'talks', entries: [entry({ title: 'B', visibility: 'private' }), entry({ title: 'A' })] })
    expect(useSection).not.toHaveBeenCalled()
    expect(html.match(/<span>(\w)<\/span>/g)).toEqual(['<span>B</span>', '<span>A</span>'])
  })
})

describe('slots', () => {
  it.each(['title', 'meta', 'note'] as const)('#%s replaces that region, wrapper included, and nothing else', async (name) => {
    const html = await render({ entries: [complete()] }, { [name]: () => [h('aside', `Custom ${name}`)] })
    const regions = ['title', 'meta', 'note'].filter(region => region !== name)
    expect(html).toContain(`<aside>Custom ${name}</aside>`)
    expect(html).not.toContain(`vita-entry__${name}`)
    for (const region of [...regions, 'links']) expect(html).toContain(`vita-entry__${region}`)
    expect(html).toContain('<time class="vita-date" datetime="2024">2024</time>')
  })

  it('#title, #meta and #note keep their order, with the links after them', async () => {
    const html = await renderInParent(`
      <template #title="{ display }"><h2 v-html="display.titleHtml" /></template>
      <template #meta="{ index }"><aside>Meta {{ index }}</aside></template>
      <template #note="{ entry }"><footer>{{ entry.note }}</footer></template>
    `, { entries: [complete()] })
    expect(html).toContain('<div class="vita-entry__body"><h2>A title</h2><aside>Meta 0</aside><footer>A note</footer>'
      + '<p class="vita-entry__links"><a href="/slides.pdf">Slides</a></p></div>')
  })

  it('#default replaces the whole body, but not the date column', async () => {
    const named = vi.fn(() => [h('aside', 'must not run')])
    const html = await render({ entries: [complete()] }, {
      default: ({ entry, index }: VitaSectionSlotProps) => [h('article', `${index}: ${entry.id}`)],
      title: named,
      note: named,
    })
    expect(html).toContain('<div class="vita-entry__date"><time class="vita-date" datetime="2024">2024</time></div>'
      + '<div class="vita-entry__body"><article>0: talks-0</article></div>')
    expect(named).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty slot function', 'note', () => render({ entries: [complete()] }, { note: () => [] })],
    ['an empty <template #note />', 'note', () => renderInParent('<template #note />', { entries: [complete()] })],
    ['a slot whose content is v-if\'d away', 'note', () => renderInParent('<template #note><aside v-if="show">x</aside></template>', { entries: [complete()], show: false })],
    ['an empty <template #default />', 'body', () => renderInParent('<template #default />', { entries: [complete()] })],
  ])('%s suppresses the default output', async (_case, region, rendered) => {
    const html = await rendered()
    if (region === 'body') expect(html).toContain('<div class="vita-entry__body"></div>')
    else expect(html).not.toContain(`vita-entry__${region}`)
    expect(html).toContain('<ul class="vita-section"><li class="vita-entry">')
  })

  it('a slot that is itself v-if\'d away leaves the default output', async () => {
    const html = await renderInParent('<template v-if="show" #note><aside>x</aside></template>', { entries: [complete()], show: false })
    expect(html).toContain('<p class="vita-entry__note">A note</p>')
  })

  it('all receive the entry, its index and the display data the default layout uses', async () => {
    const date = dateRange.parse({ from: 2023, to: 'present' })
    const item = entry({
      role: { text: '*Chosen*', html: '<em>Chosen</em>' }, date, term: 'Winter', event: 'AofA',
      institution: { label: 'University', url: '/university/' }, location: 'Graz',
      url: '/talk/', note: '', slides: '/slides.pdf', ongoing: true, extra: { kept: true },
    })
    const named = capture()
    const body = capture()
    const props = { entries: [entry({ id: 'first' }), item], titleFields: ['role'] }
    await render(props, { title: named.slot, meta: named.slot, note: named.slot })
    await render(props, { default: body.slot })

    // Title, meta and note run once per entry; the second entry's are the last three.
    const contexts = [...named.calls.slice(3), body.calls[1]!]
    expect(contexts).toHaveLength(4)
    for (const context of contexts) {
      expect(context.entry).toBe(item)
      expect(context.index).toBe(1)
      expect(context.display).toEqual({
        titleHtml: '<em>Chosen</em>',
        titleUrl: '/talk/',
        date,
        term: 'Winter',
        meta: [{ kind: 'text', text: 'AofA' }, { kind: 'linked', linked: { label: 'University', url: '/university/' } }, { kind: 'text', text: 'Graz' }],
        note: '',
        links: [{ label: 'Slides', url: '/slides.pdf' }],
        ongoing: true,
      })
    }
    expect(item.term).toBe('Winter')
  })

  it('run even when the field they replace is absent', async () => {
    const { calls, slot } = capture(() => [h('aside', 'Custom title')])
    const html = await render({ entries: [entry({ title: undefined })] }, { title: slot })
    expect(html).toContain('<aside>Custom title</aside>')
    expect(calls[0]!.display).toEqual({ titleHtml: '', titleUrl: undefined, date: undefined, term: undefined, meta: [], note: undefined, links: [], ongoing: false })
  })
})

it('shows content from the loader with its base path applied exactly once', async () => {
  const root = await project({
    'content/profile.yml': 'name: Example\n',
    'content/talks.yml': '- { date: 2025, title: A *rich* talk, url: /talk/, slides: /slides/talk.pdf }\n',
    'content/teaching.yml': '- { date: 2025, title: A course, term: Winter 2025/26, institution: { name: Uni, url: /university/ } }\n',
  })
  const { sections } = await loadContent(root, { baseURL: '/my-site/' })
  const html = await renderEntries(...sections.talks!, ...sections.teaching!)
  expect(html).toContain('<a href="/my-site/talk/">A <em>rich</em> talk</a>')
  expect(html).toContain('<a href="/my-site/slides/talk.pdf">Slides</a>')
  expect(html).toContain('<a href="/my-site/university/">Uni</a>')
  expect(html).not.toMatch(/my-site\/my-site|__vitakit/)
})
