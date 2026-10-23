/**
 * Publication lists from the command line: what `status`, `explain` and
 * `validate` say about them, and `add publication-list`.
 */
import { describe, expect, it } from 'vitest'
import { loadContent } from '../src/content'
import { cli } from './support/cli'
import { exampleProject as project, readProjectFile as read } from './support/example'

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

  it('report unknown lists on pages and in PDFs, and props that select on the page', async () => {
    const root = await project({
      'app/pages/research.vue': '<template>\n  <main>\n    <VitaPublications list="recnet" />\n    <VitaPublications :groups="[\'preprint\']" />\n  </main>\n</template>\n',
      'cv-tex/cv.tex': source => source.replace('{all}', '{al}'),
    })
    const { out, code } = await cli(['validate'], { cwd: root })
    expect(code).toBe(1)
    expect(out).toContain('app/pages/research.vue:3\n    no publication list "recnet"; the lists are all, recent (content/publication-lists.yml)')
    expect(out).toContain('app/pages/research.vue:4\n    VitaPublications does not take groups: which publications a list shows is set in content/publication-lists.yml')
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
