import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Element } from 'hast'
import rehypeParse from 'rehype-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { describe, expect, it } from 'vitest'
import { loadContent } from '../src/content'
import { renderScaffold } from './scaffold-vue'

async function content(files: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'vitakit-scaffold-web-'))
  try {
    for (const [path, source] of Object.entries({
      'content/profile.yml': 'name: Jane Doe\n',
      'content/pages/cv.md': '---\ntitle: CV\n---\n\nCV introduction.\n',
      'content/pages/publications.md': '---\ntitle: Publications\n---\n\nPublications introduction.\n',
      ...files,
    })) {
      await mkdir(join(root, path, '..'), { recursive: true })
      await writeFile(join(root, path), source)
    }
    return await loadContent(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function elements(html: string, tag: string): Element[] {
  const result: Element[] = []
  visit(unified().use(rehypeParse, { fragment: true }).parse(html), 'element', (node) => {
    if (node.tagName === tag) result.push(node)
  })
  return result
}

function textOf(element: Element): string {
  const parts: string[] = []
  visit(element, 'text', node => { parts.push(node.value) })
  return parts.join('').replace(/\s+/g, ' ').trim()
}

// Exercise both the editable template and the generated example, not copies of their markup.
describe.each(['create/template', 'examples/scaffolded'])('%s rendered pages', (directory) => {
  it.each([
    ['title only', 'title: Researcher\n', 'Researcher', undefined],
    ['affiliation only', 'affiliation: Example University\n', 'Example University', undefined],
    ['linked affiliation only', 'affiliation: { name: Example University, url: "https://example.org/" }\n', 'Example University', 'https://example.org/'],
    ['title and affiliation', 'title: Researcher\naffiliation: Example University\n', 'Researcher · Example University', undefined],
    ['title and linked affiliation', 'title: Researcher\naffiliation: { name: Example University, url: "https://example.org/" }\n', 'Researcher · Example University', 'https://example.org/'],
    ['neither', '', undefined, undefined],
  ])('shows profile metadata correctly with %s', async (_label, fields, expected, url) => {
    const data = await content({ 'content/profile.yml': `name: Jane Doe\n${fields}` })
    const { html } = await renderScaffold('index', data, directory)
    const metadata = elements(html, 'p').filter(node => node.properties.className?.includes('text-neutral-600'))
    expect(metadata.map(textOf)).toEqual(expected ? [expected] : [])
    expect(elements(html, 'h1').map(textOf)).toEqual(['Jane Doe'])
    if (url) {
      expect(elements(html, 'a').map(node => [textOf(node), node.properties.href]))
        .toContainEqual(['Example University', url])
    } else {
      expect(elements(html, 'a')).toHaveLength(0)
    }
    expect(html.match(/·/g) ?? []).toHaveLength(expected?.includes('·') ? 1 : 0)
  })

  it('omits CV wrappers and headings for absent, empty and wholly nonpublic sections', async () => {
    const data = await content({
      'content/education.yml': '',
      'content/teaching.yml': '- { date: 2025, title: CV-only course, visibility: cv }\n',
      'content/talks.yml': '- { date: 2025, title: Secret talk, visibility: private }\n',
    })
    expect(data.sections.teaching).toEqual([])
    expect(data.sections.talks).toEqual([])
    const { html } = await renderScaffold('cv', data, directory)
    expect(elements(html, 'section')).toHaveLength(0)
    expect(elements(html, 'h2')).toHaveLength(0)
    expect(html).not.toContain('CV-only course')
    expect(html).not.toContain('Secret talk')
    expect(html).toContain('CV introduction.')
  })

  it('keeps populated CV sections in order and makes the landing-page talks link target the outer section', async () => {
    const data = await content({
      'content/employment.yml': '- { date: 2025, position: Researcher, institution: University }\n',
      'content/education.yml': '- { date: 2024, degree: PhD, institution: University }\n',
      'content/teaching.yml': '- { date: 2025, title: Public course }\n',
      'content/supervision.yml': '- { date: 2025, student: A. Student, title: Public thesis }\n',
      'content/talks.yml': [
        '- { date: 2025, title: Public talk }',
        '- { date: 2026, title: CV-only talk, visibility: cv }',
        '- { date: 2027, title: Secret talk, visibility: private }',
      ].join('\n'),
    })
    const { html } = await renderScaffold('cv', data, directory)
    const sections = elements(html, 'section')
    expect(sections.map(node => node.properties.id)).toEqual(['employment', 'education', 'teaching', 'supervision', 'talks'])
    expect(elements(html, 'h2').map(textOf)).toEqual(['Employment', 'Education', 'Teaching', 'Supervised theses', 'Talks'])
    const talks = sections.find(node => node.properties.id === 'talks')!
    expect(talks.children.some(node => node.type === 'element' && node.tagName === 'h2')).toBe(true)
    expect(textOf(talks)).toContain('Public talk')
    expect(html).not.toContain('CV-only talk')
    expect(html).not.toContain('Secret talk')
    expect(elements(html, 'ul').every(node => !node.properties.id)).toBe(true)

    const home = await renderScaffold('index', data, directory)
    expect(elements(home.html, 'a').find(node => textOf(node) === 'All talks →')?.properties.href).toBe('/cv/#talks')
    expect(elements(home.html, 'h2').map(textOf)).toEqual(['Recent talks'])
    expect(home.html).not.toContain('Secret talk')
    expect(home.html).not.toContain('CV-only talk')
  })

  it.each(['cv', 'publications'])('renders rich %s titles as HTML while preserving head metadata', async (page) => {
    const title = 'Selected **work** with `code` and $x^2$'
    const data = await content({
      [`content/pages/${page}.md`]: `---\ntitle: '${title}'\ndescription: Page summary\n---\n\nPage **body**.\n`,
    })
    const { html, heads } = await renderScaffold(page, data, directory)
    expect(elements(html, 'h1')).toHaveLength(1)
    expect(html).toContain(`<h1 class="text-3xl font-semibold">${data.pages.find(item => item.route === `/${page}/`)!.titleHtml}</h1>`)
    expect(elements(html, 'strong').map(textOf)).toContain('work')
    expect(elements(html, 'code').map(textOf)).toContain('code')
    expect(elements(html, 'span').some(node => node.properties.className?.includes('katex'))).toBe(true)
    expect(elements(html, 'strong').map(textOf)).toContain('body')
    expect(heads).toEqual([{
      title: `${title} – Jane Doe`,
      meta: [{ name: 'description', content: 'Page summary' }],
    }])
  })

  it.each(['cv', 'publications'])('returns a useful 404 during SSR when the %s companion page is missing', async (page) => {
    const data = await content()
    data.pages = data.pages.filter(item => item.route !== `/${page}/`)
    await expect(renderScaffold(page, data, directory)).rejects.toMatchObject({
      statusCode: 404,
      fatal: true,
      statusMessage: expect.stringMatching(new RegExp(`No page for /${page}/.*content/pages/${page}\\.md`)),
    })
  })
})
