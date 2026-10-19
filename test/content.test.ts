/** `content/` in, one validated and rendered `VitakitContent` out. */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadContent } from '../src/content'
import { discoverSections, loadSection } from '../src/sections'
import { importFailure, importProjectModule } from '../src/issues'
import { createRenderer } from '../src/render'
import { importPackage, project } from './support/project'

const PROFILE = { 'content/profile.yml': 'name: Jane Doe\n' }
const titles = (entries: Record<string, unknown>[] = []) => entries.map(entry => (entry.title as { text: string }).text)

describe('section discovery', () => {
  it('pairs each content file with the built-in schema of the same name', async () => {
    const root = await project({ 'content/talks.yml': '[]', 'content/teaching.yaml': '[]', 'content/profile.yml': '' })
    const sources = await discoverSections(root)
    expect(sources.map(source => [source.id, source.schemaOrigin])).toEqual([['talks', 'built-in'], ['teaching', 'built-in']])
  })

  it('prefers schemas/<name>.ts from the project', async () => {
    const root = await project({
      'content/talks.yml': '- { date: 2024, headline: A talk }\n',
      'schemas/talks.ts': `${importPackage('section', 'dateRange', 'z')}export default section({ date: dateRange, headline: z.string() })\n`,
    })
    const [source] = await discoverSections(root)
    expect(source!.schemaOrigin).toBe('repo')
    expect((await loadSection(source!, { maxVisibility: 'public', renderer: createRenderer() }))[0]!.headline).toBe('A talk')
  })

  it.each([
    [{ 'content/hobbies.yml': '[]' }, /content\/hobbies\.yml: no schema for this file; create schemas\/hobbies\.ts/],
    [{ 'content/Research_Stays.yml': '[]' }, /content\/Research_Stays\.yml: file name must be lowercase kebab-case/],
    [{ 'content/talks.yml': '[]', 'schemas/talks.ts': 'export const nothing = 1\n' }, /schemas\/talks\.ts: must export a Zod schema/],
    [{}, /content\/: directory is missing/],
  ])('explains what to do: %j', async (files, message) => {
    await expect(discoverSections(await project(files))).rejects.toThrow(message)
  })
})

describe('sections', () => {
  const load = async (yaml: string, options: Parameters<typeof loadContent>[1] = {}) =>
    (await loadContent(await project({ ...PROFILE, 'content/talks.yml': yaml }), options)).sections.talks!

  it('sorts newest first, undated last, and numbers entries by their position in the file', async () => {
    const root = await project({
      ...PROFILE,
      'content/talks.yml': '- { date: 2020, title: Older }\n- { date: 2024-05, title: Newer }\n',
      'content/outreach.yml': '- { title: Undated }\n- { date: 2019, title: Dated }\n',
      'schemas/outreach.ts': `${importPackage('section', 'dateRange', 'text')}export default section({ date: dateRange.optional(), title: text })\n`,
    })
    const { sections } = await loadContent(root)
    expect(sections.talks!.map(entry => [entry.id, (entry.title as { text: string }).text])).toEqual([['talks-1', 'Newer'], ['talks-0', 'Older']])
    expect(sections.outreach!.map(entry => entry.title)).toEqual(['Dated', 'Undated'])
  })

  it('renders rich fields to { text, html }', async () => {
    const [entry] = await load('- { date: 2024, title: Random $k$-ary trees }')
    expect(entry!.title).toEqual({ text: 'Random $k$-ary trees', html: expect.stringContaining('class="katex"') })
  })

  it('includes entries up to the requested visibility', async () => {
    const yaml = '- { date: 2024, title: Public }\n- { date: 2023, title: CV, visibility: cv }\n- { date: 2022, title: Private, visibility: private }\n'
    expect(titles(await load(yaml))).toEqual(['Public'])
    expect(titles(await load(yaml, { maxVisibility: 'cv' }))).toEqual(['Public', 'CV'])
    expect(titles(await load(yaml, { maxVisibility: 'private' }))).toEqual(['Public', 'CV', 'Private'])
  })

  it('treats an empty file as an empty section', async () => {
    expect(await load('')).toEqual([])
  })

  it.each([
    ['- { date: 2024, titel: typo }\n', /content\/talks\.yml: invalid\n[^]*- 0: Unrecognized key: "titel"/],
    ['title: not a list\n', /content\/talks\.yml: expected a list of entries/],
    ['- [unclosed\n', /content\/talks\.yml: /],
    ['- { date: 2024, title: Broken $\\kk$ }\n', /content\/talks\.yml: 0\.title: invalid TeX/],
  ])('reports %j with the file, entry and field', async (yaml, message) => {
    await expect(load(yaml)).rejects.toThrow(message)
  })

  it('names the project schema when it rejects an entry', async () => {
    const root = await project({
      ...PROFILE,
      'content/outreach.yml': '- { audience: television }\n',
      'schemas/outreach.ts': `${importPackage('section', 'z')}export default section({ audience: z.enum(['school']) })\n`,
    })
    await expect(loadContent(root)).rejects.toThrow(/content\/outreach\.yml: invalid \(schema: schemas\/outreach\.ts\)\n {2}- 0\.audience/)
  })

  it('names the entry by its position in the file, whatever is filtered out', async () => {
    await expect(load('- { date: 2020, title: Hidden, visibility: private }\n- { date: 2024, title: Bad $\\kk$ }\n'))
      .rejects.toThrow(/content\/talks\.yml: 1\.title/)
  })
})

