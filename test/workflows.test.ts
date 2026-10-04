/**
 * End-to-end tests for the workflows the documentation describes.
 *
 * Each test walks through what a user actually does, through the package's
 * entry points, on a throwaway project directory. They are the regression net
 * for the promises the documentation makes.
 */
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadContent } from '../src/content'
import { buildCv } from '../src/tex/build'
import { checkStatic } from '../src/check'
import { eject, listEjectable } from '../src/cli'
import { atMost } from '../src/shared/visibility'
import { renderGroups } from './publications'

const PACKAGE = process.cwd()

/** Whether a command is installed, for tests that need a TeX distribution. */
function hasCommand(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const hasLatexmk = () => hasCommand('latexmk', ['-v'])
const hasPdftotext = () => hasCommand('pdftotext', ['-v'])

/** A project as `pnpm create @anja.codes/vitakit` would leave it: data, pages, a CV document. */
const STARTER: Record<string, string> = {
  'content/profile.yml': 'name: Jane Doe\ntitle: Postdoc\nemail: jane@example.org\nsummary: Random trees.\nnav:\n  - { label: CV, to: /cv/ }\n',
  'content/employment.yml': [
    '- date: { from: 2023, to: present }',
    '  position: Postdoctoral Researcher',
    '  institution: { name: University of Graz, url: https://uni-graz.at }',
    '- date: { from: 2019, to: 2019 }',
    '  position: Visiting Researcher',
    '  institution: Uppsala University',
    '  visibility: cv',
    '',
  ].join('\n'),
  'content/talks.yml': [
    '- { date: 2025-06-16, title: Large random $k$-ary trees, event: AofA, kind: invited }',
    '- { date: 2024-09-03, title: Cutting down trees, event: ÖMG, kind: contributed }',
    '',
  ].join('\n'),
  'content/publications.bib': [
    '@article{doe2024, author = {Doe, Jane}, title = {Random $k$-ary trees},',
    '  journal = {J. Comb.}, year = {2024}, doi = {10.1000/xyz}, status = {published}}',
    '@misc{doe2025, author = {Doe, Jane}, title = {Ascent sequences},',
    '  year = {2025}, arxiv = {2501.01234}, status = {preprint}}',
    '',
  ].join('\n'),
  'content/pages/index.md': '---\ntitle: Home\n---\n\nWelcome.\n',
  'cv-tex/preamble.tex': '\\vitasectiontitle{employment}{Employment}\n',
  'cv-tex/cv.tex': [
    '\\documentclass{vitakit-cv}',
    '\\vitadocument{cv}',
    '\\addbibresource{../content/publications.bib}',
    '\\input{preamble.tex}',
    '\\input{generated/cv/profile.tex}',
    '\\begin{document}',
    '\\vitaheader',
    '\\vitasection{employment}',
    '\\vitasection{talks}',
    '\\section{Publications}\\vitainput{publications}',
    '\\end{document}',
    '',
  ].join('\n'),
}

async function starter(extra: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vitakit-wf-'))
  for (const [path, contents] of Object.entries({ ...STARTER, ...extra })) {
    const full = join(root, path)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, contents, 'utf8')
  }
  return root
}

/** Files in the generated site, so that links to them lead somewhere. */
async function writeSiteFiles(root: string, ...paths: string[]): Promise<void> {
  for (const path of paths) {
    const file = join(root, '.output/public', path)
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, '')
  }
}

/** Minimal stand-in for `nuxt generate`, so checks can run without Nuxt. */
async function fakeGenerate(root: string, options: { includePrivate?: boolean } = {}): Promise<void> {
  const content = await loadContent(root, {
    strict: true,
    maxVisibility: options.includePrivate ? 'private' : 'public',
  })
  for (const page of content.pages) {
    const dir = join(root, '.output/public', page.route.slice(1))
    await mkdir(dir, { recursive: true })
    const sections = Object.values(content.sections).flat()
      .map(entry => JSON.stringify(entry)).join('\n')
    const bibliography = renderGroups(content.publications)
    await writeFile(join(dir, 'index.html'), [
      '<html><body>',
      `<link href="/_nuxt/entry.css">`,
      content.pages.map(item => item.bodyHtml).join('\n'),
      page.bodyHtml,
      sections,
      bibliography,
      '</body></html>',
    ].join('\n'))
  }
  await writeSiteFiles(root, '_nuxt/entry.css')
}

