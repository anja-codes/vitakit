/**
 * `vitakit-build-cv --no-pdf`: from `content/` and `cv-tex/` to the generated
 * `.tex` files, without running LaTeX (see `latex.test.ts` for that).
 */
import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCv, readGenerated } from '../src/tex/build'
import { loadContent } from '../src/content'
import { importPackage, project, writeFiles } from './support/project'

const DOCUMENT = '\\documentclass{vitakit-cv}\n\\begin{document}\n\\vitasection{talks}\n\\end{document}\n'
const BASE = {
  'content/profile.yml': 'name: Jane Doe\n',
  'content/talks.yml': '- { date: 2025, title: An invited talk, kind: invited }\n- { date: 2024, title: A CV-only talk, kind: contributed, visibility: cv }\n',
  'cv-tex/cv.tex': DOCUMENT,
  'cv-tex/preamble.tex': '% not a document\n',
}
const OUTREACH_SCHEMA = `${importPackage('section', 'dateRange', 'richText', 'text')}export default section({ date: dateRange, title: richText, audience: text.optional() })\n`

const build = (root: string, only?: string[]) => buildCv({ rootDir: root, noPdf: true, only })
const generated = (root: string, file: string, document = 'cv') => readGenerated(root, document, file)

describe('documents', () => {
  it('builds every .tex with \\begin{document}, each into its own directory', async () => {
    const root = await project({ ...BASE, 'cv-tex/short.tex': DOCUMENT })
    expect(await build(root)).toEqual([join(root, 'cv-tex/cv.pdf'), join(root, 'cv-tex/short.pdf')])
    expect(existsSync(join(root, 'cv-tex/generated/short/talks.tex'))).toBe(true)
    expect(existsSync(join(root, 'cv-tex/generated/preamble'))).toBe(false)
  })

  it('builds only the requested documents', async () => {
    const root = await project({ ...BASE, 'cv-tex/short.tex': DOCUMENT })
    expect(await build(root, ['short'])).toEqual([join(root, 'cv-tex/short.pdf')])
    expect(existsSync(join(root, 'cv-tex/generated/cv'))).toBe(false)
    await expect(build(root, ['cv', 'typo'])).rejects.toThrow('no document matched typo; available: cv, short')
  })

  it('include cv entries by default, which the website never shows', async () => {
    const root = await project(BASE)
    await build(root)
    expect(await generated(root, 'talks')).toContain('A CV-only talk')
    expect(JSON.stringify(await loadContent(root))).not.toContain('A CV-only talk')
  })

  it('select entries by their cv-tex/<name>.yml, without affecting other documents', async () => {
    const root = await project({
      ...BASE,
      'cv-tex/short.tex': DOCUMENT,
      'cv-tex/short.yml': 'visibility: public\nsections:\n  talks: { where: { kind: [invited, contributed] } }\n',
    })
    await build(root)
    expect(await generated(root, 'talks', 'short')).toContain('An invited talk')
    expect(await generated(root, 'talks', 'short')).not.toContain('A CV-only talk')
    expect(await generated(root, 'talks')).toContain('A CV-only talk')
  })

  it.each([
    ['visibility: everyone\n', /cv-tex\/cv\.yml: invalid\n {2}- visibility/],
    ['sections: [\n', /cv-tex\/cv\.yml: /],
    ['sections:\n  talk: { limit: 1 }\n', /cv-tex\/cv\.yml: sections\.talk: unknown section; the sections are talks/],
    ['sections:\n  talks: { where: { knid: invited } }\n', /cv-tex\/cv\.yml: sections\.talks\.where\.knid: unknown field; the fields are year, visibility, date, title/],
    ['publications: { groups: [published, preprints] }\n', /cv-tex\/cv\.yml: publications\.groups: unknown group preprints; the groups are published, accepted, preprint/],
  ])('reject the options %j, naming the file', async (yaml, message) => {
    await expect(build(await project({ ...BASE, 'cv-tex/cv.yml': yaml }))).rejects.toThrow(message)
  })

  it('check filter fields against the schema, not against the entries there happen to be', async () => {
    const root = await project({
      ...BASE,
      'content/talks.yml': '[]\n',
      'content/outreach.yml': '[]\n',
      'schemas/outreach.ts': OUTREACH_SCHEMA,
      'cv-tex/cv.yml': 'sections:\n  talks: { where: { event: AofA } }\n  outreach: { where: { audience: school } }\n',
    })
    await expect(build(root)).resolves.toHaveLength(1)
  })

  it('fail without a document', async () => {
    await expect(build(await project({ ...BASE, 'cv-tex/cv.tex': '\\input{x}\n' }))).rejects.toThrow('cv-tex/: no .tex file contains \\begin{document}')
    await expect(build(await project({ 'content/profile.yml': 'name: J\n' }))).rejects.toThrow(/no cv-tex\/ directory/)
  })
})

