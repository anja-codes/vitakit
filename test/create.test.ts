import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { parse as parseYaml } from 'yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { loadContent } from '../src/content'

const creator = fileURLToPath(new URL('../create/index.mjs', import.meta.url))
const scaffoldUrl = new URL('../create/scaffold.mjs', import.meta.url).href
const { detectPackageManager } = await import(scaffoldUrl) as { detectPackageManager: (userAgent?: string) => string }
const defaults = {
  name: 'Your Name',
  title: 'Postdoctoral Researcher',
  affiliation: 'Department of Mathematics, University of Graz',
  email: 'you@example.org',
  slug: 'my-site',
  deployment: 'github-pages',
}
const temporary: string[] = []

async function project() {
  const root = await mkdtemp(join(tmpdir(), 'vitakit-create-'))
  temporary.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

// Run the creator's import-safe implementation in native Node, just as the
// published CLI does, without a bundler transforming it or an interactive TTY.
function scaffold(root: string, answers: typeof defaults & { packageManager?: string } = defaults) {
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { scaffold } from ${JSON.stringify(scaffoldUrl)}
    await scaffold(process.argv[1], JSON.parse(process.argv[2]))
  `, root, JSON.stringify(answers)])
}

describe('published creator personalisation', () => {
  it.each([
    'Research Fellow: Mathematics',
    'Researcher #1',
    'Dr "Zoë" O\'Connor \\ Universität 東京 🧮',
    'First line\nsecond: line # not a comment\r\nlast line\twith a tab',
    '---\nname: not an injected field\n---',
    'null',
    'true',
    '123',
    '[a, b]',
    '&anchor *alias',
    '',
    '  leading and trailing spaces  ',
    '$& $` $\' __TITLE__ __YAML_EMAIL__',
  ])('round-trips YAML scalars and front matter: %j', async (value) => {
    const root = await project()
    const answers = { ...defaults, name: value, title: value, affiliation: value, email: value }
    scaffold(root, answers)

    const profile = parseYaml(await readFile(join(root, 'content/profile.yml'), 'utf8'))
    expect(profile.name).toBe(value)
    expect(profile.title).toBe(value)
    expect(profile.affiliation).toEqual({ name: value })
    expect(profile.email).toBe(value)
    expect(profile.summary).toBe(`${value} at ${value}, working on your research area.`)

    // The actual content loader uses gray-matter for Markdown front matter,
    // not the YAML parser used for standalone .yml files.
    const home = matter(await readFile(join(root, 'content/pages/index.md'), 'utf8'))
    expect(home.data).toEqual({ title: value, order: 0 })
    expect(home.content).toContain('Replace this page with a few sentences about yourself:')
  })

  it('keeps ordinary Markdown and TeX substitutions raw and literal', async () => {
    const root = await project()
    const answers = {
      ...defaults,
      name: 'Zoë "A" \\ $& $` $\' __TITLE__',
      title: 'Researcher #1: Mathematics',
      affiliation: 'A\nB __YAML_NAME__',
    }
    // Additional files exercise the same recursive substitution pass as the
    // copied template. A global YAML-quoting fix must not quote prose/TeX.
    for (const file of ['letter.md', 'letter.tex']) {
      await writeFile(join(root, file), '__NAME__\n__TITLE__\n__AFFILIATION__\n__EMAIL__\n__SLUG__\n')
    }
    scaffold(root, answers)
    for (const file of ['letter.md', 'letter.tex']) {
      expect(await readFile(join(root, file), 'utf8')).toBe(
        `${answers.name}\n${answers.title}\n${answers.affiliation}\n${answers.email}\n${answers.slug}\n`,
      )
    }
  })

  it('loads a personalised scaffold through the real content pipeline', async () => {
    const root = await project()
    const answers = {
      ...defaults,
      name: 'Dr Zoë: Researcher #1',
      title: 'Research Fellow: Mathematics',
      affiliation: 'University #1: Department of Mathematics',
    }
    scaffold(root, answers)
    const content = await loadContent(root, { strict: true })
    expect(content.issues).toEqual([])
    expect(content.profile.name).toBe(answers.name)
    expect(content.profile.title).toBe(answers.title)
    expect(content.profile.affiliation).toEqual({ name: answers.affiliation })
    expect(content.profile.email).toBe(answers.email)
    expect(content.profile.summary).toBe(`${answers.title} at ${answers.affiliation}, working on your research area.`)
    expect(content.pages.find(page => page.route === '/')?.title).toBe(answers.name)
  })

  it('still scaffolds defaults through the CLI entry point', async () => {
    const root = await project()
    const target = join(root, 'my-site')
    const output = execFileSync(process.execPath, [creator, target], {
      encoding: 'utf8',
      env: { ...process.env, VITAKIT_CREATE_DEFAULTS: '1', npm_config_user_agent: 'pnpm/10.29.1 npm/? node/v22.18.0' },
    })
    expect(output).toContain(`Created ${target}`)
    expect(output).toContain('pnpm install')
    expect(output).toContain('pnpm dev')
    const profile = parseYaml(await readFile(join(target, 'content/profile.yml'), 'utf8'))
    expect(profile.name).toBe(defaults.name)
    expect(profile.title).toBe(defaults.title)
    expect(JSON.parse(await readFile(join(target, 'package.json'), 'utf8')).name).toBe('my-site')
    expect(await readFile(join(target, '.gitignore'), 'utf8')).toContain('node_modules')
    expect(await readFile(join(target, '.github/workflows/deploy.yml'), 'utf8')).toContain('GitHub Pages')
  })
})