describe('start a project and put your own data in it', () => {
  it('loads a starter project with no errors', async () => {
    const content = await loadContent(await starter())
    expect(content.issues).toEqual([])
    expect(content.profile.name).toBe('Jane Doe')
    expect(content.profile.summary).toBe('Random trees.')
    expect(content.sections.talks).toHaveLength(2)
    expect(content.publications.map(group => group.id)).toEqual(['published', 'preprint'])
  })

  it('reports a mistyped field with the file, entry and key', async () => {
    const root = await starter({ 'content/talks.yml': '- { date: 2025, titel: Oops }\n' })
    await expect(loadContent(root, { strict: true })).rejects.toThrow(/content\/talks\.yml.*titel/s)
  })

  it('keeps the dev server alive on a broken file and recovers when fixed', async () => {
    const root = await starter({ 'content/talks.yml': '- { date: 2025, titel: Oops }\n' })

    const broken = await loadContent(root, { strict: false })
    expect(broken.issues).toHaveLength(1)
    expect(broken.profile.name).toBe('Jane Doe')      // the rest still works
    expect(broken.sections.talks).toEqual([])

    await writeFile(join(root, 'content/talks.yml'), '- { date: 2025, title: Fixed }\n')
    const fixed = await loadContent(root, { strict: false })
    expect(fixed.issues).toEqual([])
    expect(fixed.sections.talks).toHaveLength(1)
  })

  it('never exposes cv-only entries to the website', async () => {
    const content = await loadContent(await starter())
    expect(JSON.stringify(content)).not.toContain('Uppsala')
  })
})

describe('add a page with math and images', () => {
  it('renders math, tables and images, rewriting asset paths', async () => {
    const root = await starter({
      'content/pages/research.md': [
        '---', 'title: Research', 'description: Trees.', '---', '',
        'Inline $H_n = \\sum_{k=1}^n 1/k$ and display:', '',
        '$$\\zeta(s) = \\sum_n n^{-s}.$$', '',
        '| a | b |', '| --- | --- |', '| 1 | 2 |', '',
        '![A tree](/img/tree.svg)', '',
      ].join('\n'),
    })

    const content = await loadContent(root, { baseURL: '/my-site/' })
    const page = content.pages.find(item => item.route === '/research/')!
    expect(page.bodyHtml).toContain('class="katex')
    expect(page.bodyHtml).toContain('katex-display')
    expect(page.bodyHtml).toContain('<table>')
    expect(page.bodyHtml).toContain('src="/my-site/img/tree.svg"')
    expect(page.bodyHtml).not.toContain('katex-error')
  })

  it('fails the build on a malformed formula, naming the file', async () => {
    const root = await starter({
      'content/pages/research.md': '---\ntitle: R\n---\n\n$\\zetaa(s)$\n',
    })
    await expect(loadContent(root, { strict: true }))
      .rejects.toThrow(/content\/pages\/research\.md.*invalid TeX/s)
  })
})

describe('add a new data collection', () => {
  const OUTREACH = [
    '- { date: 2025-03-14, title: What is a random tree?, venue: BRG Viktring, audience: school }',
    '- { date: 2024-11-02, title: Maths night, venue: Uni Graz, audience: public }',
    '',
  ].join('\n')

  const SCHEMA = (packageDir: string) => [
    `import { section, dateRange, richText, institution, z } from '${join(packageDir, 'src/index.ts')}'`,
    '',
    'export default section({',
    '  date: dateRange,',
    '  title: richText,',
    '  venue: institution.optional(),',
    "  audience: z.enum(['school', 'public', 'press']),",
    '})',
    '',
  ].join('\n')

  it('works with three files and no configuration', async () => {
    const root = await starter({
      'content/outreach.yml': OUTREACH,
      'schemas/outreach.ts': SCHEMA(PACKAGE),
    })
    const content = await loadContent(root)
    expect(content.sections.outreach).toHaveLength(2)
    // Sorted newest first, math-capable, institution shorthand expanded.
    expect(content.sections.outreach![0]!.venue).toEqual({ name: 'BRG Viktring' })
    expect((content.sections.outreach![0]!.title as { html: string }).html).toContain('random tree')
  })

  it('explains what to do when the schema is missing', async () => {
    const root = await starter({ 'content/outreach.yml': OUTREACH })
    await expect(loadContent(root, { strict: true }))
      .rejects.toThrow(/create schemas\/outreach\.ts/)
  })

  it('validates the new section like a built-in one', async () => {
    const root = await starter({
      'content/outreach.yml': '- { date: 2025, title: X, audience: television }\n',
      'schemas/outreach.ts': SCHEMA(PACKAGE),
    })
    await expect(loadContent(root, { strict: true })).rejects.toThrow(/audience/)
  })

  it('renders through the generic template in the PDF without extra work', async () => {
    const root = await starter({
      'content/outreach.yml': OUTREACH,
      'schemas/outreach.ts': SCHEMA(PACKAGE),
    })
    await buildCv({ rootDir: root, noPdf: true })
    const tex = await readFile(join(root, 'cv-tex/generated/cv/outreach.tex'), 'utf8')
    expect(tex).toContain('\\vitaentry{')
    expect(tex).toContain('What is a random tree?')
  })
})

