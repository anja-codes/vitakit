import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cli } from './cli'

const example = join(process.cwd(), 'examples/scaffolded')
const temporary: string[] = []

/** A copy of the scaffolded example, without anything built or installed. */
async function project(changes: Record<string, string | ((source: string) => string)> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vitakit-cli-'))
  temporary.push(root)
  await cp(example, root, {
    recursive: true,
    filter: source => !/[/\\](node_modules|\.nuxt|\.output|generated)([/\\]|$)/.test(source) && !source.endsWith('.pdf'),
  })
  // The example's tsconfig extends .nuxt/, which is not there; the test
  // runner's TypeScript transform of schemas/*.ts would trip over it.
  await writeFile(join(root, 'tsconfig.json'), '{}\n')
  for (const [path, change] of Object.entries(changes)) {
    const file = join(root, path)
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, typeof change === 'string' ? change : change(await readFile(file, 'utf8')))
  }
  return root
}

afterAll(async () => {
  await Promise.all(temporary.map(root => rm(root, { recursive: true, force: true })))
})

describe('finding the project', () => {
  it('walks up from a nested directory, and accepts --root', async () => {
    const root = await project()
    const nested = await cli(['status'], { cwd: join(root, 'content/pages') })
    expect(nested.code, nested.err).toBe(0)
    const explicit = await cli(['status', '--root', root], { cwd: tmpdir() })
    expect(explicit.out).toBe(nested.out)
  })

  it('prefers the nearest package depending on vitakit over a workspace root', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'vitakit-ws-'))
    temporary.push(workspace)
    await writeFile(join(workspace, 'package.json'), JSON.stringify({ devDependencies: { '@anja.codes/vitakit': '*' } }))
    const site = join(workspace, 'site')
    await cp(await project(), site, { recursive: true })
    const result = await cli(['status', '--json'], { cwd: join(site, 'content') })
    expect(JSON.parse(result.out).root).toBe(site)
  })

  it('explains what to do outside a project, while help still works', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'vitakit-none-'))
    temporary.push(outside)
    const result = await cli(['status'], { cwd: outside })
    expect(result.code).toBe(1)
    expect(result.err).toMatch(/not inside a vitakit project.*--root/s)
    expect((await cli(['status', '--help'], { cwd: outside })).code).toBe(0)
    expect((await cli(['--version'], { cwd: outside })).out).toMatch(/^\d+\.\d+\.\d+\n$/)
  })
})

describe('usage errors', () => {
  it.each([
    [['frobnicate'], /unknown command "frobnicate"/],
    [['status', '--bogus'], /unknown option '--bogus'/],
    [['status', 'extra'], /unexpected argument "extra"/],
    [['explain'], /missing <name>/],
    [['list'], /"list" is now `pnpm vitakit eject --list`/],
    [['verify', '--out'], /--out/],
  ])('%s exits with 2', async (args, message) => {
    const result = await cli(args, { cwd: await project() })
    expect(result.code).toBe(2)
    expect(result.err).toMatch(message)
    expect(result.err).toMatch(/--help/)
  })

  it('lists the commands without arguments', async () => {
    const result = await cli([], { cwd: tmpdir() })
    expect(result.code).toBe(0)
    for (const command of ['status', 'explain', 'validate', 'pdf', 'verify', 'eject']) expect(result.out).toContain(`  ${command}`)
  })
})

describe('status', () => {
  it('shows sections with where they appear, pages and documents', async () => {
    const result = await cli(['status'], { cwd: await project() })
    expect(result.code).toBe(0)
    expect(result.out).toMatch(/talks\s+3 entries\s+\/cv\/ \/\s+cv/)
    expect(result.out).toMatch(/employment\s+3 entries: 2 public, 1 cv\s+\/cv\/\s+cv/)
    expect(result.out).toContain('/  /cv/  /publications/  /research/   (all in the menu)')
    expect(result.out).toContain('cv-tex/cv.tex → not built yet')
    expect(result.out).toContain('No problems.')
  })

  it('reports a section shown nowhere as a fact, and problems separately, without entry contents', async () => {
    const root = await project({
      'content/referees.yml': '- { date: 2024, title: Prof. Secret Referee, visibility: private }\n',
      'schemas/referees.ts': `import { section, dateRange, text } from '${join(process.cwd(), 'src/index.ts')}'\nexport default section({ date: dateRange, title: text })\n`,
      'content/talks.yml': (source: string) => source.replace('  title: ', '  titel: '),
      'content/grants.yml': '- { date: 2024, title: A grant }\n',
    })
    const result = await cli(['status'], { cwd: root })
    expect(result.code).toBe(0)
    expect(result.out).toMatch(/ referees\s+1 entry: 1 private\s+–\s+–/)
    expect(result.out).toMatch(/✖ talks\s+3 entries, has problems\s+\/cv\/ \/\s+cv/)
    expect(result.out).toMatch(/\? grants\s+no schema yet/)
    expect(result.out).toMatch(/content\/talks\.yml: entry 1, title: .*\(\+1 more\)/)
    expect(result.out).toContain('2 problems')
    expect(result.out).not.toContain('Secret Referee')

    const json = JSON.parse((await cli(['status', '--json'], { cwd: root })).out)
    expect(json.sections.find((section: { id: string }) => section.id === 'referees')).toMatchObject({
      schema: { origin: 'local', file: 'schemas/referees.ts' },
      counts: { public: 0, cv: 0, private: 1 },
      website: [],
      pdf: [],
    })
    expect(JSON.stringify(json)).not.toContain('Secret Referee')
  })

  it('marks sections chosen in code as unknown rather than absent', async () => {
    const root = await project({
      'app/pages/list.vue': '<template><div><VitaSection v-for="id in ids" :key="id" :id="id" /></div></template>\n',
    })
    const result = await cli(['status'], { cwd: root })
    expect(result.out).toContain('app/pages/list.vue:1  <VitaSection :id="id">')
  })
})

