import { describe, expect, it } from 'vitest'
import * as shared from '../src/shared/index'
import type { Entry } from '../src/shared/index'
import { dateRange } from '../src/primitives'
import { documentSchema, selectEntries } from '../src/tex/documents'
import { compileVue, renderVue } from './support/vue'

const component = (name: string) => new URL(`../src/runtime/components/${name}.vue`, import.meta.url)
const talks: Entry[] = [
  { id: 'talks-0', visibility: 'public', date: dateRange.parse(2025), title: { text: 'Science one', html: 'Science one' }, kind: 'science' },
  { id: 'talks-1', visibility: 'public', date: dateRange.parse(2024), title: { text: 'Public one', html: 'Public one' }, kind: 'public', host: { label: 'BRG Viktring' } },
  { id: 'talks-2', visibility: 'public', date: dateRange.parse(2023), title: { text: 'Science two', html: 'Science two' }, kind: 'science', year: 1999 },
]
const imports = {
  '@anja.codes/vitakit/shared': shared,
  '#imports': { useSection: (id: string) => id === 'talks' ? talks : [] },
}
const VitaSection = compileVue(component('VitaSection'), imports)
const components = {
  VitaSection,
  VitaEntry: compileVue(component('VitaEntry'), imports),
  VitaDate: compileVue(component('VitaDate'), imports),
}
const clean = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')
const render = async (props: Record<string, unknown>) => clean(await renderVue(VitaSection, props, components))

describe('where, shared by the website and the PDF', () => {
  const cases: [string, shared.Where, string[]][] = [
    ['one value', { kind: 'science' }, ['talks-0', 'talks-2']],
    ['any of several', { kind: ['science', 'public'] }, ['talks-0', 'talks-1', 'talks-2']],
    ['a link by its label', { host: 'BRG Viktring' }, ['talks-1']],
    ['formatted text by its source', { title: 'Public one' }, ['talks-1']],
    ['the year of the date, unless the entry has its own year', { year: 2024 }, ['talks-1']],
    ['an own year field', { year: '1999' }, ['talks-2']],
    ['several fields at once', { kind: 'science', year: 2025 }, ['talks-0']],
    ['nothing', {}, ['talks-0', 'talks-1', 'talks-2']],
  ]

  it.each(cases)('matches %s', async (_label, where, ids) => {
    expect(shared.filterWhere(talks, where).map(entry => entry.id)).toEqual(ids)
    const document = documentSchema.parse({ visibility: 'private', sections: { talks: { where } } })
    expect(selectEntries(talks, document, 'talks').map(entry => entry.id)).toEqual(ids)
    const html = await render({ id: 'talks', where })
    for (const entry of talks) {
      expect(html.includes((entry.title as { text: string }).text), entry.id).toBe(ids.includes(entry.id))
    }
  })

  it('applies limit after where', async () => {
    const html = await render({ id: 'talks', where: { kind: 'science' }, limit: 1 })
    expect(html).toContain('Science one')
    expect(html).not.toContain('Science two')
  })
})

describe('VitaSection title', () => {
  it('wraps the list in a section with heading and anchor', async () => {
    const html = await render({ id: 'talks', title: 'Talks', where: { kind: 'public' } })
    expect(html).toMatch(/^<section id="talks" class="vita-section-group"><h2 class="vita-section-group__title">Talks<\/h2><ul class="vita-section">/)
    expect(html).toContain('Public one')
    expect(html).not.toContain('Science one')
  })

  it('renders neither heading nor list without entries', async () => {
    expect(await render({ id: 'talks', title: 'Talks', where: { kind: 'none' } })).toBe('')
    expect(await render({ id: 'unknown', title: 'Unknown' })).toBe('')
  })

  it('passes slots on to the list', async () => {
    const Parent = compileVue(new URL('./TitledParent.vue', import.meta.url), imports, `
      <script setup>defineProps([])</script>
      <template>
        <VitaSection id="talks" title="Talks" :where="{ kind: 'public' }">
          <template #note="{ entry }"><p class="custom">Kind: {{ entry.kind }}</p></template>
        </VitaSection>
      </template>
    `)
    const html = clean(await renderVue(Parent, {}, components))
    expect(html).toContain('<p class="custom">Kind: public</p>')
  })

  it('keeps the plain list without a title', async () => {
    expect(await render({ id: 'talks', where: { kind: 'public' } })).toMatch(/^<ul class="vita-section">/)
  })
})