describe('ejecting a package default', () => {
  it('lists components, templates and the class', async () => {
    const items = await listEjectable()
    expect(items.map(item => item.name)).toContain('VitaSection')
    expect(items.map(item => item.name)).toContain('talks.eta')
    expect(items.find(item => item.name === 'VitaSection')!.target)
      .toBe(join('app', 'components', 'VitaSection.vue'))
  })

  it('copies a component into the project and refuses to clobber it', async () => {
    const root = await starter()
    const { path } = await eject('VitaSection', root)
    expect(existsSync(path)).toBe(true)
    expect(await readFile(path, 'utf8')).toContain('vita-section')

    await expect(eject('VitaSection', root)).rejects.toThrow(/already exists/)
    await expect(eject('VitaSection', root, { force: true })).resolves.toBeTruthy()
  })

  it('an ejected TeX template takes precedence over the bundled one', async () => {
    const root = await starter()
    const { path } = await eject('talks.eta', root)
    await writeFile(path, '<% for (const t of it.entries) { %>MINE <%~ it.rich(t.title) %>\n<% } %>')

    await buildCv({ rootDir: root, noPdf: true })
    const tex = await readFile(join(root, 'cv-tex/generated/cv/talks.tex'), 'utf8')
    expect(tex).toContain('MINE Large random $k$-ary trees')
  })

  it('suggests the available names for a typo', async () => {
    await expect(eject('VitaSektion', await starter())).rejects.toThrow(/Available: /)
  })
})

describe('CV documents', () => {
  it('includes cv-only entries in the PDF but not on the website', async () => {
    const root = await starter({ 'cv-tex/cv.yml': 'visibility: cv\n' })
    await buildCv({ rootDir: root, noPdf: true })

    const tex = await readFile(join(root, 'cv-tex/generated/cv/employment.tex'), 'utf8')
    expect(tex).toContain('Uppsala University')

    const web = await loadContent(root)
    expect(JSON.stringify(web)).not.toContain('Uppsala')
  })

  it('a variant reorders and filters without touching the data', async () => {
    const root = await starter({
      'cv-tex/teaching-focus.tex': STARTER['cv-tex/cv.tex']!.replace('\\vitadocument{cv}', '\\vitadocument{teaching-focus}'),
      'cv-tex/teaching-focus.yml': 'visibility: public\nsections:\n  talks:\n    where: { kind: invited }\n',
    })
    await buildCv({ rootDir: root, noPdf: true })

    const variant = await readFile(join(root, 'cv-tex/generated/teaching-focus/talks.tex'), 'utf8')
    expect(variant).toContain('Large random $k$-ary trees')
    expect(variant).not.toContain('Cutting down trees')
    expect(variant).not.toContain('Uppsala')          // visibility: public here

    // The default document is unaffected.
    const standard = await readFile(join(root, 'cv-tex/generated/cv/talks.tex'), 'utf8')
    expect(standard).toContain('Cutting down trees')
  })

  it('emits a profile header and publication groups', async () => {
    const root = await starter()
    await buildCv({ rootDir: root, noPdf: true })
    expect(await readFile(join(root, 'cv-tex/generated/cv/profile.tex'), 'utf8'))
      .toContain('\\vitaname{Jane Doe}')
    const publications = await readFile(join(root, 'cv-tex/generated/cv/publications.tex'), 'utf8')
    expect(publications).toContain('\\vitabibgroup{published}{doe2024}')
    expect(publications).toContain('check=vita-published, title={Published}')
    expect(publications).toContain('\\vitabibgroup{preprint}{doe2025}')
  })

  it('groups publications in the PDF as the website does', async () => {
    // biblatex alone would filter on the exact `status` text: an entry without
    // one, or with `Published`, would be missing from the PDF.
    const root = await starter({
      'content/publications.bib': [
        '@article{doe2024, author = {Doe, Jane}, title = {No status}, journal = {J}, year = {2024}}',
        '@article{doe2023, author = {Doe, Jane}, title = {Capitalised}, journal = {J}, year = {2023}, status = {Published}}',
        '@misc{doe2025, author = {Doe, Jane}, title = {Preprint}, year = {2025}, status = {preprint}}',
        '',
      ].join('\n'),
    })
    await buildCv({ rootDir: root, noPdf: true })
    const publications = await readFile(join(root, 'cv-tex/generated/cv/publications.tex'), 'utf8')
    expect(publications).toContain('\\vitabibgroup{published}{doe2024,doe2023}')
    expect(publications).toContain('\\vitabibgroup{preprint}{doe2025}')
  })

  it('refuses a citation key that would break the LaTeX', async () => {
    const root = await starter({
      'content/publications.bib': '@article{doe%2024, author = {Doe, Jane}, title = {T}, journal = {J}, year = {2024}}\n',
    })
    await expect(buildCv({ rootDir: root, noPdf: true })).rejects.toThrow(/"doe%2024" cannot be used as a citation key/)
  })

  it('refuses a template override that matches no section', async () => {
    // Otherwise the misspelled file is simply never read and the PDF quietly
    // uses the generic layout.
    const root = await starter({ 'cv-tex/templates/talk.eta': '<% %>\n' })
    await expect(buildCv({ rootDir: root, noPdf: true })).rejects.toThrow(/did you mean talks\.eta/)
  })

  it('names the document whose options are wrong', async () => {
    const root = await starter({ 'cv-tex/cv.yml': 'visibility: everyone\n' })
    await expect(buildCv({ rootDir: root, noPdf: true })).rejects.toThrow(/cv-tex\/cv\.yml/)
  })
})

