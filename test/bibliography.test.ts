/**
 * `content/publications.bib` on the website: grouping, links, the citation
 * style, and `schemas/publications.ts`.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultCslStyle, defaultPublications, loadPublications } from '../src/bibliography'
import { resolvePublications, type PublicationsInput } from '../src/publications'
import { loadContent } from '../src/content'
import { createRenderer } from '../src/render'
import { eject } from '../src/cli'
import { importPackage, PACKAGE_ENTRY, project, writeFiles } from './support/project'
import { renderGroups } from './support/publications'

const BIB = [
  '@article{art, author = {Doe, Jane}, title = {Article with a URL and a DOI}, journal = {J. Comb.},',
  '  year = {2020}, doi = {10.1000/xyz}, url = {https://example.org/art}, status = {published}}',
  '@book{book, author = {Doe, Jane}, title = {A book with a DOI}, publisher = {Springer},',
  '  year = {2019}, doi = {10.1000/book}, status = {published}}',
  '@misc{slides, author = {Doe, Jane}, title = {Slides}, howpublished = {\\url{https://example.org/slides}},',
  '  year = {2023}, status = {other}}',
  '@phdthesis{thesis, author = {Doe, Jane}, title = {My thesis}, school = {TU Graz}, year = {2017},',
  '  url = {https://example.org/thesis}, status = {other}}',
  '',
].join('\n')

/** The groups of a .bib file, with settings as `schemas/publications.ts` would give them. */
async function groups(bib = BIB, input: PublicationsInput = {}, baseURL?: string) {
  const root = await project({ 'publications.bib': bib })
  return loadPublications(join(root, 'publications.bib'), createRenderer({ baseURL }), resolvePublications(input, defaultPublications), baseURL)
}

/** The list as `VitaPublications` lays it out. */
const html = async (bib = BIB, input: PublicationsInput = {}) => renderGroups(await groups(bib, input))

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** A link to `url` around `title`; styles add italics and quotes inside it, so only the text counts. */
const titleLink = (url: string, title: string) =>
  new RegExp(`<a href="${escapeRegExp(url)}">(?:(?!</a>).)*${escapeRegExp(title)}(?:(?!</a>).)*</a>`)

describe('grouping', () => {
  it('groups by status in the configured order, newest first, as data', async () => {
    const [published, other] = await groups()
    expect(published).toMatchObject({ id: 'published', label: 'Published', count: 2 })
    expect(published!.entries.map(entry => entry.key)).toEqual(['art', 'book'])
    expect(other!.entries.map(entry => entry.key)).toEqual(['slides', 'thesis'])

    const art = published!.entries[0]!
    expect(art.titleUrl).toBe('https://example.org/art')
    expect(art.badges).toEqual([{ field: 'doi', value: '10.1000/xyz', label: 'DOI', url: 'https://doi.org/10.1000/xyz', className: 'vita-badge' }])
    // The badges are data, not in the HTML too; the list around the entry is gone.
    expect(art.html).toMatch(titleLink('https://example.org/art', 'Article with a URL and a DOI'))
    expect(art.html).not.toMatch(/>DOI<|bib-links|<\/?(?:ol|li)\b/)
  })

  it('puts an entry without status in the default group, in any capitalisation', async () => {
    const [published] = await groups('@misc{a, title = {A}, year = {2024}}\n@misc{b, title = {B}, year = {2023}, status = {Published}}\n')
    expect(published!.entries.map(entry => entry.key)).toEqual(['a', 'b'])
  })

  it('orders by month where an entry has one', async () => {
    const [group] = await groups([
      '@article{march, title = {March}, journal = {J}, year = {2020}, month = {3}}',
      '@article{yearonly, title = {Year only}, journal = {J}, year = {2020}}',
      '@article{november, title = {November}, journal = {J}, year = {2020}, month = {11}}',
      '@article{older, title = {Older}, journal = {J}, year = {2019}, month = {12}}',
    ].join('\n'))
    expect(group!.entries.map(entry => entry.key)).toEqual(['november', 'march', 'yearonly', 'older'])
  })

  it('formats a group as a whole, so numbers and year suffixes are right', async () => {
    const bib = '@article{first, author = {Doe, Jane}, title = {First}, journal = {J}, year = {2024}, month = {6}}\n'
      + '@article{second, author = {Doe, Jane}, title = {Second}, journal = {J}, year = {2024}, month = {2}}\n'
    const apa = (await groups(bib, { cslStyle: 'apa' }))[0]!.entries.map(entry => entry.html)
    expect(apa[0]).toContain('2024b')
    expect(apa[1]).toContain('2024a')

    // A numbered style keeps its number and text apart, for CSS.
    const vancouver = (await groups(bib, { cslStyle: 'vancouver' }))[0]!.entries.map(entry => entry.html)
    expect(vancouver[0]).toMatch(/^<div class="csl-left-margin">1\. <\/div><div class="csl-right-inline">/)
    expect(vancouver[1]).toMatch(/^<div class="csl-left-margin">2\. <\/div>/)
  })
})