describe('the generated files', () => {
  it('bundled templates write each built-in section', async () => {
    const root = await project({
      ...BASE,
      'content/profile.yml': 'name: Jane Doe\nurl: https://jane.example.org/site\n',
      'content/education.yml': '- { date: { from: 2019, to: 2023 }, degree: PhD, institution: { name: TU Graz, url: https://tugraz.at }, thesis: { type: Dissertation, title: Large $k$-ary trees, supervisor: { label: A & B, url: https://e.org/ab } }, note: Summa cum laude }\n',
      'content/employment.yml': '- { date: { from: 2023, to: present }, position: Postdoc, institution: Uni Graz, project: { title: Trees, url: /projects/trees.pdf, funder: FWF, grant: P_123 } }\n',
      'content/supervision.yml': '- { date: 2025, student: A. Student, title: First $k$, degree: MSc, institution: TU Graz, ongoing: true, coSupervisor: B & C }\n',
      'content/talks.yml': '- { date: 2025-06, title: Random $k$-ary trees, event: AofA, location: Graz, slides: /slides/a.pdf }\n',
      'content/teaching.yml': '- { date: 2025, term: 2025S, title: Combinatorics, role: "Lecturer & examiner: 50% #1_a", institution: TU Graz, note: 30 students }\n',
    })
    await build(root)
    const body = async (section: string) => (await generated(root, section)).split('\n').slice(1).join('\n')
    expect(await body('education')).toBe('\\vitaentry{2019--2023}{PhD}{\\href{https://tugraz.at}{TU Graz}}\n'
      + '\\vitanote{Dissertation: \\emph{Large $k$-ary trees}, supervised by \\href{https://e.org/ab}{A \\& B}}\n'
      + '\\vitanote{Summa cum laude}\n')
    expect(await body('employment')).toBe('\\vitaentry{2023--present}{Postdoc}{Uni Graz}\n'
      + '\\vitanote{Project \\emph{\\href{https://jane.example.org/site/projects/trees.pdf}{Trees}} (FWF~P\\_123)}\n')
    expect(await body('supervision')).toBe('\\vitaentry{2025--}{A. Student}{MSc, TU Graz}\n'
      + '\\vitanote{\\emph{First $k$}, with B \\& C (in progress)}\n')
    expect(await body('talks')).toBe('\\vitaentry{Jun 2025}{Random $k$-ary trees}{AofA, Graz}\n')
    expect(await body('teaching')).toBe('\\vitaentry{2025S}{Combinatorics}{Lecturer \\& examiner: 50\\% \\#1\\_a, TU Graz}\n'
      + '\\vitanote{30 students}\n')
  })

  it('profile.tex holds the header, empty-section markers and title overrides', async () => {
    const root = await project({
      ...BASE,
      'content/profile.yml': 'name: Jane Doe\ntitle: Postdoc\naffiliation: TU Graz & Co\nemail: jane@example.org\nlinks:\n  - https://orcid.org/0000\n',
      'content/teaching.yml': '[]\n',
      'cv-tex/cv.yml': 'sections:\n  talks: { title: "Talks & seminars #1" }\n',
    })
    await build(root)
    expect(await generated(root, 'profile')).toBe([
      '% Generated by vitakit. Do not edit; edit content/profile.yml or cv-tex/cv.yml instead.',
      '\\vitaname{Jane Doe}',
      '\\vitatagline{Postdoc, TU Graz \\& Co}',
      '\\vitacontact{\\href{mailto:jane@example.org}{jane@example.org} \\quad \\href{https://orcid.org/0000}{orcid.org/0000}}',
      '\\vitasectiontitle{talks}{Talks \\& seminars \\#1}',
      '\\vitaemptysection{teaching}',
      '',
    ].join('\n'))
  })

  it.each([
    ['nothing in the file', { 'content/talks.yml': '[]\n' }],
    ['a year filter', { 'cv-tex/cv.yml': 'sections:\n  talks: { since: 2030 }\n' }],
    ['a field filter', { 'cv-tex/cv.yml': 'sections:\n  talks: { where: { kind: seminar } }\n' }],
    ['visibility', { 'cv-tex/cv.yml': 'visibility: public\n', 'content/talks.yml': '- { date: 2025, title: T, visibility: cv }\n' }],
  ])('mark a section empty after %s, and unmark it once it has entries', async (_case, files) => {
    const root = await project({ ...BASE, ...files })
    await build(root)
    expect(await generated(root, 'profile')).toContain('\\vitaemptysection{talks}')
    expect(await generated(root, 'talks')).not.toContain('\\vitaentry')

    await writeFiles(root, BASE)
    await rm(join(root, 'cv-tex/cv.yml'), { force: true })
    await build(root)
    expect(await generated(root, 'profile')).not.toContain('\\vitaemptysection')
  })

  it('publications.tex selects each group\'s entries for biblatex, as the website groups them', async () => {
    const root = await project({
      ...BASE,
      'content/publications.bib': [
        '@article{doe2024, author = {Doe, Jane}, title = {No status}, journal = {J}, year = {2024}}',
        '@article{doe2023, author = {Doe, Jane}, title = {Capitalised}, journal = {J}, year = {2023}, status = {Published}}',
        '@misc{doe2025, author = {Doe, Jane}, title = {Preprint}, year = {2025}, status = {preprint}}',
      ].join('\n'),
    })
    await build(root)
    expect(await generated(root, 'publications')).toBe([
      '% Generated by vitakit. Do not edit; edit content/publications.bib instead.',
      '\\begin{refsection}',
      '\\nocite{*}',
      '\\vitabibgroup{published}{doe2024,doe2023}',
      '\\printbibliography[check=vita-published, title={Published}, heading=subbibliography]',
      '\\vitabibgroup{preprint}{doe2025}',
      '\\printbibliography[check=vita-preprint, title={Preprints}, heading=subbibliography]',
      '\\end{refsection}',
      '',
    ].join('\n'))
  })

  it('custom publication groups reach the PDF as they reach the website', async () => {
    const root = await project({
      ...BASE,
      'schemas/publications.ts': `${importPackage('publications')}export default publications({ groups: [{ id: 'papers', label: 'Articles' }, { id: 'talk-slides', label: 'Talk slides' }] })\n`,
      'content/publications.bib': '@misc{slides2023, title = {Slides}, year = {2023}, status = {talk-slides}}\n',
      'cv-tex/cv.yml': 'publications: { groups: [talk-slides] }\n',
    })
    await build(root)
    expect(await generated(root, 'publications')).toContain('\\vitabibgroup{talk-slides}{slides2023}\n\\printbibliography[check=vita-talk-slides, title={Talk slides}')
  })

  it('a removed section, or deselected publications, leave no stale TeX, and latexmk\'s files stay', async () => {
    const root = await project({ ...BASE, 'content/publications.bib': '@misc{test, title = {A publication}, year = {2025}}\n' })
    await build(root)
    const out = join(root, 'cv-tex/generated/cv')
    await writeFile(join(out, 'cv.aux'), '% cached\n')

    await rm(join(root, 'content/talks.yml'))
    await writeFiles(root, { 'cv-tex/cv.yml': 'publications: { groups: [] }\n' })
    await build(root)
    expect(existsSync(join(out, 'talks.tex'))).toBe(false)
    expect(await generated(root, 'publications')).not.toContain('test')
    expect(await readFile(join(out, 'cv.aux'), 'utf8')).toBe('% cached\n')
  })
})

