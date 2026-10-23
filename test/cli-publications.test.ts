/** What `status`, `explain` and `validate` say about publication lists. */
import { describe, expect, it } from 'vitest'
import { cli } from './support/cli'
import { exampleProject as project } from './support/example'

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
    expect(out).toContain('Show it with <VitaPublications list="preprints" /> on a page')
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
