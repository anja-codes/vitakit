/**
 * Real PDF builds with latexmk: the generated TeX must compile with the
 * document class, and print what the content says. Skipped without a TeX
 * distribution and pdftotext.
 */
import { existsSync } from 'node:fs'
import { cp, readdir, readFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCv } from '../src/tex/build'
import { hasCommand, project, ROOT, writeFiles } from './support/project'

const CONTENT = {
  'content/profile.yml': 'name: Jane Doe\ntitle: Postdoc\nurl: https://jane.example.org/site/\n',
  'content/employment.yml': '- { date: { from: 2023, to: present }, position: Researcher & lecturer, institution: { name: Institute & Friends, url: "https://e.org/?a=1&b=2" }, project: { title: Trees $k$, url: /p.pdf, funder: Funder & Co, grant: P_123 } }\n',
  'content/education.yml': '- { date: 2023, degree: PhD, institution: TU Graz, thesis: { type: Dissertation, title: Large trees $k$, supervisor: { label: A & B, url: "https://e.org/s" } } }\n',
  'content/teaching.yml': '- { date: 2025, term: Summer 2025, title: A course, role: "Lead & examiner: 50% #1", note: "Budget: $500" }\n',
  'content/supervision.yml': '- { date: 2025, student: Student One, title: First thesis $k$, ongoing: true, coSupervisor: Co & Supervisor }\n',
  'content/talks.yml': '- { date: 2025, title: An invited talk, kind: invited }\n- { date: 2024, title: A contributed talk, kind: contributed }\n',
  'content/publications.bib': [
    '@article{no_status:2024, author = {Doe, Jane}, title = {Without a status}, journal = {J}, year = {2024}, url = {/papers/local.pdf}}',
    '@article{doe2023, author = {Doe, Jane}, title = {With a capitalised status}, journal = {J}, year = {2023}, status = {Published}}',
    '@misc{doe2025, author = {Doe, Jane}, title = {A preprint}, year = {2025}, status = {preprint}}',
  ].join('\n'),
}

/** A project with the scaffold's cv-tex/ and the given content. */
async function scaffolded(files: Record<string, string> = {}) {
  const root = await project({ ...CONTENT })
  await cp(join(ROOT, 'create/template/cv-tex'), join(root, 'cv-tex'), { recursive: true })
  await cp(join(ROOT, 'create/template/content/publication-lists.yml'), join(root, 'content/publication-lists.yml'))
  await writeFiles(root, files)
  return root
}

const pdfText = (pdf: string) => execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ')

