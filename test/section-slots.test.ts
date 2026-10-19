import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { h, type Slots } from 'vue'
import * as shared from '../src/shared/index'
import type { Entry, VitaSectionDisplay, VitaSectionSlotProps } from '../src/shared/index'
import { dateRange } from '../src/primitives'
import { loadContent } from '../src/content'
import { compileVue, renderVue } from './vue'

const component = (name: string) => new URL(`../src/runtime/components/${name}.vue`, import.meta.url)
const lookup = vi.fn<(id: string) => Entry[]>(() => [])
const imports = {
  '@anja.codes/vitakit/shared': shared,
  '#imports': { useSection: lookup },
}
const VitaSection = compileVue(component('VitaSection'), imports)
const VitaEntry = compileVue(component('VitaEntry'), imports)
const VitaDate = compileVue(component('VitaDate'), imports)
const components = { VitaSection, VitaEntry, VitaDate }
const entry = (fields: Record<string, unknown> = {}): Entry => ({
  id: 'section-0', visibility: 'public', title: 'Default title', ...fields,
})
const clean = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')
const render = async (props: Record<string, unknown>, slots?: Slots) =>
  clean(await renderVue(VitaSection, props, components, slots))

// A genuine parent SFC matters: Vue may turn an empty/conditional template into
// comment VNodes. Calling a hand-written slot returning [] alone misses that.
const renderParent = async (template: string, props: Record<string, unknown> = {}) => {
  const Parent = compileVue(new URL('./SectionSlotsParent.vue', import.meta.url), imports, `
    <script setup>
    defineProps(['entries', 'id', 'show', 'titleFields', 'limit'])
    </script>
    <template>
      <VitaSection :entries="entries" :id="id" :title-fields="titleFields" :limit="limit">
        ${template}
      </VitaSection>
    </template>
  `)
  return clean(await renderVue(Parent, props, components))
}
const complete = () => entry({
  date: dateRange.parse(2024), role: 'Speaker', note: 'Default note',
  url: '/talk/', slides: '/slides.pdf', ongoing: true,
})
const expectLayout = (html: string) => {
  expect(html).toContain('<ul class="vita-section"><li class="vita-entry">')
  expect(html).toContain('<div class="vita-entry__date">')
  expect(html).toContain('<div class="vita-entry__body">')
  expect(html).toContain('</div></li></ul>')
}