describe('validate', () => {
  it('passes the scaffold', async () => {
    const result = await cli(['validate'], { cwd: await project() })
    expect(result.out, result.err).toContain('✓ 5 sections, 3 publications, 4 pages, 1 PDF document: no problems')
    expect(result.code).toBe(0)
  })

  it('collects problems from content, pages, documents and templates', async () => {
    const root = await project({
      'content/talks.yml': (source: string) => source.replace('  title: ', '  titel: '),
      'cv-tex/cv.tex': (source: string) => source.replace('\\vitasection[Teaching]{teaching}', '\\vitasection[Teaching]{teaching}\n\\vitasection{outreach}'),
      'cv-tex/cv.yml': (source: string) => `${source}  teaching:\n    where: { kind: lecture }\n`,
      'app/pages/cv.vue': (source: string) => source.replace(
        '<VitaSection id="teaching" title="Teaching" />',
        '<VitaSection id="teaching" title="Teaching" :where="{ kind: \'x\' }" />\n    <VitaSection id="teachng" />',
      ),
      'cv-tex/templates/talk.eta': 'unused',
      'cv-tex/templates/education.eta': '<% for (const i of it.entries) { %><%~ it.text(i.institution) %><% } %>',
    })
    const result = await cli(['validate'], { cwd: root })
    expect(result.code).toBe(1)
    const out = result.out
    expect(out).toMatch(/content\/talks\.yml\n\s+entry 1, title: /)
    expect(out).toMatch(/cv-tex\/cv\.tex:\d+\n\s+no section called "outreach"/)
    expect(out).toMatch(/cv-tex\/cv\.yml\n\s+sections\.teaching\.where\.kind: unknown field/)
    expect(out).toMatch(/app\/pages\/cv\.vue:30\n\s+where\.kind: teaching has no field "kind"/)
    expect(out).toMatch(/app\/pages\/cv\.vue:31\n\s+no section called "teachng"/)
    expect(out).toMatch(/cv-tex\/templates\/talk\.eta\n\s+no section is called "talk".*did you mean talks\.eta/)
    expect(out).toMatch(/cv-tex\/templates\/education\.eta\n\s+template education\.eta: text expects text or a number.*\(in cv-tex\/cv\.tex\)/)
    expect(out).not.toContain(root)

    const talks = await cli(['validate', 'talks'], { cwd: root })
    expect(talks.code).toBe(1)
    expect(talks.out).toContain('content/talks.yml')
    expect(talks.out).not.toContain('outreach')

    const json = JSON.parse((await cli(['validate', '--json'], { cwd: root })).out)
    expect(json.ok).toBe(false)
    expect(json.problems.length).toBeGreaterThanOrEqual(7)

    expect((await cli(['validate', 'nope'], { cwd: root })).err).toMatch(/no section called nope/)
  })
})

