import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverSections, loadSection } from '../src/sections'
import { importFailure, importProjectModule } from '../src/issues'
import { createRenderer } from '../src/render'
import { loadContent } from '../src/content'

const renderer = createRenderer()

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vitakit-'))
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, contents, 'utf8')
  }
  return root
}

const PROFILE = 'name: Jane Doe\nsummary: D\n'

describe('section discovery', () => {
  it('pairs a content file with its built-in schema', async () => {
    const root = await fixture({ 'content/talks.yml': '- { date: 2024, title: A talk }\n' })
    const [source] = await discoverSections(root)
    expect(source!.id).toBe('talks')
    expect(source!.schemaOrigin).toBe('built-in')
  })

  it('prefers a schema from the repo', async () => {
    const root = await fixture({
      'content/talks.yml': '- { date: 2024, headline: A talk }\n',
      'schemas/talks.ts': `import { section, dateRange, z } from '${join(process.cwd(), 'src/index.ts')}'\n`
        + `export default section({ date: dateRange, headline: z.string() })\n`,
    })
    const [source] = await discoverSections(root)
    expect(source!.schemaOrigin).toBe('repo')
    const entries = await loadSection(source!, { maxVisibility: 'public', renderer })
    expect(entries[0]!.headline).toBe('A talk')
  })

  it('fails with a starter snippet when no schema exists', async () => {
    const root = await fixture({ 'content/hobbies.yml': '- { date: 2024 }\n' })
    await expect(discoverSections(root)).rejects.toThrow(/create schemas\/hobbies\.ts/)
  })
})

describe('loadSection', () => {
  const load = async (yaml: string, maxVisibility: 'public' | 'cv' | 'private' = 'public') => {
    const root = await fixture({ 'content/talks.yml': yaml })
    const [source] = await discoverSections(root)
    return loadSection(source!, { maxVisibility, renderer })
  }

  it('sorts newest first and assigns stable ids', async () => {
    const entries = await load([
      '- { date: 2020, title: Older }',
      '- { date: 2024, title: Newer }',
    ].join('\n'))
    expect(entries.map(entry => entry.title)).toMatchObject([{ text: 'Newer' }, { text: 'Older' }])
    expect(entries.every(entry => typeof entry.id === 'string')).toBe(true)
  })

  it('renders math in rich fields', async () => {
    const [entry] = await load('- { date: 2024, title: Random $k$-ary trees }')
    expect((entry!.title as { html: string }).html).toContain('katex')
    expect((entry!.title as { text: string }).text).toBe('Random $k$-ary trees')
  })

  it('reports invalid TeX with the file and field', async () => {
    await expect(load('- { date: 2024, title: Broken $\\kk$ }'))
      .rejects.toThrow(/content\/talks\.yml.*0\.title.*Undefined control sequence/s)
  })

  it('filters by visibility', async () => {
    const yaml = [
      '- { date: 2024, title: Public }',
      '- { date: 2023, title: CV only, visibility: cv }',
      '- { date: 2022, title: Secret, visibility: private }',
    ].join('\n')
    expect(await load(yaml)).toHaveLength(1)
    expect(await load(yaml, 'cv')).toHaveLength(2)
    expect(await load(yaml, 'private')).toHaveLength(3)
  })

  it('treats an empty file as an empty section', async () => {
    expect(await load('')).toEqual([])
  })
})

describe('loadContent', () => {
  const base = {
    'content/profile.yml': PROFILE,
    'content/pages/index.md': '---\ntitle: Home\n---\n\nHello $x^2$.\n',
  }

  it('compiles a whole site', async () => {
    const root = await fixture({ ...base, 'content/talks.yml': '- { date: 2024, title: A talk }\n' })
    const content = await loadContent(root)
    expect(content.profile.name).toBe('Jane Doe')
    expect(content.profile.name).toBe('Jane Doe')
    expect(content.pages[0]!.route).toBe('/')
    expect(content.pages[0]!.bodyHtml).toContain('katex')
    expect(content.sections.talks).toHaveLength(1)
    expect(content.issues).toEqual([])
  })

  it('throws in strict mode and collects in lenient mode', async () => {
    const root = await fixture({ ...base, 'content/talks.yml': '- { date: 2024, titel: typo }\n' })
    await expect(loadContent(root, { strict: true })).rejects.toThrow(/titel/)

    const lenient = await loadContent(root, { strict: false })
    expect(lenient.issues).toHaveLength(1)
    expect(lenient.issues[0]!.where).toBe('content/talks.yml')
    // The rest of the site still loads, which is what keeps `nuxt dev` alive.
    expect(lenient.profile.name).toBe('Jane Doe')
    expect(lenient.pages).toHaveLength(1)
  })

  it('rewrites root-relative asset paths through the base URL', async () => {
    const root = await fixture({
      ...base,
      'content/pages/index.md': '---\ntitle: Home\n---\n\n![](/img/a.png) [x](/cv/) [y](https://e.org/z)\n',
    })
    const content = await loadContent(root, { baseURL: '/my-site/' })
    expect(content.pages[0]!.bodyHtml).toContain('src="/my-site/img/a.png"')
    expect(content.pages[0]!.bodyHtml).toContain('href="/my-site/cv/"')
    expect(content.pages[0]!.bodyHtml).toContain('href="https://e.org/z"')
  })

  it('keeps cv and private entries out of the website', async () => {
    const root = await fixture({
      ...base,
      'content/talks.yml': '- { date: 2024, title: Secret, visibility: private }\n',
    })
    const content = await loadContent(root)
    expect(content.sections.talks).toEqual([])
    expect(JSON.stringify(content)).not.toContain('Secret')
  })
})

describe('editing a schema during development', () => {
  it('picks up changes without restarting the process', async () => {
    const schemaPath = join(process.cwd(), 'src/index.ts')
    const root = await fixture({
        'content/profile.yml': PROFILE,
      'content/fancy.yml': '- { date: 2024, title: A thing }\n',
      'schemas/fancy.ts': `import { section, dateRange, z } from '${schemaPath}'\n`
        + `export default section({ date: dateRange, title: z.string() })\n`,
    })

    const before = await loadContent(root, { strict: false })
    expect(before.issues).toEqual([])

    // Add a field the content does not have yet: the edit must take effect.
    await writeFile(join(root, 'schemas/fancy.ts'),
      `import { section, dateRange, z } from '${schemaPath}'\n`
      + `export default section({ date: dateRange, title: z.string(), venue: z.string() })\n`)

    const after = await loadContent(root, { strict: false })
    expect(after.issues).toHaveLength(1)
    expect(after.issues[0]!.message).toMatch(/venue/)
  })
})

describe('importing a project schema', () => {
  it('names the Node version when TypeScript cannot be loaded', () => {
    // Node before 22.18 rejects `.ts` like any unknown extension.
    const error = Object.assign(new TypeError('Unknown file extension ".ts"'), { code: 'ERR_UNKNOWN_FILE_EXTENSION' })
    expect(importFailure(error, '22.17.1')).toBe('cannot load TypeScript on Node 22.17.1; vitakit needs Node 22.18 or newer')
  })

  it('names the file for any import error', async () => {
    const root = await fixture({ 'schemas/talks.ts': 'export default (\n' })
    await expect(importProjectModule(join(root, 'schemas/talks.ts'), 0, 'schemas/talks.ts'))
      .rejects.toThrow(/^schemas\/talks\.ts: /)
  })
})
