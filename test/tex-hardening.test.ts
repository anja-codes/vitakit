import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildCv, readGenerated } from '../src/tex/build'

const temporary: string[] = []
const CV = String.raw`\documentclass{vitakit-cv}
\vitadocument{cv}
\vitainput{profile}
\begin{document}
\vitaheader
\vitasection{talks}
\end{document}
`
const TALKS = '- { date: 2025, title: A talk, kind: invited }\n'
const OUTREACH_SCHEMA = `import { section, dateRange, richText, text } from '${join(process.cwd(), 'src/index.ts')}'
export default section({ date: dateRange, title: richText, audience: text.optional() })\n`

async function project(extra: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vitakit-tex-hardening-'))
  temporary.push(root)
  for (const [file, source] of Object.entries({
    'content/profile.yml': 'name: Jane Doe\n',
    'content/talks.yml': TALKS,
    'cv-tex/cv.tex': CV,
    ...extra,
  })) {
    const path = join(root, file)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, source)
  }
  return root
}

const generate = (rootDir: string, only?: string[]) => buildCv({ rootDir, noPdf: true, only })

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('PDF build diagnostics', () => {
  it.each([
    ['sections:\n  talk: { limit: 1 }\n', /sections\.talk: unknown section/],
    ['sections:\n  talks:\n    where: { knid: invited }\n', /sections\.talks\.where\.knid: unknown field/],
  ])('rejects misspelled filter names: %s', async (yaml, error) => {
    const root = await project({ 'cv-tex/cv.yml': yaml })
    await expect(generate(root)).rejects.toThrow(error)
    await expect(generate(root)).rejects.toThrow(/cv-tex\/cv\.yml/)
  })

  it('checks schemas rather than guessing fields from nonempty entries', async () => {
    const root = await project({
      'content/talks.yml': '[]\n',
      'content/outreach.yml': '[]\n',
      'schemas/outreach.ts': OUTREACH_SCHEMA,
      'cv-tex/cv.yml': 'sections:\n  talks:\n    where: { event: AofA, year: "2025" }\n  outreach:\n    where: { audience: school }\n',
    })
    await expect(generate(root)).resolves.toHaveLength(1)
    await writeFile(join(root, 'cv-tex/cv.yml'), 'sections:\n  outreach:\n    where: { audiance: school }\n')
    await expect(generate(root)).rejects.toThrow(/sections\.outreach\.where\.audiance: unknown field/)
  })

  it('names the document when its YAML cannot be parsed', async () => {
    const root = await project({ 'cv-tex/cv.yml': 'sections: [\n' })
    await expect(generate(root)).rejects.toThrow(/cv-tex\/cv\.yml/)
  })

  it('rejects an unknown document even when another requested document exists', async () => {
    const root = await project()
    await expect(generate(root, ['cv', 'typo'])).rejects.toThrow(/no document matched typo; available: cv/)
  })
})

describe('empty selections and document titles', () => {
  it.each([
    ['empty collection', '[]\n', ''],
    ['year filter', TALKS, 'sections:\n  talks: { since: 2030 }\n'],
    ['field filter', TALKS, 'sections:\n  talks:\n    where: { kind: contributed }\n'],
    ['visibility', TALKS.replace('kind: invited', 'kind: invited, visibility: private'), 'visibility: public\n'],
  ])('marks an empty section after %s', async (_name, yaml, config) => {
    const root = await project({ 'content/talks.yml': yaml, 'cv-tex/cv.yml': config })
    await generate(root)
    expect(await readGenerated(root, 'cv', 'profile')).toContain('\\vitaemptysection{talks}')
    expect(await readGenerated(root, 'cv', 'talks')).not.toContain('\\vitaentry')
  })

  it('writes escaped YAML title overrides and removes empty markers on the next build', async () => {
    const root = await project({
      'content/talks.yml': '[]\n',
      'cv-tex/cv.yml': 'sections:\n  talks:\n    title: "Research & teaching #1"\n',
    })
    await generate(root)
    expect(await readGenerated(root, 'cv', 'profile')).toContain('\\vitasectiontitle{talks}{Research \\& teaching \\#1}')
    await writeFile(join(root, 'content/talks.yml'), TALKS)
    await generate(root)
    expect(await readGenerated(root, 'cv', 'profile')).not.toContain('\\vitaemptysection{talks}')
  })
})

describe('generated files and template precedence', () => {
  it('removes obsolete section TeX without deleting latexmk auxiliary files', async () => {
    const root = await project()
    await generate(root)
    const out = join(root, 'cv-tex/generated/cv')
    await writeFile(join(out, 'cv.aux'), '% cached auxiliary file\n')
    await rm(join(root, 'content/talks.yml'))
    await generate(root)
    expect(existsSync(join(out, 'talks.tex'))).toBe(false)
    expect(await readFile(join(out, 'cv.aux'), 'utf8')).toBe('% cached auxiliary file\n')
    expect(await readGenerated(root, 'cv', 'profile')).toContain('\\vitaname{Jane Doe}')
  })

  it('replaces removed or deselected publications with empty output', async () => {
    const root = await project({
      'content/publications.bib': '@misc{test, author = {Doe, Jane}, title = {A publication}, year = {2025}}\n',
    })
    await generate(root)
    expect(await readGenerated(root, 'cv', 'publications')).toContain('\\vitabibgroup{published}{test}')
    await writeFile(join(root, 'cv-tex/cv.yml'), 'publications: { groups: [] }\n')
    await generate(root)
    expect(await readGenerated(root, 'cv', 'publications')).not.toContain('\\begin{refsection}')
    await rm(join(root, 'content/publications.bib'))
    await rm(join(root, 'cv-tex/cv.yml'))
    await generate(root)
    expect(await readGenerated(root, 'cv', 'publications')).not.toContain('test}')
    expect(await readGenerated(root, 'cv', 'publications')).not.toContain('\\nocite')
  })

  it('uses local generic templates only as a fallback, behind named templates', async () => {
    const root = await project({
      'content/outreach.yml': '- { date: 2025, title: An outreach event }\n',
      'schemas/outreach.ts': OUTREACH_SCHEMA,
      'cv-tex/templates/_generic.eta': '<% for (const item of it.entries) { %>GENERIC: <%~ it.rich(item.title) %><% } %>',
    })
    await generate(root)
    expect(await readGenerated(root, 'cv', 'outreach')).toContain('GENERIC: An outreach event')
    expect(await readGenerated(root, 'cv', 'talks')).not.toContain('GENERIC:')
    await writeFile(join(root, 'cv-tex/templates/outreach.eta'), 'NAMED\n')
    await generate(root)
    expect(await readGenerated(root, 'cv', 'outreach')).toContain('NAMED')
    expect(await readGenerated(root, 'cv', 'outreach')).not.toContain('GENERIC:')
  })

  it('escapes plain teaching roles, including TeX punctuation', async () => {
    const root = await project({
      'content/teaching.yml': '- { date: 2025, title: A course, role: "Course lead & examiner: 50% #1_a" }\n',
    })
    await generate(root)
    expect(await readGenerated(root, 'cv', 'teaching')).toContain('Course lead \\& examiner: 50\\% \\#1\\_a')
  })
})