/** Every file of a scaffolded project, path relative to its root. */
async function files(root: string, dir = root): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name)
    if (item.isDirectory()) for (const entry of await files(root, path)) result.set(...entry)
    else result.set(path.slice(root.length + 1), await readFile(path, 'utf8'))
  }
  return result
}

describe('package manager', () => {
  it.each([
    ['npm/11.6.0 node/v22.18.0 darwin arm64 workspaces/false', 'npm'],
    ['pnpm/10.29.1 npm/? node/v22.18.0 darwin arm64', 'pnpm'],
    ['yarn/4.9.0 npm/? node/v22.18.0 darwin arm64', 'pnpm'],
    ['bun/1.2.0 npm/? node/v22.18.0 darwin arm64', 'pnpm'],
    ['', 'pnpm'],
    [undefined, 'pnpm'],
  ])('detects %j as %s', (userAgent, expected) => {
    expect(detectPackageManager(userAgent)).toBe(expected)
  })

  it.each(['github-pages', 'cloudflare', 'rsync', 'none'])('writes an npm project without a trace of pnpm (%s)', async (deployment) => {
    const root = await project()
    scaffold(root, { ...defaults, deployment, packageManager: 'npm' })
    const written = await files(root)

    for (const [path, contents] of written) {
      expect(contents, path).not.toMatch(/pnpm/)
    }
    const pkg = JSON.parse(written.get('package.json')!)
    expect(pkg.packageManager).toBeUndefined()
    expect(pkg.scripts.check).toBe('npm run typecheck && npm run generate && npm run check:static')
  })

  it('translates the workflows to npm', async () => {
    const root = await project()
    scaffold(root, { ...defaults, packageManager: 'npm' })
    const deploy = await readFile(join(root, '.github/workflows/deploy.yml'), 'utf8')
    const cv = await readFile(join(root, '.github/workflows/cv.yml'), 'utf8')

    expect(deploy).toContain('cache: npm')
    expect(deploy).toContain('- run: npm ci')
    expect(deploy).toContain('- run: npm run check')
    // the step after the removed pnpm setup follows checkout directly
    expect(deploy).toMatch(/- uses: actions\/checkout@v\d+\n\s+- uses: actions\/setup-node@v\d+/)
    expect(cv).toContain('- run: npm run build:cv -- --no-pdf')
    expect(parseYaml(deploy).jobs.build.steps).toHaveLength(5)
  })

  it('translates the instructions in the project itself', async () => {
    const root = await project()
    scaffold(root, { ...defaults, packageManager: 'npm' })
    expect(await readFile(join(root, 'content/pages/cv.md'), 'utf8')).toContain('`npm run build:cv`')
    expect(await readFile(join(root, 'content/pages/index.md'), 'utf8')).toContain('`npx vitakit add outreach`')
    expect(await readFile(join(root, 'cv-tex/cv.tex'), 'utf8')).toContain('npx vitakit eject vitakit-cv.cls')
  })

  it('leaves a pnpm project exactly as the template is', async () => {
    const [implicit, explicit] = [await project(), await project()]
    scaffold(implicit)
    scaffold(explicit, { ...defaults, packageManager: 'pnpm' })
    expect(await files(explicit)).toEqual(await files(implicit))
    expect(JSON.parse(await readFile(join(implicit, 'package.json'), 'utf8')).packageManager).toMatch(/^pnpm@/)
  })

  it('prints npm commands when started by npm', async () => {
    const root = await project()
    const output = execFileSync(process.execPath, [creator, join(root, 'my-site')], {
      encoding: 'utf8',
      env: { ...process.env, VITAKIT_CREATE_DEFAULTS: '1', npm_config_user_agent: 'npm/11.6.0 node/v22.18.0' },
    })
    expect(output).toContain('npm install')
    expect(output).toContain('npm run dev')
    expect(output).toContain('npm run check')
    expect(output).not.toMatch(/pnpm/)
  })

  it('falls back to pnpm when run directly, without a package manager', async () => {
    const root = await project()
    const target = join(root, 'my-site')
    const { npm_config_user_agent: _, ...env } = process.env
    const output = execFileSync(process.execPath, [creator, target], {
      encoding: 'utf8',
      env: { ...env, VITAKIT_CREATE_DEFAULTS: '1' },
    })
    expect(output).toContain('pnpm install')
    expect(JSON.parse(await readFile(join(target, 'package.json'), 'utf8')).packageManager).toMatch(/^pnpm@/)
  })
})