// Exercise compiled VitaSection, VitaEntry and VitaDate, including real parent
// templates. No component stubs or source-text assertions can mask fallback bugs.
describe('VitaSection scoped regions', () => {
  it('preserves the unslotted structure, ongoing marker, note and link order', async () => {
    const html = await render({ entries: [complete()] })
    expect(html).toBe('<ul class="vita-section"><li class="vita-entry">'
      + '<div class="vita-entry__date"><time class="vita-date" datetime="2024">2024</time></div>'
      + '<div class="vita-entry__body"><p class="vita-entry__title"><a href="/talk/">Default title</a>'
      + '<span class="vita-entry__status"> (in progress)</span></p>'
      + '<p class="vita-entry__meta">Speaker</p><p class="vita-entry__note">Default note</p>'
      + '<p class="vita-entry__links"><a href="/slides.pdf">Slides</a></p></div></li></ul>')
  })

  it('preserves an empty-string note, but not absent or non-string notes', async () => {
    expect(await render({ entries: [entry({ note: '' })] })).toContain('<p class="vita-entry__note"></p>')
    for (const note of [undefined, null, false, 42, { text: 'not a note' }]) {
      expect(await render({ entries: [entry({ note })] })).not.toContain('vita-entry__note')
    }
  })

  it.each(['title', 'meta', 'note'] as const)('replaces the entire %s region, not just its contents', async (name) => {
    const html = await render({ entries: [complete()] }, {
      [name]: () => [h('aside', { class: `custom-${name}` }, `Custom ${name}`)],
    })
    expectLayout(html)
    expect(html).toContain(`<aside class="custom-${name}">Custom ${name}</aside>`)
    expect(html).not.toContain(`vita-entry__${name}`)
    expect(html).toContain('<time class="vita-date" datetime="2024">2024</time>')
    expect(html).toContain('<p class="vita-entry__links"><a href="/slides.pdf">Slides</a></p>')
    for (const other of ['title', 'meta', 'note'].filter(region => region !== name)) {
      expect(html).toContain(`vita-entry__${other}`)
    }
    if (name === 'title') {
      expect(html).not.toContain('Default title')
      expect(html).not.toContain('vita-entry__status')
      expect(html).not.toContain('href="/talk/"')
    }
  })

  it('combines the three named slots in title/meta/note order and keeps default links last', async () => {
    const html = await renderParent(`
      <template #title="{ display }"><h2 v-html="display.titleHtml" /></template>
      <template #meta="{ index }"><aside>Meta {{ index }}</aside></template>
      <template #note="{ entry }"><footer>{{ entry.note }}</footer></template>
    `, { entries: [complete()] })
    expect(html).toContain('<div class="vita-entry__body"><h2>Default title</h2>'
      + '<aside>Meta 0</aside><footer>Default note</footer>'
      + '<p class="vita-entry__links"><a href="/slides.pdf">Slides</a></p></div>')
    expect(html).not.toMatch(/vita-entry__(?:title|meta|note|status)/)
  })

  it.each(['title', 'meta', 'note'] as const)('runs a custom %s slot even when the default field is absent', async (name) => {
    const received: VitaSectionSlotProps[] = []
    const item = entry({ title: undefined })
    const html = await render({ entries: [item] }, {
      [name]: (context: VitaSectionSlotProps) => {
        received.push(context)
        return [h('aside', `Custom ${name}`)]
      },
    })
    expect(html).toContain(`<aside>Custom ${name}</aside>`)
    expect(received).toHaveLength(1)
    expect(received[0]!.entry).toBe(item)
    expect(received[0]!.index).toBe(0)
    expect(received[0]!.display.titleHtml).toBe('')
    expect(received[0]!.display.meta).toEqual([])
    expect(received[0]!.display.note).toBeUndefined()
    expect(html).not.toContain(`vita-entry__${name}`)
  })

  it.each(['title', 'meta', 'note'] as const)('an explicitly empty %s function suppresses fallback and its wrapper', async (name) => {
    const html = await render({ entries: [complete()] }, { [name]: () => [] })
    expect(html).not.toContain(`vita-entry__${name}`)
    expect(html).toContain('vita-entry__links')
    expectLayout(html)
  })

  it.each(['title', 'meta', 'note'] as const)('an empty parent <template #%s /> suppresses fallback', async (name) => {
    const html = await renderParent(`<template #${name} />`, { entries: [complete()] })
    expect(html).not.toContain(`vita-entry__${name}`)
    expect(html).toContain('vita-entry__links')
    expectLayout(html)
  })

  it.each(['title', 'meta', 'note'] as const)('a present %s slot with false internal content suppresses fallback', async (name) => {
    const html = await renderParent(`<template #${name}><aside v-if="show">Only when shown</aside></template>`, {
      entries: [complete()], show: false,
    })
    expect(html).not.toContain('Only when shown')
    expect(html).not.toContain(`vita-entry__${name}`)
    expect(html).toContain('vita-entry__links')
    expectLayout(html)
  })

  it('a conditionally absent slot still uses fallback (unlike a false condition inside it)', async () => {
    const html = await renderParent('<template v-if="show" #note><aside>Replacement</aside></template>', {
      entries: [complete()], show: false,
    })
    expect(html).toContain('<p class="vita-entry__note">Default note</p>')
    expect(html).not.toContain('Replacement')
  })
})

describe('VitaSection whole default body', () => {
  it.each([undefined, 'Winter 2025/26'])('replaces all body regions and links but retains the independent date/term column (%s)', async (term) => {
    const calls = vi.fn(() => [h('aside', 'Named slot must not run')])
    const item = complete()
    if (term) item.term = term
    const received: VitaSectionSlotProps[] = []
    const html = await render({ entries: [item] }, {
      default: (context: VitaSectionSlotProps) => {
        received.push(context)
        return [h('article', { 'data-index': context.index }, `Body for ${context.entry.id}`)]
      },
      title: calls, meta: calls, note: calls,
    })
    expectLayout(html)
    expect(html).toContain('<div class="vita-entry__body"><article data-index="0">Body for section-0</article></div>')
    expect(html).not.toMatch(/vita-entry__(?:title|meta|note|links|status)/)
    expect(html).not.toContain('Default title')
    expect(html).not.toContain('Default note')
    expect(html).not.toContain('/slides.pdf')
    expect(calls).not.toHaveBeenCalled()
    expect(received[0]!.entry).toBe(item)
    expect(received[0]!.display.links).toEqual([{ label: 'Slides', url: '/slides.pdf' }])
    if (term) {
      expect(html).toContain(`<div class="vita-entry__date">${term}</div>`)
      expect(html).not.toContain('<time')
    } else {
      expect(html).toContain('<time class="vita-date" datetime="2024">2024</time>')
    }
  })

  it.each(['<template #default />', '<template #default><aside v-if="show">Hidden</aside></template>'])('empty parent body suppresses all fallback: %s', async (template) => {
    const html = await renderParent(`${template}<template #note><aside>Named note</aside></template>`, {
      entries: [complete()], show: false,
    })
    expectLayout(html)
    expect(html).toContain('<div class="vita-entry__body"></div>')
    expect(html).not.toMatch(/vita-entry__(?:title|meta|note|links|status)/)
    expect(html).not.toContain('Named note')
    expect(html).toContain('<time class="vita-date" datetime="2024">2024</time>')
  })

  it('an empty manual body also suppresses every default body region', async () => {
    const html = await render({ entries: [complete()] }, { default: () => [] })
    expect(html).toContain('<div class="vita-entry__body"></div>')
    expect(html).not.toMatch(/vita-entry__(?:title|meta|note|links|status)/)
  })

  it('exposes only the approved four slot names: body/date/links do not replace output', async () => {
    const unsupported = vi.fn(() => [h('aside', 'Unsupported slot')])
    const props = { entries: [complete()] }
    expect(await render(props, { body: unsupported, date: unsupported, links: unsupported })).toBe(await render(props))
    expect(unsupported).not.toHaveBeenCalled()
  })
})

