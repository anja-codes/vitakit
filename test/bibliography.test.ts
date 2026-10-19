/**
 * The website's publication list: what a style prints, and how a project
 * replaces the style.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultCslStyle, defaultPublications, loadPublications } from '../src/bibliography'
import { resolvePublications, type PublicationsInput } from '../src/publications'
import { loadContent } from '../src/content'
import { createRenderer } from '../src/render'
import { builtinSchemaSource } from '../src/cli/schema-source'
import { cli } from './cli'
import { renderGroups } from './publications'

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

async function bibFile(contents = BIB): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vitakit-bib-'))
  const path = join(dir, 'publications.bib')
  await writeFile(path, contents)
  return path
}

/** Settings as `schemas/publications.ts` would give them. */
const settings = (input: PublicationsInput) => resolvePublications(input, defaultPublications)

async function format(cslStyle?: string, contents = BIB): Promise<string> {
  const groups = await loadPublications(await bibFile(contents), createRenderer(), settings({ cslStyle }))
  return renderGroups(groups)
}

/** A project's `schemas/publications.ts`, importing the package from source. */
async function writeSettings(root: string, body: string): Promise<string> {
  const path = join(root, 'schemas/publications.ts')
  await mkdir(join(root, 'schemas'), { recursive: true })
  await writeFile(path, `import { publications } from '${join(process.cwd(), 'src/index.ts')}'\nexport default ${body}\n`)
  return path
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/**
 * A link to `url` around `title`. Styles format titles differently -- italics
 * inside the link, quotes and punctuation with it -- so only the text counts.
 */
const titleLink = (url: string, title: string) =>
  new RegExp(`<a href="${escapeRegExp(url)}">(?:(?!</a>).)*${escapeRegExp(title)}(?:(?!</a>).)*</a>`)

/** The text of an entry outside its links: what a reader sees as raw text. */
const unlinkedText = (html: string) => html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, '')