describe('explain', () => {
  it('a section: fields, pages, and why entries are missing from a PDF', async () => {
    const result = await cli(['explain', 'talks'], { cwd: await project() })
    expect(result.code).toBe(0)
    expect(result.out).toMatch(/schema\s+built-in/)
    expect(result.out).toMatch(/kind\s+one of invited, contributed, seminar, poster, outreach, optional/)
    expect(result.out).toMatch(/website\s+\/cv\/\s+app\/pages\/cv\.vue:\d+\s+<VitaSection title="Talks">/)
    expect(result.out).toMatch(/pdf\s+cv\s+cv-tex\/cv\.tex:\d+\s+\\vitasection\[Selected talks\]\{talks\}/)
    expect(result.out).toContain('template: vitakit\'s talks.eta')
    expect(result.out).toContain('1 of 3 entries (where kind: invited −2)')
  })

  it('a section without schema gets a starter', async () => {
    const result = await cli(['explain', 'grants'], { cwd: await project({ 'content/grants.yml': '- { date: 2024, title: A }\n' }) })
    expect(result.out).toMatch(/schema\s+none yet/)
    expect(result.out).toContain('export default section({')
    expect(result.out).not.toContain('Problems')
  })

  it('a document and a route', async () => {
    const root = await project()
    const document = await cli(['explain', 'cv'], { cwd: root })
    expect(document.out).toMatch(/includes\s+line \d+\s+employment\s+Employment\s+3 of 3 entries/)
    expect(document.out).toMatch(/talks\s+Selected talks\s+1 of 3 entries/)
    const route = await cli(['explain', '/research'], { cwd: root })
    expect(route.out).toMatch(/page\s+app\/pages\/\[\.\.\.slug\]\.vue \(shows Markdown pages\)/)
    expect(route.out).toMatch(/menu\s+in the menu/)
  })

  it('a copied document that still names the original', async () => {
    const root = await project()
    await cp(join(root, 'cv-tex/cv.tex'), join(root, 'cv-tex/application-eth.tex'))
    const result = await cli(['explain', 'application-eth'], { cwd: root })
    expect(result.out).toMatch(/settings\s+none \(no cv-tex\/application-eth\.yml\) · visibility: cv/)
    expect(result.out).toMatch(/cv-tex\/application-eth\.tex:\d+\n\s+\\vitadocument\{cv\} does not match the file name; expected \\vitadocument\{application-eth\}/)
    expect((await cli(['validate'], { cwd: root })).code).toBe(1)
  })

  it('asks which one when a section and a document share a name', async () => {
    const root = await project({ 'content/cv.yml': '[]\n', 'schemas/cv.ts': `import { section, text } from '${join(process.cwd(), 'src/index.ts')}'\nexport default section({ title: text })\n` })
    const result = await cli(['explain', 'cv'], { cwd: root })
    expect(result.code).toBe(2)
    expect(result.err).toMatch(/both a section and a PDF document/)
    expect((await cli(['explain', 'cv', '--document'], { cwd: root })).out).toContain('includes')
  })

  it('names what exists when nothing matches', async () => {
    const result = await cli(['explain', 'nope'], { cwd: await project() })
    expect(result.code).toBe(1)
    expect(result.err).toMatch(/nothing called "nope"; sections: education, .*; documents: cv/)
  })
})

describe('pdf and verify', () => {
  it('pdf --tex-only writes the generated files and says so', async () => {
    const root = await project()
    const result = await cli(['pdf', '--tex-only'], { cwd: root })
    expect(result.code, result.err).toBe(0)
    expect(result.out).toMatch(/^cv: wrote cv-tex\/generated\/cv\/ \(\d+ files\)\n$/)
    expect(await readdir(join(root, 'cv-tex/generated/cv'))).toContain('talks.tex')
    expect((await cli(['pdf', 'nope', '--tex-only'], { cwd: root })).err).toMatch(/no document matched nope/)
  })

  it('verify explains a missing build', async () => {
    const result = await cli(['verify'], { cwd: await project() })
    expect(result.code).toBe(1)
    expect(result.err).toMatch(/no generated site at .*build it first with `pnpm generate`/)
  })
})

describe('eject', () => {
  let root: string
  beforeAll(async () => { root = await project() })

  it('lists what can be taken over and what it affects', async () => {
    const result = await cli(['eject', '--list'], { cwd: root })
    expect(result.out).toMatch(/VitaSection\s+→ app\/components\/VitaSection\.vue\s+every section on every page/)
    expect(result.out).toMatch(/vitakit-cv\.cls\s+→ cv-tex\/vitakit-cv\.cls/)
  })

  it('writes nothing without confirmation, or on a dry run', async () => {
    const script = await cli(['eject', 'VitaSection'], { cwd: root })
    expect(script.code).toBe(1)
    expect(script.err).toMatch(/nothing written: confirm with --yes/)
    expect((await cli(['eject', 'VitaSection', '--dry-run'], { cwd: root })).out).toContain('+ app/components/VitaSection.vue')
    const declined = await cli(['eject', 'VitaSection'], { cwd: root, answers: ['n'] })
    expect(declined.out).toContain('Cancelled; nothing was written.')
    expect(existsSync(join(root, 'app/components/VitaSection.vue'))).toBe(false)
  })

  it('copies, refuses to overwrite, and replaces with a backup only with --force', async () => {
    expect((await cli(['eject', 'VitaSection'], { cwd: root, answers: [''] })).code).toBe(0)
    const path = join(root, 'app/components/VitaSection.vue')
    await writeFile(path, 'mine')
    const again = await cli(['eject', 'VitaSection', '--yes'], { cwd: root })
    expect(again.code).toBe(1)
    expect(again.err).toMatch(/already yours.*--force/)
    expect((await cli(['eject', 'vitasection', '--yes', '--force'], { cwd: root })).code).toBe(0)
    expect(await readFile(`${path}.backup`, 'utf8')).toBe('mine')
    expect(await readFile(path, 'utf8')).toContain('vita-section')
  })

  it('points section-specific requests to customize', async () => {
    const result = await cli(['eject', 'talks.eta'], { cwd: root })
    expect(result.err).toMatch(/cannot be ejected.*customize talks/s)
  })
})
