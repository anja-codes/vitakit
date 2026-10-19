import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { emitDocument } from '../src/tex/emit'
import { documentSchema, selectEntries } from '../src/tex/documents'
import { createRenderer } from '../src/render'
import { discoverSections, loadSection } from '../src/sections'

const renderer = createRenderer()
const options = (partial: unknown = {}) => documentSchema.parse(partial)

async function talks(yaml: string) {
  const root = await mkdtemp(join(tmpdir(), 'vitakit-tex-'))
  await mkdir(join(root, 'content'), { recursive: true })
  await writeFile(join(root, 'content/talks.yml'), yaml)
  const [source] = await discoverSections(root)
  return { root, entries: await loadSection(source!, { maxVisibility: 'private', renderer }) }
}

const SAMPLE = [
  '- { date: 2025, title: Invited one, kind: invited }',
  '- { date: 2024, title: Contributed one, kind: contributed }',
  '- { date: 2019, title: Old invited, kind: invited }',
  '- { date: 2023, title: Private one, kind: invited, visibility: private }',
].join('\n')

describe('document selection', () => {
  it('filters by visibility level', async () => {
    const { entries } = await talks(SAMPLE)
    expect(selectEntries(entries, options({ visibility: 'public' }), 'talks')).toHaveLength(3)
    expect(selectEntries(entries, options({ visibility: 'private' }), 'talks')).toHaveLength(4)
  })

  it('selects by field, year window and count', async () => {
    const { entries } = await talks(SAMPLE)
    const select = (sections: unknown) =>
      selectEntries(entries, options({ visibility: 'private', sections }), 'talks')

    expect(select({ talks: { where: { kind: 'invited' } } })).toHaveLength(3)
    expect(select({ talks: { where: { kind: ['invited', 'contributed'] } } })).toHaveLength(4)
    expect(select({ talks: { where: { kind: 'invited' }, since: 2020 } })).toHaveLength(2)
    expect(select({ talks: { since: 2024 } })).toHaveLength(2)
    expect(select({ talks: { until: 2023 } })).toHaveLength(2)
    expect(select({ talks: { limit: 1 } })).toHaveLength(1)
    // A section with no options is untouched.
    expect(select({})).toHaveLength(4)
  })

  it('compares links by label, like institutions by name', () => {
    const entries = [{ id: 'a', visibility: 'public' as const, referee: { label: 'Jane Doe', url: 'https://example.org' } }]
    expect(selectEntries(entries, options({ sections: { referees: { where: { referee: 'Jane Doe' } } } }), 'referees')).toHaveLength(1)
  })

  it('rejects selection keys that do not exist', async () => {
    const { entries } = await talks(SAMPLE)
    // The old query language is gone; a stale `filter:` must say so, not be ignored.
    expect(() => options({ sections: { talks: { filter: 'kind = invited' } } }))
      .toThrow()
    expect(selectEntries(entries, options({}), 'talks')).toHaveLength(3)
  })
})

describe('emitDocument', () => {
  const emit = async (yaml: string, documentOptions: unknown = {}) => {
    const { root, entries } = await talks(yaml)
    const outDir = join(root, 'cv-tex/generated/cv')
    await emitDocument({
      sections: { talks: entries },
      publications: [],
      options: options(documentOptions),
      templateDir: join(root, 'cv-tex/templates'),
      outDir,
    })
    return readFile(join(outDir, 'talks.tex'), 'utf8')
  }

  it('emits one macro call per entry, with math preserved', async () => {
    const tex = await emit('- { date: 2024-03, title: Random $k$-ary trees, event: AofA & friends }')
    expect(tex).toContain('\\vitaentry{Mar 2024}{Random $k$-ary trees}{AofA \\& friends}')
  })

  it('leaves no blank lines, which would break \\par continuations', async () => {
    const tex = await emit(SAMPLE)
    expect(tex).not.toMatch(/\n\s*\n/)
  })

  it('escapes special characters in every field', async () => {
    const tex = await emit('- { date: 2024, title: "100% of #1", location: "a_b" }')
    expect(tex).toContain('100\\% of \\#1')
    expect(tex).toContain('a\\_b')
  })

  it('fails on unbalanced math rather than emitting broken TeX', async () => {
    await expect(emit('- { date: 2024, title: "broken $k" }')).rejects.toThrow(/unbalanced math/)
  })

  it('prefers a template from the repo over the bundled one', async () => {
    const { root, entries } = await talks('- { date: 2024, title: A talk }')
    const templateDir = join(root, 'cv-tex/templates')
    await mkdir(templateDir, { recursive: true })
    await writeFile(join(templateDir, 'talks.eta'), '<% for (const t of it.entries) { %>MINE: <%~ it.text(t.title) %><% } %>')

    const outDir = join(root, 'cv-tex/generated/cv')
    await emitDocument({ sections: { talks: entries }, publications: [], options: options(), templateDir, outDir })
    expect(await readFile(join(outDir, 'talks.tex'), 'utf8')).toContain('MINE: A talk')
  })

  it('falls back to the generic template for an unknown section', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitakit-tex-'))
    const outDir = join(root, 'generated')
    await emitDocument({
      sections: { outreach: [{ id: 'o-0', visibility: 'public', title: { text: 'A visit', html: 'A visit' }, location: 'Graz' }] },
      publications: [],
      options: options(),
      templateDir: join(root, 'templates'),
      outDir,
    })
    expect(await readFile(join(outDir, 'outreach.tex'), 'utf8')).toContain('\\vitaentry{}{A visit}{Graz}')
  })
})