describe.skipIf(!hasCommand('latexmk') || !hasCommand('pdftotext'))('latexmk', { timeout: 120_000 }, () => {
  it('typesets the scaffolded CV, leaving only the PDF next to the sources', async () => {
    const root = await scaffolded()
    const [pdf] = await buildCv({ rootDir: root })
    expect(pdf).toBe(join(root, 'cv-tex/cv.pdf'))
    expect((await readdir(join(root, 'cv-tex'))).sort()).toEqual(['cv.pdf', 'cv.tex', 'cv.yml', 'generated', 'latexmkrc', 'preamble.tex', 'prose'])

    const text = pdfText(pdf!)
    for (const expected of [
      'Researcher & lecturer', 'Project Trees', 'Funder & Co', 'Dissertation: Large trees', 'supervised by A & B',
      'Summer 2025', 'Lead & examiner: 50% #1', 'Budget: $500', 'with Co & Supervisor (in progress)',
      'Selected talks', 'An invited talk',
    ]) expect(text).toContain(expected)
    expect(text).not.toContain('A contributed talk') // cv.yml: talks where kind is invited
    expect(text).not.toMatch(/undefined|\[object Object\]|\\/)

    // Every entry under its group, whatever its status says; a site path in the .bib made absolute.
    const [published, preprints] = [text.indexOf('Published'), text.indexOf('Preprints')]
    expect(text.indexOf('Without a status')).toBeGreaterThan(published)
    expect(text.indexOf('With a capitalised status')).toBeGreaterThan(published)
    expect(text.indexOf('A preprint')).toBeGreaterThan(preprints)
    expect(preprints).toBeGreaterThan(published)
    expect(text.replace(/ /g, '')).toContain('https://jane.example.org/site/papers/local.pdf')
  })

  it('prints a publication list in its own order, and neither an empty list nor its heading', async () => {
    const root = await scaffolded({
      'content/publication-lists.yml': 'titles: { sort: title, order: desc }\nnone: { where: { status: software } }\n',
      'cv-tex/cv.tex': (await readFile(join(ROOT, 'create/template/cv-tex/cv.tex'), 'utf8'))
        .replace('\\vitapublications[Publications]{all}', '\\vitapublications[By title]{titles}\n\\vitapublications[Software]{none}'),
    })
    const text = pdfText((await buildCv({ rootDir: root }))[0]!)
    // Z to A by title; biblatex alone would sort by year.
    const order = ['Without a status', 'With a capitalised status', 'A preprint'].map(title => text.indexOf(title))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(order[0]).toBeGreaterThan(text.indexOf('By title'))
    expect(text).not.toContain('Software')
  })

  // Names, places and titles are not all in pdfLaTeX's default font encoding.
  it('typesets characters beyond the default font encoding', async () => {
    const title = '„Warum Ordnung schwer ist“ – Łódź, Győr, Ærø'
    const root = await scaffolded({ 'content/teaching.yml': `- { date: 2025, title: "${title}" }\n` })
    const [pdf] = await buildCv({ rootDir: root })
    expect(pdfText(pdf!)).toContain(title)
  })

  it('titles sections inline, then from cv.yml, then from the preamble, and hides empty ones', async () => {
    const root = await scaffolded({
      'content/supervision.yml': '[]\n',
      'cv-tex/preamble.tex': '\\vitasectiontitle{employment}{Employment}\n\\vitasectiontitle{talks}{Selected talks}\n',
      'cv-tex/cv.yml': 'visibility: public\nsections:\n  talks: { title: YAML talks }\n  teaching: { since: 2030 }\n',
      'cv-tex/cv.tex': [
        '\\documentclass{vitakit-cv}', '\\vitadocument{cv}', '\\input{preamble.tex}', '\\vitainput{profile}', '\\begin{document}',
        '\\tableofcontents',
        '\\vitasection[Inline employment \\& roles]{employment}',
        '\\vitasection{employment}',
        '\\vitasection{talks}',
        '\\vitasection[Hidden teaching]{teaching}',
        '\\vitasection{supervision}',
        '\\end{document}',
      ].join('\n'),
    })
    const [pdf] = await buildCv({ rootDir: root })
    const text = pdfText(pdf!)
    for (const heading of ['Inline employment & roles', 'Employment', 'YAML talks']) expect(text).toContain(heading)
    for (const hidden of ['Selected talks', 'Hidden teaching', 'Teaching', 'Supervised theses']) expect(text).not.toContain(hidden)

    // They are real sections, in the table of contents.
    const toc = await readFile(join(root, 'cv-tex/generated/cv/cv.toc'), 'utf8')
    expect([...toc.matchAll(/\\numberline \{\d+\}(.*)\}\{\d+\}\{section/g)].map(match => match[1]))
      .toEqual(['Inline employment \\& roles', 'Employment', 'YAML talks'])
  })

  it('builds a document named like a section without the generated section shadowing it', async () => {
    const root = await scaffolded()
    await cp(join(root, 'cv-tex/cv.tex'), join(root, 'cv-tex/teaching.tex'))
    await writeFiles(root, { 'cv-tex/teaching.tex': (await readFile(join(root, 'cv-tex/teaching.tex'), 'utf8')).replace('\\vitadocument{cv}', '\\vitadocument{teaching}') })
    const [pdf] = await buildCv({ rootDir: root, only: ['teaching'] })
    expect(pdf).toBe(join(root, 'cv-tex/teaching.pdf'))
    expect(pdfText(pdf!)).toContain('Lead & examiner')
  })

  it('fails rather than typesetting stale TeX after a section file is deleted', async () => {
    const root = await scaffolded()
    await buildCv({ rootDir: root })
    await rm(join(root, 'content/employment.yml'))
    await expect(buildCv({ rootDir: root })).rejects.toThrow('latexmk exited with code 12')
    expect(existsSync(join(root, 'cv-tex/generated/cv/employment.tex'))).toBe(false)
  })
})
