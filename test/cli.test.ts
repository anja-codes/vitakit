/** `vitakit add`, `vitakit list`, `vitakit eject`, and the commands they print. */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { addSection } from '../src/scaffold'
import { eject, listEjectable } from '../src/cli'
import { aligned, commands, detectPackageManager } from '../src/package-manager'
import { loadContent } from '../src/content'
import { PACKAGE_ENTRY, project, ROOT } from './support/project'

const PROFILE = { 'content/profile.yml': 'name: Jane Doe\n' }

/** Generated schemas import the package by name; tests import it from source. */
async function fromSource(path: string) {
  await writeFile(path, (await readFile(path, 'utf8')).replace(`'@anja.codes/vitakit'`, `'${PACKAGE_ENTRY}'`))
}

/** Run a bin script as the given package manager would. */
const bin = (name: string, args: string[], options: { cwd?: string, userAgent?: string } = {}) =>
  execFileSync(process.execPath, [join(ROOT, 'src/bin', `${name}.mjs`), ...args], {
    cwd: options.cwd,
    encoding: 'utf8',
    env: { ...process.env, npm_config_user_agent: options.userAgent ?? 'pnpm/10.29.1 npm/? node/?' },
  })

describe('listEjectable', () => {
  it('lists components, templates, schemas, the citation style and the class, with where each lands', async () => {
    const items = (await listEjectable()).map(({ name, kind, target }) => ({ name, kind, target }))
    for (const item of [
      { name: 'VitaSection', kind: 'component', target: join('app', 'components', 'VitaSection.vue') },
      { name: 'talks.eta', kind: 'template', target: join('cv-tex', 'templates', 'talks.eta') },
      { name: '_generic.eta', kind: 'template', target: join('cv-tex', 'templates', '_generic.eta') },
      { name: 'teaching', kind: 'schema', target: join('schemas', 'teaching.ts') },
      { name: 'publications', kind: 'schema', target: join('schemas', 'publications.ts') },
      { name: 'publications.csl', kind: 'style', target: join('content', 'publications.csl') },
      { name: 'vitakit-cv.cls', kind: 'class', target: join('cv-tex', 'vitakit-cv.cls') },
    ]) expect(items).toContainEqual(item)
  })
})