describe('paths on the site in the PDF', () => {
  const PROFILE = 'name: Jane Doe\nurl: https://jane.example.org/site/\n'
  const EMPLOYMENT = [
    '- date: 2023',
    '  position: Postdoc',
    '  institution: University of Graz',
    '  project: { title: Random trees, url: /projects/trees.pdf }',
    '',
  ].join('\n')

  it('become absolute links below profile.url', async () => {
    const root = await starter({
      'content/profile.yml': `${PROFILE}links:\n  - { label: CV, url: /cv.pdf }\n`,
      'content/employment.yml': EMPLOYMENT,
      'content/publications.bib': '@misc{local, author = {Doe, Jane}, title = {Local}, year = {2024}, url = {/papers/local.pdf}}\n',
    })
    await buildCv({ rootDir: root, noPdf: true })
    const generated = (file: string) => readFile(join(root, 'cv-tex/generated/cv', file), 'utf8')
    expect(await generated('employment.tex')).toContain('\\href{https://jane.example.org/site/projects/trees.pdf}')
    const profile = await generated('profile.tex')
    expect(profile).toContain('\\href{https://jane.example.org/site/cv.pdf}{CV}')
    // biblatex prints the .bib's url itself: a sourcemap makes it absolute.
    expect(profile).toContain('match=\\regexp{\\A/}, replace={https://jane.example.org/site/}')
  })

  it('are refused where the PDF would print them without profile.url, saying what to add', async () => {
    const employment = await starter({ 'content/employment.yml': EMPLOYMENT })
    await expect(buildCv({ rootDir: employment, noPdf: true }))
      .rejects.toThrow(/content\/employment\.yml.*\/projects\/trees\.pdf is a path on the website.*content\/profile\.yml.*url: https:/s)

    const profile = await starter({ 'content/profile.yml': 'name: Jane Doe\nlinks:\n  - { label: CV, url: /cv.pdf }\n' })
    await expect(buildCv({ rootDir: profile, noPdf: true })).rejects.toThrow(/content\/profile\.yml.*\/cv\.pdf is a path on the website/s)

    const bib = await starter({ 'content/publications.bib': '@misc{local, author = {Doe, Jane}, title = {L}, year = {2024}, url = {/papers/local.pdf}}\n' })
    await expect(buildCv({ rootDir: bib, noPdf: true })).rejects.toThrow(/content\/publications\.bib.*local: url \/papers\/local\.pdf is a path on the website/s)
  })

  it('do not need profile.url where the PDF does not print them', async () => {
    // talks.eta prints no links, so slides on the site concern only the website.
    const root = await starter({ 'content/talks.yml': '- { date: 2025, title: A talk, slides: /slides/talk.pdf }\n' })
    await expect(buildCv({ rootDir: root, noPdf: true })).resolves.toBeDefined()
  })
})

