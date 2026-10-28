/**
 * Publication lists from the command line: `add publication-list`, `migrate`
 * from VitaPublications' groups and headings, and what `status`, `explain` and
 * `validate` say about lists.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PUBLICATIONS_TITLE_CSS } from '../src/cli/migrations'
import { loadContent } from '../src/content'
import { cli } from './support/cli'
import { exampleProject as project, readProjectFile as read } from './support/example'
import { ROOT } from './support/project'

describe('status, explain and validate', () => {
  it('list each publication list, how many it shows and where', async () => {
    const root = await project()
    expect((await cli(['status'], { cwd: root })).out).toMatch(/all: 3 entries · \/publications\/, cv \(pdf\)\n.*recent: 3 entries · \//)
    const explained = (await cli(['explain', 'publications'], { cwd: root })).out
    expect(explained).toMatch(/all\s+3 entries · newest first · grouped by status\n\s+\/publications\/, cv \(pdf\)/)
    expect(explained).toMatch(/recent\s+3 entries · newest first · at most 3\n\s+\//)
    expect((await cli(['explain', 'cv'], { cwd: root })).out).toMatch(/lists\s+line \d+\s+all\s+Publications\s+3 entries/)
  })

  it('explain one list step by step: what each setting removed, and what is left', async () => {
    const root = await project({ 'content/publication-lists.yml': source => `${source}\npreprints:\n  where: { status: preprint }\n` })
    const { out } = await cli(['explain', 'preprints'], { cwd: root })
    expect(out).toMatch(/list\s+content\/publication-lists\.yml:\d+\n\s+status preprint · newest first/)
    expect(out).toMatch(/shows\s+1 of 3 publications \(where status: preprint −2\)\n\s+example-preprint/)
    expect(out).toContain('not on any page')
    expect(out).toContain('add publication-list preprints --page /publications/')
  })

  it('ask which is meant when a list has the name of a section, rather than hiding it', async () => {
    const root = await project({ 'content/publication-lists.yml': source => `${source}\ntalks: {}\npublications: { limit: 1 }\n` })
    const both = await cli(['explain', 'talks'], { cwd: root })
    expect(both.code).toBe(2)
    expect(both.err).toContain('"talks" is a section and a publication list; say which:\n  pnpm vitakit explain section talks\n  pnpm vitakit explain publication-list talks')
    expect((await cli(['explain', 'publication-list', 'talks'], { cwd: root })).out).toMatch(/^talks\n\n {2}list {6}content\/publication-lists\.yml:\d+/)
    expect((await cli(['explain', 'section', 'talks'], { cwd: root })).out).toContain('content/talks.yml')
    // `publications` alone is the overview; a list of that name has its kind.
    expect((await cli(['explain', 'publications'], { cwd: root })).out).toMatch(/^publications\n\n {2}data/)
    expect((await cli(['explain', 'publication-list', 'publications'], { cwd: root })).out).toContain('at most 1')
  })

  it.each([
    [['publication-list', 'recnet'], 'no publication list called "recnet"; sections: '],
    [['list', 'recent'], '"list" is not a kind: `explain <kind> <name>` takes section, document, publication-list, page'],
    [['section'], 'missing <name>: `explain section <name>`'],
  ])('explain %j says what is wrong', async (args, message) => {
    expect((await cli(['explain', ...args], { cwd: await project() })).err).toContain(message)
  })

  it('explain a page by its route or by its name', async () => {
    const root = await project()
    for (const args of [['/publications/'], ['page', 'publications'], ['page', '/publications/']]) {
      expect((await cli(['explain', ...args], { cwd: root })).out).toMatch(/^\/publications\/\n/)
    }
  })

  it('explain a list without a .bib file yet', async () => {
    const { out, code } = await cli(['explain', 'recent'], { cwd: await project({ 'content/publications.bib': null }) })
    expect(code).toBe(0)
    expect(out).toContain('shows     0 of 0 publications')
  })

  it('report unknown lists on pages and in PDFs, and props that select on the page', async () => {
    const root = await project({
      'app/pages/research.vue': '<template>\n  <main>\n    <VitaPublications list="recnet" />\n    <VitaPublications :groups="[\'preprint\']" />\n  </main>\n</template>\n',
      'cv-tex/cv.tex': source => source.replace('{all}', '{al}'),
    })
    const { out, code } = await cli(['validate'], { cwd: root })
    expect(code).toBe(1)
    expect(out).toContain('app/pages/research.vue:3\n    no publication list "recnet"; the lists are all, recent (content/publication-lists.yml)')
    expect(out).toContain('app/pages/research.vue:4\n    VitaPublications does not take groups: which publications a list shows is set in content/publication-lists.yml; `vitakit migrate` converts it')
    expect(out).toMatch(/cv-tex\/cv\.tex:\d+\n {4}no publication list "al"/)
  })
})

describe('add publication-list', () => {
  it('declares a list and shows it on a page and in a PDF', async () => {
    const root = await project()
    const result = await cli(['add', 'publication-list', 'preprints', '--where', 'status=preprint', '--where', 'status=accepted', '--limit', '5',
      '--page', '/publications/', '--document', 'cv', '--after', 'all', '--title', 'Preprints & more', '--yes'], { cwd: root })
    expect(result.code, result.err).toBe(0)
    expect(result.out).not.toContain('No publication matches')
    expect(await read(root, 'content/publication-lists.yml')).toMatch(/\n\npreprints:\n {2}where: \{ status: \[preprint, accepted\] \}\n {2}limit: 5\n$/)
    expect(await read(root, 'app/pages/publications.vue')).toContain('<VitaPublications list="all" class="mt-8" />\n    <VitaPublications list="preprints" title="Preprints &amp; more" />\n')
    expect(await read(root, 'cv-tex/cv.tex')).toContain('\\vitapublications[Publications]{all}\n\\vitapublications[Preprints \\& more]{preprints}\n')
    expect((await loadContent(root)).publications.preprints!.count).toBe(1)
    expect((await cli(['validate'], { cwd: root })).code).toBe(0)
  })

  it('only places a list that exists, and refuses to change it, saying where it is', async () => {
    const root = await project()
    const again = await cli(['add', 'publication-list', 'recent', '--document', 'cv', '--yes'], { cwd: root })
    expect(again.code, again.err).toBe(0)
    expect(again.out).toContain('= content/publication-lists.yml   the list recent, as it is')
    expect(await read(root, 'cv-tex/cv.tex')).toContain('\\vitapublications[Recent]{recent}')

    const changed = await cli(['add', 'publication-list', 'recent', '--limit', '5', '--yes'], { cwd: root })
    expect(changed.code).toBe(1)
    expect(changed.err).toMatch(/content\/publication-lists\.yml:\d+ declares recent already; change its settings there/)
  })

  it('points out a list that matches nothing yet', async () => {
    const result = await cli(['add', 'publication-list', 'accepted', '--where', 'status=accepted', '--dry-run'], { cwd: await project() })
    expect(result.out).toContain('No publication matches accepted yet, so it shows nothing for now')
  })

  it.each([
    [['--where', 'status=draft'], /drafts\.where\.status: no status "draft"/],
    [['--where', 'projct=trees'], /drafts: no publication has a field "projct"/],
  ])('refuses %j before writing', async (flags, message) => {
    const root = await project()
    const result = await cli(['add', 'publication-list', 'drafts', ...flags, '--yes'], { cwd: root })
    expect(result.err).toMatch(message)
    expect(await read(root, 'content/publication-lists.yml')).not.toContain('drafts')
  })

  it('asks which publications, in words, when run without settings', async () => {
    const root = await project()
    const result = await cli(['add', 'publication-list', 'selected'], {
      cwd: root,
      // some statuses; preprint, published; at most 2; oldest first; by year; on /; not in the PDF; the default heading; write
      answers: ['2', 'preprint, published', '2', '2', '3', '1', 'n', '', 'y'],
    })
    expect(result.code, result.err).toBe(0)
    expect(await read(root, 'content/publication-lists.yml')).toContain('selected:\n  where: { status: [preprint, published] }\n  limit: 2\n  order: asc\n  groupBy: year\n')
    expect(await read(root, 'app/pages/index.vue')).toContain('<VitaPublications list="selected" title="Selected" />')
  })
})

/** The example as an earlier vitakit scaffolded it. */
const LEGACY = {
  'content/publication-lists.yml': null,
  'app/pages/index.vue': '<template>\n  <main>\n    <VitaPublications :groups="[\'published\', \'preprint\']" :headings="false" class="mt-4" />\n  </main>\n</template>\n',
  'app/pages/publications.vue': (source: string) => source.replace('<VitaPublications list="all" class="mt-8" />', '<VitaPublications class="mt-8" />\n    <VitaPublications\n      :groups="[\'preprint\', \'published\']"\n    />'),
  'cv-tex/cv.tex': (source: string) => source.replace('\\vitapublications[Publications]{all}', '\\section{Publications}\n\\vitainput{publications}'),
  'cv-tex/cv.yml': (source: string) => `${source}publications:\n  groups: [published]\n`,
  'schemas/publications.ts': `import { publications } from '@anja.codes/vitakit'\n\nexport default publications({\n  groups: [{ id: 'published', label: 'Papers' }, { id: 'preprint', label: 'Preprints' }, { id: 'software', label: 'Software' }],\n  defaultGroup: 'published',\n})\n`,
}