describe('pages', () => {
  const pages = async (files: Record<string, string>) => (await loadContent(await project({ ...PROFILE, ...files }))).pages

  it('derives routes from file names, and sorts by order, then route', async () => {
    expect((await pages({
      'content/pages/index.md': '---\ntitle: Home\n---\n',
      'content/pages/research.md': '---\ntitle: Research\norder: 1\n---\n',
      'content/pages/about.md': '---\ntitle: About $x$\nroute: /about/me/\ndescription: Me.\n---\n\nHello.\n',
    })).map(({ route, title, order, description, bodyHtml }) => ({ route, title, order, description, bodyHtml }))).toEqual([
      { route: '/research/', title: 'Research', order: 1, description: undefined, bodyHtml: '' },
      { route: '/', title: 'Home', order: 100, description: undefined, bodyHtml: '' },
      { route: '/about/me/', title: 'About $x$', order: 100, description: 'Me.', bodyHtml: '<p>Hello.</p>' },
    ])
  })

  it('renders the title as inline Markdown', async () => {
    const [page] = await pages({ 'content/pages/index.md': '---\ntitle: The *k*-ary case\n---\n' })
    expect(page!.titleHtml).toBe('The <em>k</em>-ary case')
  })

  it.each([
    [{ 'content/pages/Research.md': '---\ntitle: R\n---\n' }, /content\/pages\/Research\.md: file name must be lowercase kebab-case/],
    [{ 'content/pages/research.md': '---\ntitel: R\n---\n' }, /content\/pages\/research\.md: invalid front matter/],
    [{ 'content/pages/research.md': '---\ntitle: R\nroute: /Research\n---\n' }, /expected a route like \/research\//],
    [{ 'content/pages/research.md': '---\ntitle: R\n---\n\n$\\zetaa(s)$\n' }, /content\/pages\/research\.md: invalid TeX/],
    [{ 'content/pages/a.md': '---\ntitle: A\nroute: /b/\n---\n', 'content/pages/b.md': '---\ntitle: B\n---\n' }, /content\/pages\/b\.md: route \/b\/ is already used by content\/pages\/a\.md/],
  ])('reports %j', async (files, message) => {
    await expect(pages(files)).rejects.toThrow(message)
  })
})

describe('profile', () => {
  const profile = async (yaml: string, options?: Parameters<typeof loadContent>[1]) =>
    (await loadContent(await project({ 'content/profile.yml': yaml }), options)).profile

  it('fills in defaults and renders the footer', async () => {
    expect(await profile('name: Jane Doe\nfooter: Made with *care*\nnav:\n  - { label: CV, to: /cv/ }\n')).toEqual({
      name: 'Jane Doe',
      links: [],
      nav: [{ label: 'CV', url: '/cv/' }],
      footerHtml: 'Made with <em>care</em>',
    })
  })

  it.each([
    ['', /content\/profile\.yml: invalid/],
    ['name: J\nemail: not-an-email\n', /email/],
    ['name: J\nurl: /relative/\n', /url/],
    ['name: J\navatar: img/me.jpg\n', /avatar/],
  ])('rejects %j', async (yaml, message) => {
    await expect(profile(yaml)).rejects.toThrow(message)
  })

  it('is required', async () => {
    await expect(loadContent(await project({ 'content/talks.yml': '[]' }))).rejects.toThrow('content/profile.yml: missing')
  })
})

describe('paths on the site', () => {
  const files = {
    'content/profile.yml': 'name: Jane Doe\nurl: https://jane.example.org/site\navatar: /img/me.svg\nlinks:\n  - { label: CV, url: /cv.pdf }\n  - https://orcid.org/0000\n',
    'content/talks.yml': '- { date: 2025, title: A talk, slides: /slides/talk.pdf, url: https://aofa.org }\n',
    'content/pages/index.md': '---\ntitle: Home\n---\n\n![a](/img/a.png) <img src="/img/b.svg"> [cv](/cv/) [x](https://e.org/x)\n',
  }

  it('get the base path on the website: in Markdown, raw HTML, section fields and the profile', async () => {
    const content = await loadContent(await project(files), { baseURL: '/sub/' })
    expect(content.pages[0]!.bodyHtml).toBe('<p><img src="/sub/img/a.png" alt="a"> <img src="/sub/img/b.svg"> <a href="/sub/cv/">cv</a> <a href="https://e.org/x">x</a></p>')
    expect(content.sections.talks![0]).toMatchObject({ slides: '/sub/slides/talk.pdf', url: 'https://aofa.org' })
    expect(content.profile.avatar).toBe('/sub/img/me.svg')
    expect(content.profile.links.map(link => link.url)).toEqual(['/sub/cv.pdf', 'https://orcid.org/0000'])
  })

  it('stay as written at the root', async () => {
    const content = await loadContent(await project(files))
    expect(content.sections.talks![0]!.slides).toBe('/slides/talk.pdf')
    expect(content.profile.avatar).toBe('/img/me.svg')
  })

  it('become absolute URLs below profile.url for the PDF', async () => {
    const content = await loadContent(await project(files), { target: 'pdf', baseURL: '/sub/' })
    expect(content.sections.talks![0]!.slides).toBe('https://jane.example.org/site/slides/talk.pdf')
    expect(content.profile.links[0]!.url).toBe('https://jane.example.org/site/cv.pdf')
  })
})

describe('strict and lenient loading', () => {
  const broken = {
    ...PROFILE,
    'content/talks.yml': '- { date: 2025, titel: Oops }\n',
    'content/teaching.yml': '- { date: 2025, title: A course }\n',
    'content/pages/index.md': '---\ntitle: Home\n---\n',
    'content/pages/research.md': '---\ntitle: R\n---\n\n$\\kk$\n',
  }

  it('throws on the first problem when strict, as for a build', async () => {
    await expect(loadContent(await project(broken))).rejects.toThrow()
  })

  it('collects every problem when lenient and keeps the rest of the site, as for `nuxt dev`', async () => {
    const content = await loadContent(await project(broken), { strict: false })
    expect(content.issues.map(issue => issue.where).sort()).toEqual(['content/pages/research.md', 'content/talks.yml'])
    expect(content.sections).toMatchObject({ talks: [], teaching: [expect.anything()] })
    expect(content.profile.name).toBe('Jane Doe')
  })

  it('shows a broken page as an error page at its route', async () => {
    const { pages } = await loadContent(await project(broken), { strict: false })
    expect(pages.find(page => page.route === '/research/')).toMatchObject({
      title: 'Error in content/pages/research.md',
      error: expect.stringContaining('invalid TeX'),
      bodyHtml: expect.stringMatching(/^<pre>invalid TeX/),
    })
  })

  it('stands in a placeholder profile', async () => {
    const content = await loadContent(await project({ 'content/profile.yml': 'nme: typo\n' }), { strict: false })
    expect(content.profile.name).toBe('Your Name')
    expect(content.issues).toEqual([{ where: 'content/profile.yml', message: expect.stringContaining('invalid') }])
  })
})

describe('project schemas', () => {
  it('take effect when edited, without restarting the process', async () => {
    const schema = (fields: string) => `${importPackage('section', 'dateRange', 'z')}export default section({ date: dateRange, ${fields} })\n`
    const root = await project({ ...PROFILE, 'content/fancy.yml': '- { date: 2024, title: A thing }\n', 'schemas/fancy.ts': schema('title: z.string()') })
    expect((await loadContent(root, { strict: false })).issues).toEqual([])

    await writeFile(join(root, 'schemas/fancy.ts'), schema('title: z.string(), venue: z.string()'))
    expect((await loadContent(root, { strict: false })).issues).toEqual([{ where: 'content/fancy.yml', message: expect.stringContaining('venue') }])
  })

  it('name the file when they cannot be imported', async () => {
    const root = await project({ 'schemas/talks.ts': 'export default (\n' })
    await expect(importProjectModule(join(root, 'schemas/talks.ts'), 0, 'schemas/talks.ts')).rejects.toThrow(/^schemas\/talks\.ts: /)
  })

  it('name the required Node version when TypeScript cannot be loaded', () => {
    const error = Object.assign(new TypeError('Unknown file extension ".ts"'), { code: 'ERR_UNKNOWN_FILE_EXTENSION' })
    expect(importFailure(error, '22.17.1')).toBe('cannot load TypeScript on Node 22.17.1; vitakit needs Node 22.18 or newer')
  })
})