describe('links and identifiers', () => {
  // Most standard styles print the DOI and URL; the bundled one does not.
  it.each([undefined, 'apa', 'vancouver', 'harvard1'])('are linked once and not printed as text, with %s', async (cslStyle) => {
    const list = await html(BIB, { cslStyle })
    expect(list).toMatch(titleLink('https://example.org/art', 'Article with a URL and a DOI'))
    expect(list.match(/https:\/\/doi\.org\/10\.1000\/xyz/g)).toHaveLength(1)
    expect(list).toContain('href="https://doi.org/10.1000/book"')
    const unlinked = list.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, '')
    expect(unlinked).not.toMatch(/https?:\/\/|10\.1000|Available (?:at|from)/i)
  })

  it('link the title to a URL citation-js derived from howpublished', async () => {
    expect(await html(BIB, { cslStyle: 'apa' })).toMatch(titleLink('https://example.org/slides', 'Slides'))
  })

  it('accept DOI and arXiv identifiers as real exports write them', async () => {
    const list = await html([
      '@article{a, title = {A}, journal = {J}, year = {2026}, doi = {https://doi.org/10.1016/j.jde.2026.114340}}',
      '@article{b, title = {B}, journal = {J}, year = {2025}, doi = {doi:10.1515/acv-2025-0015}}',
      '@article{c, title = {On {De Giorgi\'s} conjecture}, journal = {J}, year = {2024}, eprinttype = {arxiv}, eprint = {2410.23908}}',
      '@misc{d, title = {D}, year = {2023}, eprint = {2301.00001v2}, archivePrefix = {arXiv}, primaryClass = {math.CO}}',
      '@misc{e, title = {E}, year = {2022}, eprint = {hal-01234567}, eprinttype = {hal}}',
    ].join('\n'))
    const hrefs = [...list.matchAll(/class="vita-badge" href="([^"]*)"/g)].map(match => match[1])
    expect(hrefs).toEqual([
      'https://doi.org/10.1016/j.jde.2026.114340',
      'https://doi.org/10.1515/acv-2025-0015',
      'https://arxiv.org/abs/2410.23908',
      'https://arxiv.org/abs/2301.00001',
    ])
    expect(list).toMatch(titleLink('https://arxiv.org/abs/2410.23908', 'On De Giorgi’s conjecture'))
  })

  it('pointing into public/ get the base path, full URLs do not', async () => {
    const bib = `@article{local, title = {Local PDF}, journal = {J}, year = {2021}, url = {/papers/local.pdf}, slides = {graz2024}}\n${BIB}`
    const badges = [{ field: 'slides', label: 'Slides', url: '/slides/$1.pdf' }]
    const [published] = await groups(bib, { badges }, '/site/')
    const [local, art] = published!.entries
    expect(local!.titleUrl).toBe('/site/papers/local.pdf')
    expect(local!.html).toMatch(titleLink('/site/papers/local.pdf', 'Local PDF'))
    expect(local!.badges.map(badge => badge.url)).toEqual(['/site/slides/graz2024.pdf'])
    expect(art!.titleUrl).toBe('https://example.org/art')
  })
})

describe('formatting', () => {
  it('writes readable genres instead of BibTeX entry types', async () => {
    const list = await html()
    expect(list).toContain('PhD thesis')
    expect(list).not.toContain('phdthesis')
  })

  it('does not end an entry with a stray period', async () => {
    const [group] = await groups('@online{web, author = {Doe, Jane}, title = {Web}, url = {https://e.org}, year = {2024}}\n')
    expect(group!.entries[0]!.html).not.toMatch(/\.\s*(?:<[^>]*>\s*)*\.\s*(?:<[^>]*>)*$/)
  })

  it('keeps upright emphasis inside an italic title', async () => {
    const list = await html('@article{e, title = {On \\emph{trees}}, journal = {J}, year = {2024}, doi = {10.1000/e}}\n')
    expect(list).toContain('<i>On <span style="font-style:normal;">trees</span></i>')
  })

  it('typesets formulas in titles, inside the title link', async () => {
    const list = await html('@article{m, title = {Trees of height $h$}, journal = {J}, year = {2020}, doi = {10.1000/m}}\n')
    expect(list).toMatch(/<a href="https:\/\/doi\.org\/10\.1000\/m">(?:(?!<\/a>).)*class="katex"/)
    expect(list).not.toMatch(/bibmathplaceholder|\$h\$/i)
  })

  it('keeps the lines of a style that uses display="block"', async () => {
    const style = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">',
      '  <info><title>Lines</title><id>lines</id><updated>2026-01-01T00:00:00+00:00</updated></info>',
      '  <citation><layout><text variable="title"/></layout></citation>',
      '  <bibliography><layout><names variable="author" display="block"/><text variable="title" display="block"/></layout></bibliography>',
      '</style>',
    ].join('\n')
    const root = await project({ 'lines.csl': style })
    const [published] = await groups(BIB, { cslStyle: join(root, 'lines.csl') })
    expect(published!.entries[0]!.html).toMatch(/^<div class="csl-block">Jane Doe<\/div>\s*<div class="csl-block"><a [^>]*>Article with a URL and a DOI<\/a><\/div>$/)
  })
})