describe('migrate', () => {
  it('turns groups and headings into lists, on pages, in PDFs and in the schema', async () => {
    const root = await project(LEGACY)
    expect((await cli(['validate'], { cwd: root })).code).toBe(1)

    const result = await cli(['migrate', '--yes'], { cwd: root })
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain('app/pages/index.vue:3 shows the list published-preprint-ungrouped: it is now one list, newest first, rather than one status after the other.')
    expect(result.out).toContain('app/pages/publications.vue:26 shows the list preprint-published: its groups now appear in the order of the statuses in schemas/publications.ts.')
    expect(result.out).toContain('cv-tex/cv.tex shows the list published: in the PDF too, publications now come in the list\'s order')

    expect(await read(root, 'app/pages/index.vue')).toContain('<VitaPublications list="published-preprint-ungrouped" class="mt-4" />')
    expect(await read(root, 'app/pages/publications.vue')).toContain('<VitaPublications list="all" class="mt-8" />\n    <VitaPublications list="preprint-published"\n    />')
    expect(await read(root, 'cv-tex/cv.tex')).toContain('\\vitasection[Teaching]{teaching}\n\n\\vitapublications[Publications]{published}\n')
    expect(await read(root, 'cv-tex/cv.yml')).not.toContain('publications')
    expect(await read(root, 'schemas/publications.ts')).toContain('  statuses: [{ id: \'published\', label: \'Papers\' }')
    const lists = await read(root, 'content/publication-lists.yml')
    for (const list of [
      'all:\n  groupBy: status\n',
      'published-preprint-ungrouped:\n  where: { status: [published, preprint] }\n',
      'preprint-published:\n  where: { status: [preprint, published] }\n  groupBy: status\n',
      'published:\n  where: { status: published }\n  groupBy: status\n',
    ]) expect(lists).toContain(`\n\n${list}`)

    const validated = await cli(['validate'], { cwd: root })
    expect(validated.code, validated.out).toBe(0)
    const again = await cli(['migrate', '--yes'], { cwd: root })
    expect(again.out).toContain('Nothing to write.')
  })

  it('lists what it cannot change, and changes the rest', async () => {
    const root = await project({
      ...LEGACY,
      'app/pages/index.vue': '<script setup>\nconst all = usePublications()\n</script>\n\n<template>\n  <main>\n    <VitaPublications :groups="chosen" />\n  </main>\n</template>\n',
      'app/components/VitaPublications.vue': '<template><div /></template>\n',
      'cv-tex/templates/publications.eta': '\\nocite{*}\n',
    })
    const result = await cli(['migrate', '--yes'], { cwd: root })
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain('By hand: app/pages/index.vue calls usePublications()')
    expect(result.out).toContain('By hand: app/pages/index.vue:7: its groups are not a literal list')
    expect(result.out).toContain('By hand: app/components/VitaPublications.vue is your copy of VitaPublications')
    expect(result.out).toContain('By hand: cv-tex/templates/publications.eta is your copy of the PDF template')
    expect(await read(root, 'app/pages/publications.vue')).toContain('<VitaPublications list="all" class="mt-8" />')
  })

  it('points out a stylesheet without the rules for a list\'s title, and leaves it as it is', async () => {
    const withoutTitle = (source: string) => source.replace(/^\.vita-publications__title[^{]*\{[^}]*\}\n/gm, '')
    const root = await project({ 'app/assets/css/main.css': withoutTitle })
    const css = await read(root, 'app/assets/css/main.css')
    expect(css).toContain('.vita-publications__heading')
    expect(css).not.toContain('.vita-publications__title')

    const result = await cli(['migrate', '--yes'], { cwd: root })
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain(`By hand: app/assets/css/main.css styles the groups of a publication list but not its title, <VitaPublications title>. New projects have, after .vita-publications__heading:\n${PUBLICATIONS_TITLE_CSS}`)
    expect(await read(root, 'app/assets/css/main.css')).toBe(css)
  })

  it('says nothing about a stylesheet that styles the title, or none of the list', async () => {
    expect((await cli(['migrate', '--yes'], { cwd: await project() })).out).not.toContain('main.css')
    const unstyled = await project({ 'app/assets/css/main.css': '@import "tailwindcss";\n' })
    expect((await cli(['migrate', '--yes'], { cwd: unstyled })).out).not.toContain('main.css')
  })

  it('suggests the rules the scaffold has', async () => {
    const scaffold = await readFile(join(ROOT, 'create/template/app/assets/css/main.css'), 'utf8')
    for (const rule of PUBLICATIONS_TITLE_CSS.split(/\n(?=\.)/)) expect(scaffold).toContain(rule)
  })
})
