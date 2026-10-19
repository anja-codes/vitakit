/** `vitakit-check`: assertions on the generated site. */
import { describe, expect, it } from 'vitest'
import { checkStatic } from '../src/check'
import { loadContent } from '../src/content'
import { project, writeFiles } from './support/project'
import { renderGroups } from './support/publications'

const HIDDEN = 'Pólya\'s urn and "random" $k$-ary trees in the wild'
const CONTENT = {
  'content/profile.yml': 'name: Jane Doe\n',
  'content/pages/index.md': '---\ntitle: Home\n---\n\nWelcome, $x$.\n',
  'content/pages/research.md': '---\ntitle: Research\n---\n\nTrees.\n',
  'content/talks.yml': `- { date: 2025, title: A public talk on trees }\n- { date: 2024, title: '${HIDDEN.replace(/'/g, '\'\'')}', visibility: cv }\n`,
  'content/publications.bib': '@article{doe2024, author = {Doe, Jane}, title = {Trees of height $h$}, journal = {J}, year = {2024}}\n',
}

/**
 * A stand-in for `nuxt generate`: one HTML file per page, showing the page,
 * the public talks and the bibliography, with the framework's stylesheet
 * under `base`. `extra` is appended to the home page.
 */
async function generate(files: Record<string, string> = {}, { base = '/', extra = '' } = {}) {
  const root = await project({ ...CONTENT, ...files })
  const content = await loadContent(root, { baseURL: base })
  const talks = content.sections.talks?.map(talk => `<p>${(talk.title as { html: string }).html}</p>`).join('') ?? ''
  const site: Record<string, string> = { '_nuxt/entry.css': '' }
  for (const page of content.pages) {
    site[`${page.route.slice(1)}index.html`] = `<html><head><link rel="stylesheet" href="${base}_nuxt/entry.css"></head><body>`
      + `${page.bodyHtml}${talks}${renderGroups(content.publications)}${page.route === '/' ? extra : ''}</body></html>`
  }
  await writeFiles(root, Object.fromEntries(Object.entries(site).map(([path, html]) => [`.output/public/${path}`, html])))
  return root
}

const failures = async (root: string, options: Partial<Parameters<typeof checkStatic>[0]> = {}) =>
  (await checkStatic({ rootDir: root, ...options })).failures

it('passes a correctly generated site, saying what it checked', async () => {
  const result = await checkStatic({ rootDir: await generate() })
  expect(result.failures).toEqual([])
  expect(result.checked).toEqual([
    '2 page(s) generated',
    'mathematics rendered on 2 page(s)',
    'base path /',
    '1 of 1 non-public entr(ies) absent from the site',
    'assets and links use /',
    'links into the site lead somewhere',
    'bibliography on 2 page(s)',
  ])
})

it('reports, rather than throws, when nothing was generated', async () => {
  expect(await failures(await project(CONTENT))).toEqual([expect.stringMatching(/^no generated site at .*; run `nuxt generate` first$/)])
})

it('reports, rather than throws, when the content does not load', async () => {
  const root = await generate()
  await writeFiles(root, { 'content/talks.yml': 'oops: 1\n' })
  expect(await failures(root)).toEqual(['content did not load: content/talks.yml: expected a list of entries'])
})

it('detects a page that was not generated', async () => {
  const root = await generate({ 'content/pages/teaching.md': '---\ntitle: Teaching\nroute: /teaching/\n---\n' })
  await writeFiles(root, { 'content/pages/missing.md': '---\ntitle: Missing\n---\n' })
  expect(await failures(root)).toEqual([expect.stringMatching(/^page \/missing\/ was not generated \(.*missing\/index\.html\)$/)])
})

it.each([
  ['a KaTeX error', '<span class="katex-error">x</span>', /index\.html: KaTeX reported an error$/],
  ['an unrendered rich-text marker', '{"__vitakitRich":"x"}', /index\.html: an unrendered rich-text marker reached the output$/],
  ['a bibliography formula left as a placeholder', '<ol class="vita-bib"><li>bibmathplaceholder0end</li></ol>', /^index\.html: a formula in the bibliography was not rendered$/],
])('detects %s', async (_case, extra, message) => {
  expect(await failures(await generate({}, { extra }))).toEqual([expect.stringMatching(message)])
})

it('accepts a site that shows no bibliography, as long as nothing else is wrong', async () => {
  const root = await project({ ...CONTENT, 'content/pages/research.md': '---\ntitle: R\nroute: /about/\n---\n' })
  await writeFiles(root, {
    '.output/public/index.html': '<link href="/assets/app.css"><p>Home</p>',
    '.output/public/about/index.html': '<p>About</p>',
    '.output/public/assets/app.css': '',
  })
  const result = await checkStatic({ rootDir: root })
  expect(result.failures).toEqual([])
  expect(result.checked).toContain('bibliography not shown on any page (fine if publications.bib is only for the PDF)')
})