describe('custom publication groups, one definition for every output', () => {
  const SETTINGS = [
    `import { publications } from '${join(PACKAGE, 'src/index.ts')}'`,
    `export default publications({`,
    `  groups: [{ id: 'published', label: 'Articles' }, { id: 'talk-slides', label: 'Talk slides' }],`,
    `})`,
    '',
  ].join('\n')
  const BIB = [
    '@article{doe2024, author = {Doe, Jane}, title = {Random trees}, journal = {J}, year = {2024}}',
    '@misc{slides2023, author = {Doe, Jane}, title = {Slides on trees}, year = {2023}, status = {talk-slides}}',
    '',
  ].join('\n')

  it('reach the website, vitakit-check and the PDF alike', async () => {
    const root = await starter({ 'schemas/publications.ts': SETTINGS, 'content/publications.bib': BIB })

    const content = await loadContent(root)
    expect(content.publications.map(group => group.label)).toEqual(['Articles', 'Talk slides'])

    // Both used to fail with "unknown status talk-slides": the groups were
    // only known to the Nuxt module.
    await fakeGenerate(root)
    expect((await checkStatic({ rootDir: root })).failures).toEqual([])
    await buildCv({ rootDir: root, noPdf: true })
    const publications = await readFile(join(root, 'cv-tex/generated/cv/publications.tex'), 'utf8')
    expect(publications).toContain('\\vitabibgroup{talk-slides}{slides2023}')
    expect(publications).toContain('title={Talk slides}')
  })

  it('are checked in a document\'s selection', async () => {
    const root = await starter({
      'schemas/publications.ts': SETTINGS,
      'content/publications.bib': BIB,
      'cv-tex/cv.yml': 'publications:\n  groups: [published, talk-slide]\n',
    })
    await expect(buildCv({ rootDir: root, noPdf: true }))
      .rejects.toThrow(/cv-tex\/cv\.yml.*unknown group talk-slide; the groups are published, talk-slides/s)
  })
})