describe('eject', () => {
  it('copies a package file into the project, and never overwrites without force', async () => {
    const root = await project()
    const { path } = await eject('vitasection', root)
    expect(path).toBe(join(root, 'app/components/VitaSection.vue'))
    expect(await readFile(path, 'utf8')).toBe(await readFile(join(ROOT, 'src/runtime/components/VitaSection.vue'), 'utf8'))

    await writeFile(path, 'mine')
    await expect(eject('VitaSection', root)).rejects.toThrow(`${join('app', 'components', 'VitaSection.vue')} already exists; pass --force to overwrite`)
    await eject('VitaSection', root, { force: true })
    expect(await readFile(path, 'utf8')).not.toBe('mine')
  })

  it('lists the names when one is unknown', async () => {
    await expect(eject('VitaSektion', await project())).rejects.toThrow(/^unknown item "VitaSektion"\. Available: .*VitaSection/)
  })

  it('writes a schema that imports the package by name, defines the section, and stays editable', async () => {
    const root = await project({ ...PROFILE, 'content/supervision.yml': '- { date: 2025, student: A, title: Trees with $n$ nodes, degree: PhD, ongoing: true }\n' })
    const { path } = await eject('supervision', root)
    const source = await readFile(path, 'utf8')
    expect(source).toContain(`import { dateRange, institution, richText, section, text, z } from '@anja.codes/vitakit'`)
    expect(source).not.toMatch(/from '\.\.?\//)

    await fromSource(path)
    expect((await loadContent(root)).sections.supervision).toMatchObject([{ student: 'A', degree: 'PhD', ongoing: true }])

    await writeFile(path, (await readFile(path, 'utf8')).replace(/\n\s*degree: .*\n/, '\n'))
    await expect(loadContent(root)).rejects.toThrow(/Unrecognized key: "degree"/)
  })
})

describe('vitakit add', () => {
  it('drafts a schema from an existing content file, which then validates it', async () => {
    const root = await project({
      ...PROFILE,
      'content/outreach.yml': [
        '- { date: 2025-03-14, title: A $k$-ary talk, venue: BRG Viktring, audience: school, url: "https://e.org/a", online: true, people: 30 }',
        '- { date: 2024-11-02, title: Maths night, audience: public, people: 200 }',
      ].join('\n'),
    })
    expect(await addSection('outreach', root)).toEqual([
      { path: join('schemas', 'outreach.ts'), note: 'drafted from content/outreach.yml' },
      { path: join('app', 'components', 'OutreachSection.vue'), note: 'how the entries look' },
    ])

    const schema = await readFile(join(root, 'schemas/outreach.ts'), 'utf8')
    expect(schema).toContain(`import { dateRange, richText, section, text, url, z } from '@anja.codes/vitakit'`)
    expect(schema).toContain([
      '  date: dateRange,',
      '  title: richText,',
      '  venue: text.optional(),',
      `  audience: z.enum(['school', 'public']),`,
      '  url: url.optional(),',
      '  online: z.boolean().default(false),',
      '  people: z.number(),',
    ].join('\n'))

    await fromSource(join(root, 'schemas/outreach.ts'))
    expect((await loadContent(root)).sections.outreach).toHaveLength(2)
  })

  it('without a content file, writes a sample and a schema that work together', async () => {
    const root = await project(PROFILE)
    expect((await addSection('fancy-things', root, { component: false })).map(file => file.path)).toEqual([
      join('content', 'fancy-things.yml'),
      join('schemas', 'fancy-things.ts'),
    ])
    expect(existsSync(join(root, 'app/components/FancyThingsSection.vue'))).toBe(false)

    await fromSource(join(root, 'schemas/fancy-things.ts'))
    expect((await loadContent(root)).sections['fancy-things']).toHaveLength(1)
  })

  it.each([
    ['My Section', {}, /"My Section" must be lowercase kebab-case/],
    ['fancy', { 'schemas/fancy.ts': '' }, /schemas\/fancy\.ts already exists; delete it first/],
    ['fancy', { 'content/fancy.yml': 'a: 1\n' }, /content\/fancy\.yml must contain a list of entries/],
    ['fancy', { 'content/fancy.yml': '[]\n' }, /content\/fancy\.yml has no entries to infer a schema from/],
  ])('refuses %j with %j', async (name, files, message) => {
    await expect(addSection(name, await project(files))).rejects.toThrow(message)
  })

  it('points at eject, as the project runs commands, for a built-in section', async () => {
    const root = await project()
    vi.stubEnv('npm_config_user_agent', 'npm/11.19.0 node/v24.21.0')
    onTestFinished(() => { vi.unstubAllEnvs() })
    await expect(addSection('teaching', root)).rejects.toThrow(/"teaching" is a built-in section[\s\S]*npx vitakit eject teaching/)
  })

  it('recommends <VitaSection> when no component was written', async () => {
    const root = await project(PROFILE)
    const output = bin('vitakit', ['add', 'outreach', '--no-component'], { cwd: root })
    expect(output).toContain('Show it with <VitaSection id="outreach" /> on a page,\nor add \\vitasection{outreach} to cv-tex/cv.tex for the PDF.')
  })
})

describe('package manager', () => {
  it.each([
    ['npm/11.19.0 node/v24.21.0 darwin arm64 workspaces/false', 'npm'],
    ['pnpm/10.29.1 npm/? node/? darwin arm64', 'pnpm'],
    ['yarn/4.9.0 npm/? node/v22.18.0 darwin arm64', 'pnpm'],
  ])('is taken from the user agent %j, whatever the lockfile', async (userAgent, expected) => {
    expect(detectPackageManager(await project({ 'package-lock.json': '{}' }), { npm_config_user_agent: userAgent })).toBe(expected)
  })

  it.each([
    [{ 'package-lock.json': '{}' }, 'npm'],
    [{ 'pnpm-lock.yaml': '' }, 'pnpm'],
    [{ 'package-lock.json': '{}', 'pnpm-lock.yaml': '' }, 'pnpm'],
    [{}, 'pnpm'],
  ])('is taken from the lockfiles %j when a binary runs directly', async (files, expected) => {
    expect(detectPackageManager(await project(files), {})).toBe(expected)
  })

  it('decides how scripts and binaries are run', () => {
    expect([commands('pnpm').script('build:cv', 'cv --no-pdf'), commands('pnpm').bin('vitakit', 'list')])
      .toEqual(['pnpm build:cv cv --no-pdf', 'pnpm vitakit list'])
    expect([commands('npm').script('build:cv', 'cv --no-pdf'), commands('npm').script('check'), commands('npm').bin('vitakit', 'list')])
      .toEqual(['npm run build:cv -- cv --no-pdf', 'npm run check', 'npx vitakit list'])
  })

  it('aligns the comments in a list of commands', () => {
    expect(aligned([['npx a', '# one'], ['npx abc', '# two'], ['npx b']])).toBe('  npx a    # one\n  npx abc  # two\n  npx b')
  })

  it.each([
    ['vitakit', ['--help']],
    ['vitakit', ['add', '--help']],
    ['vitakit', ['eject', '--help']],
    ['vitakit-build-cv', ['--help']],
    ['vitakit-check', ['--help']],
  ])('is the one %s %j speaks', (name, args) => {
    const npm = bin(name, args, { userAgent: 'npm/11.19.0 node/v24.21.0' })
    expect(npm).toMatch(/npm run |npx /)
    expect(npm).not.toMatch(/pnpm/)

    const pnpm = bin(name, args)
    expect(pnpm).toMatch(/pnpm /)
    expect(pnpm).not.toMatch(/npm run |npx /)
  })
})