describe('the leak check', () => {
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;')
  const [before, after] = HIDDEN.split('$k$')

  it.each([
    ['as rendered rich text', async () => {
      const content = await loadContent(await project(CONTENT), { maxVisibility: 'cv' })
      return (content.sections.talks![1]!.title as { html: string }).html
    }],
    ['as escaped text', async () => escape(HIDDEN)],
    ['with its formula laid out differently', async () => `${before}<span class="katex">k</span>${after}`],
  ])('finds a non-public title shown %s, naming the entry and the page', async (_case, html) => {
    expect(await failures(await generate({}, { extra: `<p>${await html()}</p>` }))).toEqual([
      expect.stringMatching(/^content\/talks\.yml entry \d is marked "cv" but its text appears in index\.html: "Pólya's urn/),
    ])
  })

  it('can be skipped', async () => {
    const result = await checkStatic({ rootDir: await generate({}, { extra: escape(HIDDEN) }), skipLeakCheck: true })
    expect(result.failures).toEqual([])
    expect(result.checked.join('\n')).not.toMatch(/non-public/)
  })

  // The list is sorted newest first; the hidden talk is the second entry of the file.
  it('names the entry by its position in the file', async () => {
    const files = { 'content/talks.yml': `- { date: 2020, title: An older public talk }\n- { date: 2024, title: '${HIDDEN.replace(/'/g, '\'\'')}', visibility: cv }\n` }
    expect(await failures(await generate(files, { extra: escape(HIDDEN) }))).toEqual([expect.stringMatching(/^content\/talks\.yml entry 2 /)])
  })
})

describe('links', () => {
  it('finds links into the site that lead nowhere, and accepts files, pages, anchors and encoded names', async () => {
    const root = await generate({}, { extra: '<a href="/slides/talk.pdf"></a><a href="/slides/tlak.pdf"></a><a href="/research"></a><a href="/research/#top"></a><img src="/img/a%20b.png">' })
    await writeFiles(root, { '.output/public/slides/talk.pdf': '', '.output/public/img/a b.png': '' })
    expect(await failures(root)).toEqual([
      'index.html: /slides/tlak.pdf leads nowhere: no such file or page in the generated site. A file belongs in public/, a page in content/pages/ or app/pages/',
    ])
  })
})

describe('the base path', () => {
  it('passes a site generated for it', async () => {
    const root = await generate({ 'content/pages/research.md': '---\ntitle: R\n---\n\n[Home](/) <img src="/a.png" srcset="/a.png 1x, /b.png 2x">\n' }, { base: '/sub/' })
    await writeFiles(root, { '.output/public/a.png': '', '.output/public/b.png': '' })
    expect(await failures(root, { baseURL: '/sub/' })).toEqual([])
  })

  it('detects a site generated for another base', async () => {
    expect(await failures(await generate(), { baseURL: '/sub/' })).toEqual([
      expect.stringMatching(/^assets do not use the base path \/sub\/ \(e\.g\. \/_nuxt\/entry\.css\); the site was built for a different base\. Set NUXT_APP_BASE_URL/),
    ])
  })

  it('detects a site generated for a subdirectory, checked against the root', async () => {
    // Every path starts with `/`, so only the base Nuxt recorded gives it away.
    const root = await generate({}, { base: '/sub/', extra: '<script>window.__NUXT__={config:{app:{baseURL:"/sub/"}}}</script>' })
    expect(await failures(root, { baseURL: '/' })).toEqual([expect.stringMatching(/\(it was built for \/sub\/\)/)])
  })

  it('detects paths that escape it, in every URL attribute', async () => {
    const extra = [
      '<img src="/sub/a.png" srcset="/sub/a.png 1x, /img/stray@2x.png 2x">',
      '<video poster=\'/img/poster.png\'></video>',
      '<object data="/files/stray.pdf"></object>',
      '<a href="//cdn.example/fine.js"></a>',
      '<p data-src="/not/an/attribute/we/check"></p>',
    ].join('')
    const root = await generate({}, { base: '/sub/', extra })
    await writeFiles(root, { '.output/public/a.png': '' })
    expect((await failures(root, { baseURL: '/sub/' })).map(failure => failure.split(' does not use')[0])).toEqual([
      'index.html: /img/stray@2x.png',
      'index.html: /img/poster.png',
      'index.html: /files/stray.pdf',
    ])
  })
})