describe('VitaSection public slot context', () => {
  it('gives all four slots the same processed display data, original entry and zero-based index', async () => {
    const date = dateRange.parse({ from: 2023, to: 'present' })
    const item = entry({
      title: 'Ignored title',
      role: { text: '*Chosen* title', html: '<em>Chosen</em> title' },
      date, term: 'Winter <2025/26>', event: 'Winter <2025/26>',
      institution: { label: 'University', url: '/base/university/' },
      issuer: { label: 'Not selected', url: '/unused/' }, location: 'Graz',
      url: '/base/talk/', note: '', slides: '/base/slides.pdf', ongoing: true,
      arbitrary: { nested: ['kept', 42] }, links: [{ label: 'Not a default link', url: '/other/' }],
    })
    const contexts: VitaSectionSlotProps[] = []
    const capture = (context: VitaSectionSlotProps) => {
      contexts.push(context)
      return []
    }
    const props = { entries: [item], titleFields: ['missing', 'role'] }
    await render(props, { title: capture, meta: capture, note: capture })
    // A separate render is needed: the whole body intentionally takes priority
    // over the named regions, so they cannot run together.
    await render(props, { default: capture })
    const expected: VitaSectionDisplay = {
      titleHtml: '<em>Chosen</em> title', titleUrl: '/base/talk/', date, term: 'Winter <2025/26>',
      meta: [
        { kind: 'text', text: 'Winter <2025/26>' },
        { kind: 'linked', linked: { label: 'University', url: '/base/university/' } },
        { kind: 'text', text: 'Graz' },
      ],
      note: '', links: [{ label: 'Slides', url: '/base/slides.pdf' }], ongoing: true,
    }
    expect(contexts).toHaveLength(4)
    for (const context of contexts) {
      expect(context.entry).toBe(item)
      expect(context.index).toBe(0)
      expect(context.display).toEqual(expected)
      expect(context.display.date).toBe(date)
      expect(context.entry.arbitrary).toBe(item.arbitrary)
    }
    // Slot processing must not remove the term, title field or unknown fields
    // from the actual entry while selecting web-only display metadata.
    expect(item.term).toBe('Winter <2025/26>')
    expect(item.role).toEqual({ text: '*Chosen* title', html: '<em>Chosen</em> title' })
    expect(item.arbitrary).toEqual({ nested: ['kept', 42] })
  })

  it('normalises absent/invalid optional display fields without inventing values', async () => {
    const contexts: VitaSectionSlotProps[] = []
    const items = [
      entry({ title: undefined }),
      entry({ id: 'section-1', url: 42, term: '', note: null, slides: { url: '/no.pdf' }, ongoing: 'true' }),
    ]
    await render({ entries: items }, {
      default: (context: VitaSectionSlotProps) => { contexts.push(context); return [] },
    })
    expect(contexts[0]!.display.titleHtml).toBe('')
    for (const { display } of contexts) {
      expect(display.titleUrl).toBeUndefined()
      expect(display.date).toBeUndefined()
      expect(display.term).toBeUndefined()
      expect(display.meta).toEqual([])
      expect(display.note).toBeUndefined()
      expect(display.links).toEqual([])
      expect(display.ongoing).toBe(false)
    }
  })

  it('slots receive loader-rendered rich HTML and deployment-base URLs exactly once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitakit-section-slots-'))
    try {
      await mkdir(join(root, 'content'))
      await writeFile(join(root, 'content/profile.yml'), 'name: Example\nsummary: Example site\n')
      await writeFile(join(root, 'content/talks.yml'), [
        '- date: 2025', '  title: "A *rich* talk"', '  url: /talk/', '  slides: /slides/talk.pdf',
      ].join('\n'))
      await writeFile(join(root, 'content/teaching.yml'), [
        '- date: 2025', '  title: A course', '  term: Winter 2025/26',
        '  institution: { name: Uni, url: /university/ }',
      ].join('\n'))
      const content = await loadContent(root, { baseURL: '/my-site/' })
      expect(content.issues).toEqual([])
      const items = [...content.sections.talks!, ...content.sections.teaching!]
      const received: VitaSectionSlotProps[] = []
      const html = await render({ entries: items }, {
        title: (context: VitaSectionSlotProps) => {
          received.push(context)
          return [h('h2', { innerHTML: context.display.titleHtml })]
        },
      })
      expect(received[0]!.entry).toBe(items[0])
      expect(received[1]!.entry).toBe(items[1])
      expect(received[0]!.display.titleHtml).toBe('A <em>rich</em> talk')
      expect(received[0]!.display.titleUrl).toBe('/my-site/talk/')
      expect(received[0]!.display.links).toEqual([{ label: 'Slides', url: '/my-site/slides/talk.pdf' }])
      expect(received[1]!.display.meta).toContainEqual({
        kind: 'linked', linked: { label: 'Uni', url: '/my-site/university/' },
      })
      expect(html).toContain('<h2>A <em>rich</em> talk</h2>')
      expect(html).toContain('href="/my-site/university/"')
      expect(html).toContain('href="/my-site/slides/talk.pdf"')
      expect(html).not.toContain('/my-site/my-site/')
      expect(JSON.stringify(received.map(context => context.display))).not.toContain('__vitakitPath')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('VitaSection selection and slot indexes', () => {
  it('uses id lookup, preserves displayed order, and indexes only entries retained by limit', async () => {
    const items = [entry({ id: 'z' }), entry({ id: 'a' }), entry({ id: 'm' })]
    lookup.mockReset().mockReturnValue(items)
    const contexts: VitaSectionSlotProps[] = []
    const html = await render({ id: 'custom-section', limit: 2 }, {
      default: (context: VitaSectionSlotProps) => {
        contexts.push(context)
        return [h('article', `${context.index}: ${context.entry.id}`)]
      },
    })
    expect(lookup).toHaveBeenCalledWith('custom-section')
    expect(contexts.map(context => context.index)).toEqual([0, 1])
    expect(contexts[0]!.entry).toBe(items[0])
    expect(contexts[1]!.entry).toBe(items[1])
    expect(html).toContain('<article>0: z</article>')
    expect(html).toContain('<article>1: a</article>')
    expect(html.match(/<li /g)).toHaveLength(2)
    expect(items).toHaveLength(3)
  })

  it('explicit entries take precedence over id and keep their identity and order', async () => {
    lookup.mockReset().mockReturnValue([entry({ id: 'lookup-only' })])
    const items = [entry({ id: 'second' }), entry({ id: 'first' })]
    const seen: VitaSectionSlotProps[] = []
    await render({ id: 'ignored', entries: items }, {
      note: (context: VitaSectionSlotProps) => { seen.push(context); return [] },
    })
    expect(lookup).not.toHaveBeenCalled()
    expect(seen.map(context => context.index)).toEqual([0, 1])
    expect(seen[0]!.entry).toBe(items[0])
    expect(seen[1]!.entry).toBe(items[1])
  })

  it.each([{}, { entries: [] }, { entries: [], id: 'ignored' }, { id: 'empty' }])('empty selection renders no list and invokes no slots: %j', async (props) => {
    lookup.mockReset().mockReturnValue([])
    const slot = vi.fn(() => [h('aside', 'Must not render')])
    const html = await render(props, { default: slot, title: slot, meta: slot, note: slot })
    expect(html).toBe('')
    expect(slot).not.toHaveBeenCalled()
    if ('entries' in props) expect(lookup).not.toHaveBeenCalled()
  })

  it('keeps the existing zero-limit semantics (no limit) and indexes every displayed entry', async () => {
    const seen: number[] = []
    await render({ entries: [entry(), entry({ id: 'section-1' })], limit: 0 }, {
      default: ({ index }: VitaSectionSlotProps) => { seen.push(index); return [] },
    })
    expect(seen).toEqual([0, 1])
  })

  it('does not introduce filtering or sorting for explicitly provided entries', async () => {
    const items = [entry({ id: 'cv', visibility: 'cv' }), entry({ id: 'private', visibility: 'private' })]
    const seen: Entry[] = []
    await render({ entries: items }, {
      default: ({ entry }: VitaSectionSlotProps) => { seen.push(entry); return [] },
    })
    expect(seen).toEqual(items)
    expect(seen[0]).toBe(items[0])
    expect(seen[1]).toBe(items[1])
  })
})
