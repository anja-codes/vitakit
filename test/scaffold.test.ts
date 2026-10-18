import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addSection } from '../src/scaffold'
import { eject } from '../src/cli'
import { loadContent } from '../src/content'

async function project(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vitakit-add-'))
  for (const [path, contents] of Object.entries({
    'content/profile.yml': 'name: Jane Doe\n',
    ...files,
  })) {
    const full = join(root, path)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, contents)
  }
  return root
}

/** The drafted schema imports from the package by name; rewrite it for tests. */
async function useLocalPackage(root: string, id: string): Promise<void> {
  const path = join(root, 'schemas', `${id}.ts`)
  const source = await readFile(path, 'utf8')
  await writeFile(path, source.replace("'@anja.codes/vitakit'", `'${join(process.cwd(), 'src/index.ts')}'`))
}

describe('vitakit add', () => {
  it('drafts a schema from an existing YAML file that actually validates it', async () => {
    const root = await project({
      'content/outreach.yml': [
        '- { date: 2025-03-14, title: A $k$-ary talk, venue: BRG Viktring, audience: school, url: "https://e.org/a" }',
        '- { date: 2024-11-02, title: Maths night, audience: public }',
        '',
      ].join('\n'),
    })

    const written = await addSection('outreach', root)
    expect(written.map(file => file.path)).toEqual([
      join('schemas', 'outreach.ts'),
      join('app', 'components', 'OutreachSection.vue'),
    ])

    const schema = await readFile(join(root, 'schemas/outreach.ts'), 'utf8')
    expect(schema).toContain('date: dateRange')
    expect(schema).toContain('title: richText')
    expect(schema).toContain('venue: text.optional()')      // absent from one entry
    expect(schema).toContain("audience: z.enum(['school', 'public'])")
    expect(schema).toContain('url: url.optional()')
    // No dead imports: `richText` must not drag in `text` on its own.
    expect(schema).toMatch(/^import \{ dateRange, richText, section, text, url, z \}/m)

    await useLocalPackage(root, 'outreach')
    const content = await loadContent(root, { strict: true })
    expect(content.sections.outreach).toHaveLength(2)
    expect((content.sections.outreach![0]!.title as { html: string }).html).toContain('katex')
  })

  it('creates both files when there is no YAML file yet, and they work together', async () => {
    const root = await project()
    const written = await addSection('fancy', root, { component: false })
    expect(written.map(file => file.path)).toEqual([
      join('content', 'fancy.yml'),
      join('schemas', 'fancy.ts'),
    ])

    await useLocalPackage(root, 'fancy')
    const content = await loadContent(root, { strict: true })
    expect(content.sections.fancy).toHaveLength(1)
  })

  it('scaffolds a component only when asked', async () => {
    const root = await project()
    await addSection('a-thing', root, { component: false })
    expect(existsSync(join(root, 'app/components/AThingSection.vue'))).toBe(false)

    const other = await project()
    await addSection('a-thing', other)
    expect(existsSync(join(other, 'app/components/AThingSection.vue'))).toBe(true)
  })

  it('recommends the generic component when no component was created', async () => {
    const root = await project()
    const output = execFileSync(process.execPath, [join(process.cwd(), 'src/bin/vitakit.mjs'), 'add', 'outreach', '--no-component'], {
      cwd: root,
      encoding: 'utf8',
    })
    expect(output).toContain('<VitaSection id="outreach" />')
    expect(output).not.toContain('<OutreachSection />')
    expect(output).toContain('\\vitasection{outreach}')
    expect(existsSync(join(root, 'app/components/OutreachSection.vue'))).toBe(false)
  })

  it('refuses to overwrite an existing schema', async () => {
    const root = await project()
    await addSection('fancy', root, { component: false })
    await expect(addSection('fancy', root)).rejects.toThrow(/already exists/)
  })

  it('explains that a built-in section needs no scaffolding', async () => {
    const root = await project()
    await expect(addSection('teaching', root)).rejects.toThrow(/built-in section/)
  })

  it('rejects a name that could not become a file', async () => {
    const root = await project()
    await expect(addSection('My Section', root)).rejects.toThrow(/kebab-case/)
  })
})

describe('ejecting a built-in schema', () => {
  it('produces a file that validates the section it came from', async () => {
    const root = await project({
      'content/supervision.yml': [
        '- { date: 2025, student: A. Student, title: Trees with $n$ nodes, ongoing: true }',
        '',
      ].join('\n'),
    })

    const { path } = await eject('supervision', root)
    const source = await readFile(path, 'utf8')
    // The package builds against its own primitives; a project imports by name.
    expect(source).toContain("from '@anja.codes/vitakit'")
    expect(source).not.toContain("'../primitives'")
    expect(source).toContain('ongoing:')

    await useLocalPackage(root, 'supervision')
    const content = await loadContent(root, { strict: true })
    expect(content.sections.supervision).toHaveLength(1)
    expect(content.sections.supervision![0]!.ongoing).toBe(true)
  })

  it('stays editable: a removed field becomes invalid content', async () => {
    const root = await project({
      'content/supervision.yml': '- { date: 2025, student: A, title: T, degree: PhD }\n',
    })
    const { path } = await eject('supervision', root)
    await useLocalPackage(root, 'supervision')
    // Drop `degree` from the ejected schema; the content must now fail.
    const source = await readFile(path, 'utf8')
    await writeFile(path, source.replace(/\s*degree: .*\n/, '\n'))

    await expect(loadContent(root, { strict: true })).rejects.toThrow(/degree/)
  })

  it('points at eject when add is used on a built-in section', async () => {
    const root = await project()
    await expect(addSection('supervision', root)).rejects.toThrow(/pnpm vitakit eject supervision/)
  })
})