describe('the citation style of a project', () => {
  const MARKER = 'CUSTOM-STYLE'
  const marked = (style: string) => style.replace('<layout>', `<layout prefix="${MARKER} ">`)
  const site = () => project({ 'content/profile.yml': 'name: Jane Doe\n', 'content/publications.bib': BIB })
  const list = async (root: string) => renderGroups((await loadContent(root)).publications)

  it('is content/publications.csl, found without configuration; eject writes it there', async () => {
    const root = await site()
    expect(await list(root)).not.toContain(MARKER)

    const { path } = await eject('publications.csl', root)
    expect(path).toBe(join(root, 'content/publications.csl'))
    await writeFile(path, marked(await readFile(path, 'utf8')))
    expect(await list(root)).toContain(MARKER)
  })

  it('may be set as cslStyle: a path relative to the project, or a built-in name', async () => {
    const settings = (cslStyle: string) => ({ 'schemas/publications.ts': `${importPackage('publications')}export default publications({ cslStyle: '${cslStyle}' })\n` })
    const local = await site()
    await writeFiles(local, { 'styles/mine.csl': marked(await readFile(defaultCslStyle, 'utf8')), ...settings('styles/mine.csl') })
    expect(await list(local)).toContain(MARKER)

    const builtin = await site()
    await writeFiles(builtin, settings('apa'))
    expect(await list(builtin)).toContain('Doe, J. (2020)')
  })
})

describe('schemas/publications.ts', () => {
  const BIB = [
    '@article{paper, author = {Doe, Jane}, title = {A paper}, journal = {J}, year = {2024}, project = {Alpha}}',
    '@misc{slides, author = {Doe, Jane}, title = {Some slides}, year = {2023}, status = {Talk-Slides}}',
    '',
  ].join('\n')
  const site = (settings?: string) => project({
    'content/profile.yml': 'name: Jane Doe\n',
    'content/publications.bib': BIB,
    ...settings === undefined ? {} : { 'schemas/publications.ts': `${importPackage('publications')}export default publications(${settings})\n` },
  })
  const GROUPS = `groups: [{ id: 'papers', label: 'Papers' }, { id: 'talk-slides', label: 'Slides' }]`

  it('defines the groups, the default group and the fields handed to the website', async () => {
    const { publications } = await loadContent(await site(`{ ${GROUPS}, fields: ['project'] }`))
    expect(publications.map(group => [group.id, group.label, group.entries.map(entry => [entry.key, entry.fields])])).toEqual([
      ['papers', 'Papers', [['paper', { project: 'Alpha' }]]], // no status: the first group
      ['talk-slides', 'Slides', [['slides', {}]]],
    ])
  })

  it.each([
    [`{ groups: [{ id: 'Talk slides', label: 'Slides' }] }`, /schemas\/publications\.ts: invalid\n.*lowercase id/],
    [`{ groups: [{ id: 'papers', label: 'Papers' }], defaultGroup: 'published' }`, /defaultGroup "published" is not one of the groups \(papers\)/],
    [`{ groups: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }`, /group "a" is defined twice/],
    [`{ badge: [] }`, /Unrecognized key: "badge"/],
  ])('rejects %s, naming the file', async (settings, message) => {
    await expect(loadContent(await site(settings))).rejects.toThrow(message)
  })

  it('names the file where the groups are defined when a status is unknown', async () => {
    await expect(loadContent(await site())).rejects.toThrow(/unknown status talk-slides on slides; expected one of .* \(groups are defined in schemas\/publications\.ts\)/)
  })

  it('takes effect when edited, without a restart', async () => {
    const root = await site(`{ ${GROUPS} }`)
    expect((await loadContent(root)).publications.map(group => group.label)).toEqual(['Papers', 'Slides'])
    // The modification time is part of the import URL; make sure it differs.
    await new Promise(resolve => setTimeout(resolve, 20))
    await writeFile(join(root, 'schemas/publications.ts'), `${importPackage('publications')}export default publications({ ${GROUPS.replace('Papers', 'Articles')} })\n`)
    expect((await loadContent(root)).publications.map(group => group.label)).toEqual(['Articles', 'Slides'])
  })

  it('can be ejected as a copy of the defaults', async () => {
    const root = await project({ 'content/profile.yml': 'name: Jane Doe\n', 'content/publications.bib': BIB.replace('Talk-Slides', 'other') })
    const defaults = (await loadContent(root)).publications

    const { path } = await eject('publications', root)
    expect(path).toBe(join(root, 'schemas/publications.ts'))
    const source = await readFile(path, 'utf8')
    expect(source).toContain(`import { badgePresets, publications } from '@anja.codes/vitakit'`)

    await writeFile(path, source.replace(`'@anja.codes/vitakit'`, `'${PACKAGE_ENTRY}'`))
    expect((await loadContent(root)).publications).toEqual(defaults)
  })
})