describe('vitakit-check', () => {
  let root: string

  beforeAll(async () => {
    root = await starter()
    await fakeGenerate(root)
  })

  it('passes on a correctly generated site', async () => {
    const result = await checkStatic({ rootDir: root })
    expect(result.failures).toEqual([])
    expect(result.checked.join(' ')).toMatch(/page\(s\) generated/)
  })

  it('detects a missing page', async () => {
    await rm(join(root, '.output/public/index.html'))
    const result = await checkStatic({ rootDir: root })
    expect(result.failures.join(' ')).toMatch(/page \/ was not generated|no index\.html/)
  })

  it('detects leaked non-public content, naming the entry and the page', async () => {
    const leaky = await starter()
    await fakeGenerate(leaky, { includePrivate: true })
    const result = await checkStatic({ rootDir: leaky })
    const message = result.failures.join(' ')
    expect(message).toMatch(/content\/employment\.yml entry \d+ is marked "cv"/)
    expect(message).toMatch(/index\.html/)
  })

  it('catches an unrendered rich-text marker in the output', async () => {
    // The marker is internal; if a page ever serialises one, the site is broken
    // in a way no schema can see.
    const broken = await starter()
    await fakeGenerate(broken)
    const page = join(broken, '.output/public/index.html')
    await writeFile(page, (await readFile(page, 'utf8')).replace('</body>', '{"__vitakitRich":"x"}</body>'))
    const result = await checkStatic({ rootDir: broken })
    expect(result.failures.join(' ')).toMatch(/unrendered rich-text marker/)
  })

  describe('finds a hidden title however a page shows it', () => {
    const TITLE = 'Pólya\'s urn and "random" $k$-ary trees in the wild'
    const hidden = () => starter({
      'content/talks.yml': `- { date: 2025-06-16, title: '${TITLE.replace(/'/g, '\'\'')}', visibility: cv }\n`,
    })
    /** The generated site, with one page showing the entry's title as `body`. */
    const site = async (root: string, body: (html: string) => string) => {
      await fakeGenerate(root)
      const [entry] = (await loadContent(root, { maxVisibility: 'private' })).sections.talks!
      const page = join(root, '.output/public/index.html')
      const html = (entry!.title as { html: string }).html
      await writeFile(page, (await readFile(page, 'utf8')).replace('</body>', `<p>${body(html)}</p></body>`))
      return checkStatic({ rootDir: root })
    }
    const leaked = (result: { failures: string[] }) => result.failures.some(failure => /talks\.yml.*marked "cv"/.test(failure))

    it('rendered with v-html', async () => {
      expect(leaked(await site(await hidden(), html => html))).toBe(true)
    })

    it('as text, which Vue escapes', async () => {
      const escaped = TITLE.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;')
      expect(leaked(await site(await hidden(), () => escaped))).toBe(true)
    })

    it('with its formula laid out differently', async () => {
      const prose = TITLE.split('$k$')
      expect(leaked(await site(await hidden(), () => `${prose[0]}<span class="katex">k</span>${prose[1]}`))).toBe(true)
    })

    it('and does not flag a page that never shows it', async () => {
      expect(leaked(await site(await hidden(), () => 'Something else entirely'))).toBe(false)
    })
  })

  it('can be told to skip the leak heuristic', async () => {
    const leaky = await starter()
    await fakeGenerate(leaky, { includePrivate: true })
    const result = await checkStatic({ rootDir: leaky, skipLeakCheck: true })
    expect(result.failures).toEqual([])
    expect(result.checked.join(' ')).not.toMatch(/non-public/)
  })

  it('detects a wrong base path', async () => {
    const other = await starter()
    await fakeGenerate(other)
    const result = await checkStatic({ rootDir: other, baseURL: '/elsewhere/' })
    expect(result.failures.join(' ')).toMatch(/base path/)
  })

  it('assumes nothing about the site beyond content/', async () => {
    // No publications page, no index.md, and a build directory that is not
    // `_nuxt/`: a real project may have any of these.
    const custom = await starter({ 'content/pages/index.md': '---\ntitle: Home\nroute: /about/\n---\n\nHi.\n' })
    await fakeGenerate(custom)
    for (const file of ['about/index.html']) {
      const path = join(custom, '.output/public', file)
      const html = (await readFile(path, 'utf8'))
        .replace('/_nuxt/entry.css', '/assets/entry.css')
        .replace(/<ol class="vita-bib[^"]*">[\s\S]*<\/ol>/g, '')
      await writeFile(path, html)
    }
    await writeSiteFiles(custom, 'assets/entry.css')
    const result = await checkStatic({ rootDir: custom })
    expect(result.failures).toEqual([])
    expect(result.checked.join('\n')).toMatch(/bibliography not shown on any page/)
  })

  it('detects a bibliography that is shown but not fully rendered', async () => {
    const broken = await starter()
    await fakeGenerate(broken)
    const page = join(broken, '.output/public/index.html')
    await writeFile(page, (await readFile(page, 'utf8')).replace('</ol>', '<li>bibmathplaceholder0end</li></ol>'))
    const result = await checkStatic({ rootDir: broken })
    expect(result.failures.join(' ')).toMatch(/formula in the bibliography was not rendered/)
  })

  it('finds links into the site that lead nowhere', async () => {
    const root = await starter({
      'content/pages/research.md': [
        '---', 'title: Research', '---', '',
        '[slides](/slides/talk.pdf) [typo](/slides/tlak.pdf) [page](/cv) [anchor](/research/#top)', '',
        '<img src="/img/a%20b.png">', '',
      ].join('\n'),
    })
    await fakeGenerate(root)
    await writeSiteFiles(root, 'slides/talk.pdf', 'cv/index.html', 'img/a b.png')

    const failures = (await checkStatic({ rootDir: root })).failures.join('\n')
    expect(failures).toMatch(/\/slides\/tlak\.pdf leads nowhere.*public\//)
    // A file, a page without its slash, an anchor and an encoded name are fine.
    expect(failures).not.toMatch(/talk\.pdf|\/cv |research\/#top|a%20b/)
  })

  it('detects a build for a subdirectory checked against the root', async () => {
    // Every path starts with `/`, so only the base Nuxt recorded gives it away.
    const sub = await starter()
    await fakeGenerate(sub)
    const page = join(sub, '.output/public/index.html')
    await writeFile(page, (await readFile(page, 'utf8'))
      .replace('/_nuxt/entry.css', '/sub/_nuxt/entry.css')
      .replace('</body>', '<script>window.__NUXT__.config={public:{},app:{baseURL:"/sub/",buildAssetsDir:"/_nuxt/"}}</script></body>'))
    const result = await checkStatic({ rootDir: sub, baseURL: '/' })
    expect(result.failures.join(' ')).toMatch(/built for \/sub\//)
    expect((await checkStatic({ rootDir: sub, baseURL: '/sub/' })).failures).toEqual([])
  })

  it('reports a missing build rather than throwing', async () => {
    const empty = await starter()
    const result = await checkStatic({ rootDir: empty })
    expect(result.failures[0]).toMatch(/run `nuxt generate`/)
  })
})

describe('visibility ordering', () => {
  it('is the same everywhere: public < cv < private', () => {
    expect(atMost('public', 'public')).toBe(true)
    expect(atMost('cv', 'public')).toBe(false)
    expect(atMost('cv', 'cv')).toBe(true)
    expect(atMost('private', 'cv')).toBe(false)
    expect(atMost('private', 'private')).toBe(true)
    // An entry with no explicit visibility is public.
    expect(atMost(undefined, 'public')).toBe(true)
  })
})

describe('full pipeline', () => {
  it('produces a PDF from the same content as the website', async () => {
    const root = await starter()
    await buildCv({ rootDir: root, noPdf: true })
    // The class ships with the package and is copied into the generated
    // directory; nothing vitakit writes touches the files the user edits.
    expect(existsSync(join(root, 'cv-tex/generated/cv/vitakit-cv.cls'))).toBe(true)
    expect(existsSync(join(root, 'cv-tex/vitakit-cv.cls'))).toBe(false)

    const web = await loadContent(root)
    const tex = await readFile(join(root, 'cv-tex/generated/cv/talks.tex'), 'utf8')

    // Same talk, rendered for two media: KaTeX markup vs. raw TeX.
    const title = (web.sections.talks![0]!.title as { html: string }).html
    expect(title).toContain('katex')
    expect(tex).toContain('$k$-ary')
  })

  // The remaining promise of the TeX side is that latexmk actually succeeds and
  // leaves the source directory clean. That needs a TeX distribution, so it is
  // skipped where there is none rather than being asserted by hand.
  it.skipIf(!hasLatexmk())('typesets a PDF and keeps its litter in generated/', async () => {
    const root = await starter()
    const [pdf] = await buildCv({ rootDir: root })

    expect(pdf).toBe(join(root, 'cv-tex/cv.pdf'))
    expect(existsSync(pdf!)).toBe(true)

    // cv-tex/ holds the user's files plus the PDF, and nothing else.
    const left = (await readdir(join(root, 'cv-tex'))).sort()
    expect(left).toEqual(['cv.pdf', 'cv.tex', 'generated', 'preamble.tex'])

    // The class was found through TEXINPUTS, and the aux files went with it.
    const generated = await readdir(join(root, 'cv-tex/generated/cv'))
    expect(generated).toContain('vitakit-cv.cls')
    expect(generated).toContain('cv.aux')
    expect(generated).toContain('cv.log')
  }, 120_000)

  it.skipIf(!hasLatexmk() || !hasPdftotext())('prints a .bib url that is a path on the site as an absolute URL', async () => {
    const root = await starter({
      'content/profile.yml': 'name: Jane Doe\nurl: https://jane.example.org/site/\n',
      'content/publications.bib': '@misc{local, author = {Doe, Jane}, title = {Local}, year = {2024}, url = {/papers/local.pdf}}\n',
    })
    const [pdf] = await buildCv({ rootDir: root })
    const text = execFileSync('pdftotext', [pdf!, '-'], { encoding: 'utf8' }).replace(/\s+/g, '')
    expect(text).toContain('https://jane.example.org/site/papers/local.pdf')
  }, 120_000)

  it.skipIf(!hasLatexmk() || !hasPdftotext())('prints every publication under its group in the PDF', async () => {
    const root = await starter({
      'content/publications.bib': [
        '@article{no_status:2024, author = {Doe, Jane}, title = {Without a status}, journal = {J}, year = {2024}}',
        '@article{doe2023, author = {Doe, Jane}, title = {With a capitalised status}, journal = {J}, year = {2023}, status = {Published}}',
        '@misc{doe2025, author = {Doe, Jane}, title = {A preprint}, year = {2025}, status = {preprint}}',
        '',
      ].join('\n'),
    })
    const [pdf] = await buildCv({ rootDir: root })
    const text = execFileSync('pdftotext', [pdf!, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ')
    const published = text.indexOf('Published')
    const preprints = text.indexOf('Preprints')
    expect(published).toBeGreaterThan(-1)
    expect(preprints).toBeGreaterThan(published)
    for (const title of ['Without a status', 'With a capitalised status']) {
      const at = text.indexOf(title)
      expect(at, title).toBeGreaterThan(published)
      expect(at, title).toBeLessThan(preprints)
    }
    expect(text.indexOf('A preprint')).toBeGreaterThan(preprints)
  }, 120_000)
})

describe('deploying under a subdirectory', () => {
  const BASE = '/subdir/'

  it('links paths on the site in section entries and the profile below the base', async () => {
    const root = await starter({
      'content/profile.yml': 'name: Jane Doe\nlinks:\n  - { label: CV, url: /cv.pdf }\n  - https://orcid.org/0000\n',
      'content/talks.yml': '- { date: 2025, title: A talk, slides: /slides/talk.pdf, url: https://aofa.org }\n',
    })
    const content = await loadContent(root, { baseURL: BASE })
    expect(content.sections.talks![0]!.slides).toBe('/subdir/slides/talk.pdf')
    expect(content.sections.talks![0]!.url).toBe('https://aofa.org')
    expect(content.profile.links.map(link => link.url)).toEqual(['/subdir/cv.pdf', 'https://orcid.org/0000'])
    expect(JSON.stringify(content)).not.toContain('__vitakitPath')
  })

  it('rewrites every asset path a user can write', async () => {
    const root = await starter({
      'content/profile.yml': 'name: Jane Doe\navatar: /img/portrait.svg\n',
      'content/pages/research.md': [
        '---', 'title: Research', '---', '',
        '![markdown image](/img/a.png)', '',
        '<figure><img src="/img/b.svg" alt="raw html image"></figure>', '',
        '[a local link](/cv/) and [an external one](https://e.org/x)', '',
      ].join('\n'),
    })

    const content = await loadContent(root, { baseURL: BASE })
    const page = content.pages.find(item => item.route === '/research/')!

    expect(page.bodyHtml).toContain('src="/subdir/img/a.png"')
    // Raw HTML in Markdown is a separate code path from `![]()`.
    expect(page.bodyHtml).toContain('src="/subdir/img/b.svg"')
    expect(page.bodyHtml).toContain('href="/subdir/cv/"')
    expect(page.bodyHtml).toContain('href="https://e.org/x"')
    // profile.avatar is not Markdown, and was missed until it was tested.
    expect(content.profile.avatar).toBe('/subdir/img/portrait.svg')
  })

  it('leaves paths alone when the site is served from the root', async () => {
    const root = await starter({ 'content/profile.yml': 'name: Jane Doe\navatar: /img/portrait.svg\n' })
    const content = await loadContent(root)
    expect(content.profile.avatar).toBe('/img/portrait.svg')
  })

  it('reports a path that escaped the base URL', async () => {
    const root = await starter()
    await fakeGenerate(root)
    // A build for the base, with one page that hard-codes a root-relative path,
    // as a hand-written component might.
    const index = join(root, '.output/public/index.html')
    await writeFile(index, (await readFile(index, 'utf8'))
      .replace('/_nuxt/entry.css', `${BASE}_nuxt/entry.css`)
      .replace('</body>', '<img src="/img/stray.png"></body>'))

    const result = await checkStatic({ rootDir: root, baseURL: BASE })
    expect(result.failures.join(' ')).toMatch(/\/img\/stray\.png does not use the base path/)
  })

  it('sees escaped paths in every URL attribute, not only src and href', async () => {
    const root = await starter()
    await fakeGenerate(root)
    const index = join(root, '.output/public/index.html')
    const html = (await readFile(index, 'utf8'))
      .replace('/_nuxt/entry.css', `${BASE}_nuxt/entry.css`)
      .replace('</body>', [
        `<img src="${BASE}ok.png" srcset="${BASE}ok.png 1x, /img/stray@2x.png 2x">`,
        `<video poster='/img/stray-poster.png'></video>`,
        `<object data="/files/stray.pdf"></object>`,
        `<a href="//cdn.example/fine.js">protocol-relative</a>`,
        `<p data-src="/not-an-attribute-we-check"></p>`,
        '</body>',
      ].join(''))
    await writeFile(index, html)
    await writeSiteFiles(root, 'ok.png')

    const failures = (await checkStatic({ rootDir: root, baseURL: BASE })).failures.join('\n')
    expect(failures).toMatch(/\/img\/stray@2x\.png does not use/)
    expect(failures).toMatch(/\/img\/stray-poster\.png does not use/)
    expect(failures).toMatch(/\/files\/stray\.pdf does not use/)
    expect(failures).not.toMatch(/cdn\.example|not-an-attribute|ok\.png/)
  })

  it('passes a build made for the base path', async () => {
    const root = await starter({
      'content/pages/research.md': '---\ntitle: Research\n---\n\n[CV](/cv/) <img src="/a.png" srcset="/a.png 1x, /b.png 2x">\n',
    })
    // Render the pages for the base, as `nuxt generate` would.
    const content = await loadContent(root, { baseURL: BASE })
    for (const page of content.pages) {
      const dir = join(root, '.output/public', page.route.slice(1))
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'index.html'), `<html><head><script type="module" src="${BASE}_nuxt/entry.js"></script></head><body>${page.bodyHtml}</body></html>`)
    }
    await writeSiteFiles(root, '_nuxt/entry.js', 'a.png', 'b.png', 'cv/index.html')
    const result = await checkStatic({ rootDir: root, baseURL: BASE })
    expect(result.failures).toEqual([])
  })
})
