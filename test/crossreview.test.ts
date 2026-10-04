import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { escapeTex, escapeUrl } from '../src/tex/escape'
import { buildCv } from '../src/tex/build'

describe('cross-review: escaping fixes', () => {
  it('no longer mangles ISO dates and grant numbers', () => {
    expect(escapeTex('2024-03-15')).toBe('2024-03-15')
    expect(escapeTex('FWF P 12345-N35')).toBe('FWF P 12345-N35')
    expect(escapeTex('pages 201-240')).toBe('pages 201-240')
  })

  it('still renders a real en dash from formatted ranges', () => {
    expect(escapeTex('2019\u20132023')).toBe('2019--2023')
  })

  it('makes ampersands in URLs safe for \\href without changing the query', () => {
    // %26 would merge both parameters into one; hyperref turns \& back into &.
    expect(escapeUrl('https://e.org/s?a=1&b=2')).toBe('https://e.org/s?a=1\\&b=2')
  })

  it('does not double-encode an already-encoded URL', () => {
    expect(escapeUrl('https://e.org/a%20b')).toBe('https://e.org/a\\%20b')
  })

  it('escapes characters that would break the document', () => {
    expect(escapeUrl('https://e.org/a b#c%')).toBe('https://e.org/a\\%20b\\#c\\%25')
  })

  it('leaves characters LaTeX accepts in a URL alone', () => {
    expect(escapeUrl('https://doi.org/10.1000/a_b-c~d')).toContain('a_b-c')
  })
})

describe('cross-review: the document class an ejected copy must win', () => {
  const project = async (extra: Record<string, string> = {}) => {
    const root = await mkdtemp(join(tmpdir(), 'vitakit-cls-'))
    const files: Record<string, string> = {
      'content/profile.yml': 'name: Jane Doe\n',
      'content/talks.yml': '- { date: 2024, title: A talk }\n',
      'cv-tex/preamble.tex': '',
      'cv-tex/cv.tex': '\\documentclass{vitakit-cv}\n\\begin{document}\n\\vitasection{talks}\n\\end{document}\n',
      ...extra,
    }
    for (const [path, contents] of Object.entries(files)) {
      const full = join(root, path)
      await mkdir(join(full, '..'), { recursive: true })
      await writeFile(full, contents)
    }
    return root
  }

  it('writes the bundled class into the generated directory, not into cv-tex/', async () => {
    const root = await project()
    await buildCv({ rootDir: root, noPdf: true })
    expect(existsSync(join(root, 'cv-tex/generated/cv/vitakit-cv.cls'))).toBe(true)
    // cv-tex/ must keep holding only files the user wrote.
    expect(existsSync(join(root, 'cv-tex/vitakit-cv.cls'))).toBe(false)
  })

  it('does not shadow an ejected class', async () => {
    // With -outdir, TeX searches the output directory before the current one,
    // so a generated copy would win over the user's. It must not be written.
    const root = await project({ 'cv-tex/vitakit-cv.cls': '% mine\n' })
    await buildCv({ rootDir: root, noPdf: true })
    expect(existsSync(join(root, 'cv-tex/generated/cv/vitakit-cv.cls'))).toBe(false)
    expect(await readFile(join(root, 'cv-tex/vitakit-cv.cls'), 'utf8')).toBe('% mine\n')
  })

  it('removes a stale generated class once one is ejected', async () => {
    const root = await project()
    await buildCv({ rootDir: root, noPdf: true })
    await writeFile(join(root, 'cv-tex/vitakit-cv.cls'), '% mine\n')
    await buildCv({ rootDir: root, noPdf: true })
    expect(existsSync(join(root, 'cv-tex/generated/cv/vitakit-cv.cls'))).toBe(false)
  })
})