describe('the document class', () => {
  it('is copied into the generated directory, not into cv-tex/', async () => {
    const root = await project(BASE)
    await build(root)
    expect(existsSync(join(root, 'cv-tex/generated/cv/vitakit-cv.cls'))).toBe(true)
    expect(existsSync(join(root, 'cv-tex/vitakit-cv.cls'))).toBe(false)
  })

  it('is not copied once ejected, where the copy would shadow the ejected one', async () => {
    const root = await project(BASE)
    await build(root)
    await writeFiles(root, { 'cv-tex/vitakit-cv.cls': '% mine\n' })
    await build(root)
    expect(existsSync(join(root, 'cv-tex/generated/cv/vitakit-cv.cls'))).toBe(false)
    expect(await readFile(join(root, 'cv-tex/vitakit-cv.cls'), 'utf8')).toBe('% mine\n')
  })
})

describe('paths on the site', () => {
  const PROJECT = '- { date: 2023, position: Postdoc, institution: Uni, project: { title: Trees, url: /projects/trees.pdf } }\n'

  it('become absolute below profile.url, in entries, the profile and the .bib file', async () => {
    const root = await project({
      ...BASE,
      'content/profile.yml': 'name: Jane Doe\nurl: https://jane.example.org/site/\nlinks:\n  - { label: CV, url: /cv.pdf }\n',
      'content/employment.yml': PROJECT,
      'content/publications.bib': '@misc{local, title = {Local}, year = {2024}, url = {/papers/local.pdf}}\n',
    })
    await build(root)
    expect(await generated(root, 'employment')).toContain('\\href{https://jane.example.org/site/projects/trees.pdf}{Trees}')
    const profile = await generated(root, 'profile')
    expect(profile).toContain('\\href{https://jane.example.org/site/cv.pdf}{CV}')
    // biblatex prints the .bib's url itself: a sourcemap makes it absolute.
    expect(profile).toContain('\\step[fieldsource=url, match=\\regexp{\\A/}, replace={https://jane.example.org/site/}]')
  })

  it.each([
    ['an entry', { 'content/employment.yml': PROJECT }, /^template employment\.eta: content\/employment\.yml: \/projects\/trees\.pdf is a path on the website.*`url: https:\/\/jane\.example\.org\/`/],
    ['the profile', { 'content/profile.yml': 'name: J\nlinks:\n  - { label: CV, url: /cv.pdf }\n' }, /^content\/profile\.yml: links: \/cv\.pdf is a path on the website/],
    ['the .bib file', { 'content/publications.bib': '@misc{local, title = {L}, year = {2024}, url = {/papers/local.pdf}}\n' }, /^content\/publications\.bib: local: url \/papers\/local\.pdf is a path on the website/],
  ])('in %s are refused without profile.url, saying what to add', async (_case, files, message) => {
    await expect(build(await project({ ...BASE, ...files }))).rejects.toThrow(message)
  })

  it('do not need profile.url where the PDF does not print them', async () => {
    const root = await project({ ...BASE, 'content/talks.yml': '- { date: 2025, title: A talk, slides: /slides/talk.pdf }\n' })
    await expect(build(root)).resolves.toHaveLength(1)
  })

  it('refuse a profile.url that is unsafe to write into the sourcemap', async () => {
    const root = await project({ ...BASE, 'content/profile.yml': 'name: J\nurl: https://e.org/a?b={c}\n' })
    await expect(build(root)).rejects.toThrow(/content\/profile\.yml: url: .* may only contain letters, digits and - \. _ : \//)
  })
})
