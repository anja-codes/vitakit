/**
 * The pages of `create/template`, rendered with the real components and
 * composables. (`examples/scaffolded` is generated from the template and kept
 * identical by `pnpm example:check`.)
 */
import type { Element } from 'hast'
import rehypeParse from 'rehype-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { describe, expect, it } from 'vitest'
import { loadContent } from '../src/content'
import { project } from './support/project'
import { renderGroup } from './support/publications'
import { renderScaffold } from './support/scaffold-vue'

const PAGES = {
  'content/profile.yml': 'name: Jane Doe\n',
  'content/pages/cv.md': '---\ntitle: CV\n---\n\nCV introduction.\n',
  'content/pages/publications.md': '---\ntitle: Publications\n---\n\nPublications introduction.\n',
}

const content = async (files: Record<string, string> = {}) => loadContent(await project({ ...PAGES, ...files }))
const render = async (page: string, files: Record<string, string> = {}) => renderScaffold(page, await content(files))

function elements(html: string, tag: string): Element[] {
  const found: Element[] = []
  visit(unified().use(rehypeParse, { fragment: true }).parse(html), 'element', (node) => {
    if (node.tagName === tag) found.push(node)
  })
  return found
}

function textOf(node: Element): string {
  const parts: string[] = []
  visit(node, 'text', (text) => { parts.push(text.value) })
  return parts.join('').replace(/\s+/g, ' ').trim()
}

describe('index', () => {
  it.each([
    ['neither title nor affiliation', '', []],
    ['a title', 'title: Researcher\n', ['Researcher']],
    ['an affiliation', 'affiliation: Example University\n', ['Example University']],
    ['both, the affiliation linked', 'title: Researcher\naffiliation: { name: Example University, url: "https://example.org/" }\n', ['Researcher · Example University']],
  ])('shows the name and %s', async (_case, fields, expected) => {
    const { html } = await render('index', { 'content/profile.yml': `name: Jane Doe\n${fields}` })
    expect(elements(html, 'h1').map(textOf)).toEqual(['Jane Doe'])
    expect(elements(html, 'p').filter(node => String(node.properties.className).includes('text-neutral-600')).map(textOf)).toEqual(expected)
    expect(elements(html, 'a').map(node => node.properties.href)).toEqual(fields.includes('url') ? ['https://example.org/'] : [])
  })

  it('shows the three most recent public talks, linking to the rest', async () => {
    const { html } = await render('index', {
      'content/talks.yml': [1, 2, 3, 4].map(n => `- { date: 202${n}, title: Talk ${n} }`).join('\n') + '\n- { date: 2025, title: CV talk, visibility: cv }\n',
    })
    expect(elements(html, 'h2').map(textOf)).toEqual(['Recent talks'])
    expect(html.match(/Talk \d/g)).toEqual(['Talk 4', 'Talk 3', 'Talk 2'])
    expect(html).not.toContain('CV talk')
    expect(elements(html, 'a').find(node => textOf(node) === 'All talks →')?.properties.href).toBe('/cv/#talks')
  })
})

describe('cv', () => {
  it('shows the sections with public entries, in the page\'s order', async () => {
    const { html } = await render('cv', {
      'content/talks.yml': '- { date: 2025, title: Public talk }\n- { date: 2026, title: CV-only talk, visibility: cv }\n',
      'content/supervision.yml': '- { date: 2025, student: A. Student, title: Public thesis }\n',
      'content/employment.yml': '- { date: 2025, position: Researcher, institution: University }\n',
      'content/education.yml': '',
      'content/teaching.yml': '- { date: 2025, title: Secret course, visibility: private }\n',
    })
    expect(elements(html, 'section').map(node => [node.properties.id, textOf(node.children.find((child): child is Element => child.type === 'element' && child.tagName === 'h2')!)]))
      .toEqual([['employment', 'Employment'], ['supervision', 'Supervised theses'], ['talks', 'Talks']])
    expect(html).toContain('CV introduction.')
    expect(html).not.toMatch(/CV-only talk|Secret course/)
  })
})

describe('publications', () => {
  it('shows each group through VitaPublications, laid out as the tests\' renderGroup assumes', async () => {
    const data = await content({
      'content/publications.bib': '@article{a, author = {Doe, Jane}, title = {On $k$-ary trees}, journal = {J}, year = {2024}, doi = {10.1000/a}}\n'
        + '@misc{b, author = {Doe, Jane}, title = {A preprint}, year = {2025}, status = {preprint}, eprint = {2501.00001}, archivePrefix = {arXiv}}\n',
    })
    const { html } = await renderScaffold('publications', data)
    expect(elements(html, 'h2').map(textOf)).toEqual(['Published', 'Preprints'])
    const markup = html.replace(/<!--[\s\S]*?-->/g, '')
    for (const group of data.publications) expect(markup).toContain(renderGroup(group).replace(/\n/g, ''))
  })
})

describe.each(['cv', 'publications'])('%s', (page) => {
  it('renders the Markdown title and sets the head', async () => {
    const title = 'Selected **work** with $x^2$'
    const data = await content({ [`content/pages/${page}.md`]: `---\ntitle: '${title}'\ndescription: Page summary\n---\n\nBody.\n` })
    const { html, heads } = await renderScaffold(page, data)
    expect(elements(html, 'h1')).toHaveLength(1)
    expect(html).toContain(`<h1 class="text-3xl font-semibold">${data.pages.find(item => item.route === `/${page}/`)!.titleHtml}</h1>`)
    expect(heads).toEqual([{ title: `${title} – Jane Doe`, meta: [{ name: 'description', content: 'Page summary' }] }])
  })

  it('is a 404 naming the missing Markdown file', async () => {
    const data = await content()
    data.pages = data.pages.filter(item => item.route !== `/${page}/`)
    await expect(renderScaffold(page, data)).rejects.toMatchObject({
      statusCode: 404,
      fatal: true,
      statusMessage: `No page for /${page}/ (expected content/pages/${page}.md)`,
    })
  })
})