describe('linked identifiers are not printed twice', () => {
  // Most standard styles print the DOI and URL; the bundled one does not, so
  // the interesting cases are the others.
  for (const style of [undefined, 'apa', 'vancouver', 'harvard1']) {
    it(`with ${style ?? 'the bundled style'}`, async () => {
      const html = await format(style)
      // Links are still there: the title and the DOI badge.
      expect(html).toMatch(titleLink('https://example.org/art', 'Article with a URL and a DOI'))
      expect(html).toContain('<a class="vita-badge" href="https://doi.org/10.1000/xyz">DOI</a>')
      expect(html).toContain('href="https://doi.org/10.1000/book"')
      // ... but no identifier appears as text, linkified or not.
      const text = unlinkedText(html)
      expect(text).not.toMatch(/https?:\/\//)
      expect(text).not.toMatch(/10\.1000/)
      expect(html.match(/https:\/\/doi\.org\/10\.1000\/xyz/g)).toHaveLength(1)
      expect(html).not.toMatch(/Available (?:at|from)/i)
    })
  }

  it('keeps the title link when citation-js derived the URL from howpublished', async () => {
    expect(await format('apa')).toMatch(titleLink('https://example.org/slides', 'Slides'))
  })

  it('writes readable genres instead of BibTeX entry types', async () => {
    const html = await format()
    expect(html).toContain('PhD thesis')
    expect(html).not.toContain('phdthesis')
  })

  it('does not end an entry with a stray period', async () => {
    const html = await format(undefined, '@online{web, author = {Doe, Jane}, title = {Web}, url = {https://e.org}, year = {2024}}\n')
    expect(html).not.toMatch(/\.\s*\./)
  })
})

describe('fields as real exports write them', () => {
  // Shapes taken from a real project's .bib (JabRef, Zotero, publisher pages).
  const EXPORTED = [
    '@article{url, author = {Doe, Jane}, title = {URL-form DOI}, journal = {J}, year = {2026},',
    '  doi = {https://doi.org/10.1016/j.jde.2026.114340}, status = {published}}',
    '@article{colon, author = {Doe, Jane}, title = {Prefixed DOI}, journal = {J}, year = {2025},',
    '  doi = {doi:10.1515/acv-2025-0015}, status = {published}}',
    '@article{biblatex, author = {Doe, Jane}, title = {On {De Giorgi\'s} conjecture}, journal = {J}, year = {2024},',
    '  eprinttype = {arxiv}, eprint = {2410.23908}, status = {published}}',
    '@misc{arxivexport, author = {Doe, Jane}, title = {From the arXiv export}, year = {2023},',
    '  eprint = {2301.00001v2}, archivePrefix = {arXiv}, primaryClass = {math.CO}, status = {preprint}}',
    '@misc{hal, author = {Doe, Jane}, title = {Not arXiv}, year = {2022},',
    '  eprint = {hal-01234567}, eprinttype = {hal}, status = {preprint}}',
    '',
  ].join('\n')

  it('links a DOI written as a URL or with a doi: prefix', async () => {
    const html = await format(undefined, EXPORTED)
    expect(html).toContain('href="https://doi.org/10.1016/j.jde.2026.114340">DOI')
    expect(html).toContain('href="https://doi.org/10.1515/acv-2025-0015">DOI')
    expect(html).not.toMatch(/doi\.org\/(?:https?:|doi:)/)
  })

  it('reads arXiv ids from eprint with eprinttype or archivePrefix', async () => {
    const html = await format(undefined, EXPORTED)
    expect(html).toContain('href="https://arxiv.org/abs/2410.23908">arXiv')
    expect(html).toContain('href="https://arxiv.org/abs/2301.00001">arXiv')
    expect(html).not.toContain('hal-01234567"')
  })

  it('links a title containing an apostrophe', async () => {
    for (const style of [undefined, 'apa']) {
      expect(await format(style, EXPORTED)).toMatch(titleLink('https://arxiv.org/abs/2410.23908', 'On De Giorgi’s conjecture'))
    }
  })
})

describe('the list on the website', () => {
  it('links a file in public/ under the base path, and leaves full URLs alone', async () => {
    const bib = await bibFile([
      '@article{local, author = {Doe, Jane}, title = {Local PDF}, journal = {J}, year = {2021}, url = {/papers/local.pdf}}',
      BIB,
    ].join('\n'))
    const html = async (baseURL?: string) =>
      renderGroups(await loadPublications(bib, createRenderer({ baseURL }), defaultPublications, baseURL))

    expect(await html()).toMatch(titleLink('/papers/local.pdf', 'Local PDF'))
    const underBase = await html('/site/')
    expect(underBase).toMatch(titleLink('/site/papers/local.pdf', 'Local PDF'))
    expect(underBase).toMatch(titleLink('https://example.org/art', 'Article with a URL and a DOI'))
    expect(underBase).toContain('href="https://doi.org/10.1000/xyz"')
  })

  it('lists newest first, by month where an entry has one', async () => {
    const html = await format(undefined, [
      '@article{march, author = {Doe, Jane}, title = {March}, journal = {J}, year = {2020}, month = {3}}',
      '@article{yearonly, author = {Doe, Jane}, title = {Year only}, journal = {J}, year = {2020}}',
      '@article{november, author = {Doe, Jane}, title = {November}, journal = {J}, year = {2020}, month = {11}}',
      '@article{older, author = {Doe, Jane}, title = {Older}, journal = {J}, year = {2019}, month = {12}}',
      '',
    ].join('\n'))
    const order = ['November', 'March', 'Year only', 'Older'].map(title => html.indexOf(`<i>${title}</i>`))
    expect(order.every(index => index >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('gives each entry its reference as HTML and its badges as data', async () => {
    const [published] = await loadPublications(await bibFile(), createRenderer())
    expect(published!.entries.map(entry => entry.key)).toEqual(['art', 'book'])
    const art = published!.entries[0]!
    expect(art.titleUrl).toBe('https://example.org/art')
    expect(art.badges).toEqual([
      { field: 'doi', value: '10.1000/xyz', label: 'DOI', url: 'https://doi.org/10.1000/xyz', className: 'vita-badge' },
    ])
    // The badges are not in the HTML as well, and the list around it is gone.
    expect(art.html).toMatch(titleLink('https://example.org/art', 'Article with a URL and a DOI'))
    expect(art.html).not.toMatch(/>DOI<|bib-links|<\/?(?:ol|li)\b/)
  })

  it('gives badges pointing into public/ the base path', async () => {
    const bib = await bibFile('@misc{talk, author = {Doe, Jane}, title = {A talk}, year = {2024}, slides = {graz2024}}\n')
    const badges = [{ field: 'slides', label: 'Slides', url: '/slides/$1.pdf' }]
    const [group] = await loadPublications(bib, createRenderer({ baseURL: '/site/' }), settings({ badges }), '/site/')
    expect(group!.entries[0]!.badges.map(badge => badge.url)).toEqual(['/site/slides/graz2024.pdf'])
  })

  it('formats a group as a whole: numbers and year suffixes are right per entry', async () => {
    const same = [
      '@article{first, author = {Doe, Jane}, title = {First}, journal = {J}, year = {2024}, month = {6}}',
      '@article{second, author = {Doe, Jane}, title = {Second}, journal = {J}, year = {2024}, month = {2}}',
      '',
    ].join('\n')
    const entries = async (style: string) =>
      (await loadPublications(await bibFile(same), createRenderer(), settings({ cslStyle: style })))[0]!.entries

    const apa = (await entries('apa')).map(entry => entry.html)
    expect(apa.some(html => html.includes('2024a'))).toBe(true)
    expect(apa.some(html => html.includes('2024b'))).toBe(true)

    // A numbered style keeps its number and text apart, for CSS.
    const vancouver = (await entries('vancouver')).map(entry => entry.html)
    expect(vancouver[0]).toMatch(/^<div class="csl-left-margin">1\. <\/div><div class="csl-right-inline">/)
    expect(vancouver[1]).toMatch(/^<div class="csl-left-margin">2\. <\/div>/)
  })

  it('keeps the lines of a style that uses display="block"', async () => {
    const style = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">',
      '  <info><title>Lines</title><id>lines</id><updated>2026-01-01T00:00:00+00:00</updated></info>',
      '  <citation><layout><text variable="title"/></layout></citation>',
      '  <bibliography><layout>',
      '    <names variable="author" display="block"/>',
      '    <text variable="title" display="block"/>',
      '  </layout></bibliography>',
      '</style>',
    ].join('\n')
    expect((await format(style)).match(/<div class="csl-block">/g)?.length).toBeGreaterThanOrEqual(8)
  })

  it('keeps upright emphasis inside an italic title', async () => {
    const html = await format(undefined,
      '@article{emphasis, author = {Doe, Jane}, title = {On \\emph{trees}}, journal = {J}, year = {2024}, doi = {10.1000/emphasis}}\n')
    expect(html).toContain('<i>On <span style="font-style:normal;">trees</span></i>')
    expect(html).toMatch(titleLink('https://doi.org/10.1000/emphasis', 'On '))
  })

  it('typesets formulas in titles, and keeps the title linked', async () => {
    const html = await format(undefined,
      '@article{math, author = {Doe, Jane}, title = {Trees of height $h$}, journal = {J}, year = {2020}, doi = {10.1000/math}}\n')
    expect(html).toContain('class="katex"')
    expect(html).toMatch(/<a href="https:\/\/doi\.org\/10\.1000\/math">(?:(?!<\/a>).)*katex/)
    expect(html).not.toMatch(/bibmathplaceholder|\$h\$/i)
  })
})

describe('replacing the citation style', () => {
  const STYLE_MARKER = 'CUSTOM-STYLE'

  /** The bundled style with a visible marker in every entry. */
  async function markedStyle(): Promise<string> {
    const source = await readFile(defaultCslStyle, 'utf8')
    return source.replace('<layout>', `<layout prefix="${STYLE_MARKER} ">`)
  }

  async function project(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'vitakit-csl-'))
    await mkdir(join(root, 'content'), { recursive: true })
    await writeFile(join(root, 'content/profile.yml'), 'name: Jane Doe\n')
    await writeFile(join(root, 'content/publications.bib'), BIB)
    return root
  }

  const html = async (root: string, options?: PublicationsInput) => {
    if (options) await writeSettings(root, `publications(${JSON.stringify(options)})`)
    return renderGroups((await loadContent(root)).publications)
  }

  it('picks up content/publications.csl without configuration', async () => {
    const root = await project()
    expect(await html(root)).not.toContain(STYLE_MARKER)
    await writeFile(join(root, 'content/publications.csl'), await markedStyle())
    expect(await html(root)).toContain(STYLE_MARKER)
  })

  it('can be ejected to exactly that place, and then wins', async () => {
    const root = await project()
    const result = await cli(['eject', 'publications.csl', '--root', root, '--yes'], { cwd: root })
    expect(result.code, result.err).toBe(0)
    const path = join(root, 'content/publications.csl')
    // The copy is the bundled style: same output until it is edited.
    const before = await html(root)
    await writeFile(path, (await readFile(path, 'utf8')).replace('<layout>', `<layout prefix="${STYLE_MARKER} ">`))
    expect(before).not.toContain(STYLE_MARKER)
    expect(await html(root)).toContain(STYLE_MARKER)
  })

  it('resolves a relative cslStyle in schemas/publications.ts against the project', async () => {
    const root = await project()
    await mkdir(join(root, 'styles'))
    await writeFile(join(root, 'styles/mine.csl'), await markedStyle())
    expect(await html(root, { cslStyle: 'styles/mine.csl' })).toContain(STYLE_MARKER)
  })

  it('still accepts a built-in style name', async () => {
    expect(await html(await project(), { cslStyle: 'apa' })).toContain('Doe, J. (2020)')
  })
})

describe('schemas/publications.ts', () => {
  async function project(bib: string): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'vitakit-pubs-'))
    await mkdir(join(root, 'content'), { recursive: true })
    await writeFile(join(root, 'content/profile.yml'), 'name: Jane Doe\n')
    await writeFile(join(root, 'content/publications.bib'), bib)
    return root
  }

  const BIB = [
    '@article{paper, author = {Doe, Jane}, title = {A paper}, journal = {J}, year = {2024}, project = {Alpha}}',
    '@misc{slides, author = {Doe, Jane}, title = {Some slides}, year = {2023}, status = {Talk-Slides}}',
    '',
  ].join('\n')

  it('defines the groups, the default group and the fields handed to the website', async () => {
    const root = await project(BIB)
    await writeSettings(root, `publications({
      groups: [{ id: 'papers', label: 'Papers' }, { id: 'talk-slides', label: 'Slides' }],
      fields: ['project'],
    })`)
    const { publications } = await loadContent(root)
    expect(publications.map(group => [group.id, group.label, group.entries.map(entry => entry.key)])).toEqual([
      ['papers', 'Papers', ['paper']],   // no status: the first group
      ['talk-slides', 'Slides', ['slides']],
    ])
    expect(publications[0]!.entries[0]!.fields).toEqual({ project: 'Alpha' })
    expect(publications[1]!.entries[0]!.fields).toEqual({})
  })

  it('reports invalid settings with the file name', async () => {
    const root = await project(BIB)
    await writeSettings(root, `publications({ groups: [{ id: 'Talk slides', label: 'Slides' }] })`)
    await expect(loadContent(root)).rejects.toThrow(/schemas\/publications\.ts.*lowercase id/s)

    await writeSettings(root, `publications({ groups: [{ id: 'papers', label: 'Papers' }], defaultGroup: 'published' })`)
    await expect(loadContent(root)).rejects.toThrow(/defaultGroup "published" is not one of the groups \(papers\)/)
  })

  it('names the file where the groups are defined when a status is unknown', async () => {
    const root = await project(BIB)
    await expect(loadContent(root)).rejects.toThrow(/unknown status talk-slides.*schemas\/publications\.ts/s)
  })

  it('takes effect when edited, without a restart', async () => {
    const root = await project(BIB)
    await writeSettings(root, `publications({ groups: [{ id: 'papers', label: 'Papers' }, { id: 'talk-slides', label: 'Slides' }] })`)
    expect((await loadContent(root)).publications.map(group => group.label)).toEqual(['Papers', 'Slides'])
    // A different modification time is a different module to import.
    await new Promise(resolve => setTimeout(resolve, 20))
    await writeSettings(root, `publications({ groups: [{ id: 'papers', label: 'Articles' }, { id: 'talk-slides', label: 'Slides' }] })`)
    expect((await loadContent(root)).publications.map(group => group.label)).toEqual(['Articles', 'Slides'])
  })

  it('can be copied, and the copy is the defaults', async () => {
    const root = await project(BIB.replace('Talk-Slides', 'other'))
    const path = join(root, 'schemas/publications.ts')
    await mkdir(join(root, 'schemas'), { recursive: true })
    const source = await builtinSchemaSource('publications')
    expect(source).toContain(`from '@anja.codes/vitakit'`)
    expect(source).not.toMatch(/from '\.\.?\//)

    // Loaded (with the package imported from source here), it changes nothing.
    await writeFile(path, source.replace(`'@anja.codes/vitakit'`, `'${join(process.cwd(), 'src/index.ts')}'`))
    const ejected = (await loadContent(root)).publications
    await rm(path)
    expect(ejected).toEqual((await loadContent(root)).publications)
  })
})
