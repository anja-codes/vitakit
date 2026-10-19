/** `pnpm create @anja.codes/vitakit`: the prompts, and the project it writes. */
import { execFileSync } from 'node:child_process'
import { cp, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import { loadContent } from '../src/content'
import { project, ROOT } from './support/project'
import {
  chooseDeployment, DEFAULTS, DEPLOYMENTS, deploymentHelp, deploymentInstructions, detectPackageManager, scaffold, type Answers,
} from './support/creator'

const KEYS = Object.keys(DEPLOYMENTS)

/** A scaffolded project. */
async function created(answers: Partial<Answers> = {}) {
  const root = await project()
  await scaffold(root, { ...DEFAULTS, ...answers })
  return root
}

/** Every file below `root`, by relative path. */
async function files(root: string, dir = root): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name)
    if (item.isDirectory()) for (const [name, contents] of await files(root, path)) result.set(name, contents)
    else result.set(path.slice(root.length + 1), await readFile(path, 'utf8'))
  }
  return result
}

/** The creator as `pnpm create` runs it, without a terminal. */
const creator = (args: string[], options: { cwd?: string, userAgent?: string } = {}) => {
  const { npm_config_user_agent: _, ...env } = process.env
  return execFileSync(process.execPath, [join(ROOT, 'create/index.mjs'), ...args], {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...env, VITAKIT_CREATE_DEFAULTS: '1', ...options.userAgent ? { npm_config_user_agent: options.userAgent } : {} },
  })
}

describe('choosing a deployment', () => {
  /** Answer the prompt with `answers`, one per question. */
  async function choose(...answers: string[]) {
    const output: string[] = []
    const prompts: string[] = []
    const selected = await chooseDeployment(async (question, fallback) => {
      prompts.push(question)
      if (!answers.length) throw new Error('more questions than answers')
      return answers.shift() || fallback
    }, message => output.push(message))
    return { selected, output, prompts }
  }

  it('lists every target by number, and takes the first by default', async () => {
    const { selected, output } = await choose('')
    expect(selected).toBe('github-pages')
    expect(output.slice(1, KEYS.length + 1)).toEqual(KEYS.map((key, index) => `  ${index + 1}. ${DEPLOYMENTS[key]!.label}`))
  })

  it.each(KEYS.map((key, index) => [String(index + 1), key]))('selects %s as %s', async (answer, key) => {
    expect((await choose(answer)).selected).toBe(key)
  })

  it.each(['?', 'h', 'help', 'HELP'])('shows the comparison for %j, then asks again', async (answer) => {
    const { selected, output, prompts } = await choose(answer, '2')
    expect(selected).toBe(KEYS[1])
    expect(prompts).toHaveLength(2)
    expect(output).toContain(`\n${deploymentHelp()}\n`)
  })

  it('asks again on anything but a listed number', async () => {
    const invalid = ['bogus', '0', '-1', String(KEYS.length + 1), '1.5', '1e0']
    const { selected, output } = await choose(...invalid, '2')
    expect(selected).toBe(KEYS[1])
    expect(output.filter(message => message === `Please choose a number from 1 to ${KEYS.length}, or ? for help.`)).toHaveLength(invalid.length)
  })
})

describe('deployment texts', () => {
  const texts = () => [deploymentHelp(), ...KEYS.flatMap(key => [deploymentInstructions(key), deploymentInstructions(key, 'npm')])]

  it('fit an 80-column terminal', () => {
    for (const line of texts().join('\n').split('\n')) expect(line.length, line).toBeLessThanOrEqual(80)
  })

  it('compare targets in the help, and leave the setup steps for after the choice', () => {
    const help = deploymentHelp()
    for (const { label, details, setup } of Object.values(DEPLOYMENTS)) {
      expect(help).toContain(label)
      for (const name of Object.keys(details)) expect(help).toContain(`   ${name}: `)
      expect(help).not.toContain(setup[0]!.split(/\s+/).slice(0, 6).join(' '))
    }
  })

  it('number the setup steps, with sublists indented below their step', () => {
    expect(deploymentInstructions('cloudflare-workers')).toBe([
      'Deployment: Cloudflare Workers (recommended)',
      '  1. Enable a workers.dev subdomain in your Cloudflare account.',
      '  2. Set the Worker name in wrangler.json.',
      '  3. Add GitHub Actions repository secrets:',
      '     - CLOUDFLARE_ACCOUNT_ID',
      '     - CLOUDFLARE_API_TOKEN (Workers Scripts: Edit permission)',
      '  4. Commit pnpm-lock.yaml and push to main.',
    ].join('\n'))
  })

  it('speak npm for an npm project', () => {
    for (const key of KEYS) expect(deploymentInstructions(key, 'npm')).not.toContain('pnpm')
    expect(deploymentInstructions('github-pages', 'npm')).toContain('Commit package-lock.json')
    expect(deploymentInstructions('none', 'npm')).toContain('npm run check')
  })
})

describe('the creator command', () => {
  it.each(['--help', '-h', '--deployment-help'])('%s explains the targets, in npm\'s words, and writes nothing', async (flag) => {
    const cwd = await project({ 'keep.txt': 'untouched' })
    const output = creator(['would-be-site', flag], { cwd, userAgent: 'npm/11.6.0 node/v22.18.0' })
    expect(output).toContain(deploymentHelp())
    expect(output).not.toContain('pnpm')
    expect(await readdir(cwd)).toEqual(['keep.txt'])
  })

  it('creates a pnpm project and says what to do next, when run without a package manager', async () => {
    const target = join(await project(), 'my-site')
    const output = creator([target])
    expect(output).toContain(`Created ${target}`)
    expect(output).toMatch(/pnpm install\n {2}pnpm dev +# http:\/\/localhost:3000/)
    expect(output).toContain(deploymentInstructions('github-pages'))
    expect(JSON.parse(await readFile(join(target, 'package.json'), 'utf8'))).toMatchObject({ name: 'my-site', packageManager: expect.stringMatching(/^pnpm@/) })
  })

  it('creates an npm project when npm runs it', async () => {
    const target = join(await project(), 'my-site')
    const output = creator([target], { userAgent: 'npm/11.6.0 node/v22.18.0' })
    expect(output).toMatch(/npm install\n {2}npm run dev/)
    expect(output).not.toContain('pnpm')
  })

  it('refuses a directory that is not empty', async () => {
    const cwd = await project({ 'my-site/keep.txt': '' })
    expect(() => creator(['my-site'], { cwd })).toThrow(/my-site already exists and is not empty/)
  })

  it('ships every module it imports', async () => {
    const manifest = JSON.parse(await readFile(join(ROOT, 'create/package.json'), 'utf8'))
    for (const file of ['index.mjs', 'scaffold.mjs', 'deployments.mjs']) {
      const imports = [...(await readFile(join(ROOT, 'create', file), 'utf8')).matchAll(/from '\.\/([\w.-]+)'/g)].map(match => match[1])
      for (const imported of imports) expect(manifest.files).toContain(imported)
    }
  })
})

describe('the project', () => {
  it.each(KEYS)('for %s, has exactly the workflows and configuration of that target', async (deployment) => {
    const written = [...(await files(await created({ deployment }))).keys()]
    const config = written.filter(path => /^\.(github|forgejo)\/workflows\/|^(\.gitlab-ci\.yml|wrangler\.json)$/.test(path))
    expect(config.sort()).toEqual([...DEPLOYMENTS[deployment]!.files].sort())
    expect(written.filter(path => /(^|\/)_(github|forgejo)\/|\.template$|\.DS_Store$/.test(path))).toEqual([])
  })

  it.each(['missing', 'toString'])('is not created for an unknown target %j', async (deployment) => {
    const root = await project()
    await expect(scaffold(join(root, 'site'), { ...DEFAULTS, deployment })).rejects.toThrow('Unknown deployment target')
    expect(await readdir(root)).toEqual([])
  })

  it('does not copy Finder metadata from a template checkout', async () => {
    const root = await project()
    await cp(join(ROOT, 'create'), join(root, 'create'), { recursive: true })
    await writeFile(join(root, 'create/template/content/.DS_Store'), '')
    const { scaffold: fromCopy } = await import(join(root, 'create/scaffold.mjs')) as { scaffold: typeof scaffold }
    await fromCopy(join(root, 'site'), DEFAULTS)
    expect(await readdir(join(root, 'site/content'))).not.toContain('.DS_Store')
  })

  it.each([
    'Research Fellow: Mathematics #1',
    'Dr "Zoë" O\'Connor \\ Universität 東京 🧮',
    'First line\nsecond: line # not a comment\r\nlast line\twith a tab',
    '---\nname: not an injected field\n---',
    'null', 'true', '123', '[a, b]', '&anchor *alias',
    '',
    '  leading and trailing spaces  ',
    '$& $` $\' __TITLE__ __YAML_EMAIL__',
  ])('writes %j into YAML and front matter as it was typed', async (value) => {
    const root = await created({ name: value, title: value, affiliation: value, email: value })
    expect(parseYaml(await readFile(join(root, 'content/profile.yml'), 'utf8'))).toMatchObject({
      name: value, title: value, affiliation: { name: value }, email: value, summary: `${value} at ${value}, working on your research area.`,
    })
    expect(matter(await readFile(join(root, 'content/pages/index.md'), 'utf8')).data).toEqual({ title: value, order: 0 })
  })

  it('writes answers into prose and TeX unquoted', async () => {
    const root = await project({ 'letter.tex': '__NAME__ / __TITLE__ / __SLUG__\n' })
    await scaffold(root, { ...DEFAULTS, name: 'Zoë "A" $& __TITLE__', title: 'A\nB' })
    expect(await readFile(join(root, 'letter.tex'), 'utf8')).toBe('Zoë "A" $& __TITLE__ / A\nB / my-site\n')
  })

  it('is valid content, whatever the answers', async () => {
    const answers = { name: 'Dr Zoë: Researcher #1', title: 'Research Fellow: Mathematics', affiliation: 'University #1: Mathematics' }
    const content = await loadContent(await created(answers))
    expect(content.profile).toMatchObject({ name: answers.name, title: answers.title, affiliation: { name: answers.affiliation } })
    expect(content.pages.find(page => page.route === '/')!.title).toBe(answers.name)
  })
})

describe('the project for npm', () => {
  it.each(KEYS)('for %s, has no trace of pnpm', async (deployment) => {
    const written = await files(await created({ deployment, packageManager: 'npm' }))
    for (const [path, contents] of written) expect(contents, path).not.toMatch(/pnpm/)
    const pkg = JSON.parse(written.get('package.json')!)
    expect(pkg.packageManager).toBeUndefined()
    expect(pkg.scripts.check).toBe('npm run typecheck && npm run generate && npm run check:static')
  })

  it('runs npm in the workflows, without the pnpm setup step', async () => {
    const root = await created({ packageManager: 'npm' })
    const deploy = parseYaml(await readFile(join(root, '.github/workflows/deploy.yml'), 'utf8'))
    expect(deploy.jobs.build.steps.map((step: { uses?: string, run?: string }) => step.uses ?? step.run)).toEqual([
      'actions/checkout@v7', 'actions/setup-node@v7', 'npm ci', 'npm run check', 'actions/upload-pages-artifact@v5',
    ])
    expect(deploy.jobs.build.steps[1].with.cache).toBe('npm')
    expect(await readFile(join(root, '.github/workflows/cv.yml'), 'utf8')).toContain('- run: npm run build:cv -- --no-pdf')

    const gitlab = parseYaml(await readFile(join(await created({ deployment: 'gitlab-pages', packageManager: 'npm' }), '.gitlab-ci.yml'), 'utf8'))
    expect(gitlab['deploy-pages'].before_script).toEqual(['npm ci'])
  })

  it('names npm commands in the project\'s own instructions', async () => {
    const root = await created({ packageManager: 'npm' })
    expect(await readFile(join(root, 'content/pages/cv.md'), 'utf8')).toContain('`npm run build:cv`')
    expect(await readFile(join(root, 'cv-tex/cv.tex'), 'utf8')).toContain('npx vitakit eject vitakit-cv.cls')
  })

  it('is the only difference: a pnpm project is the template as it is', async () => {
    expect(await files(await created({ packageManager: 'pnpm' }))).toEqual(await files(await created()))
  })

  it.each([
    ['npm/11.6.0 node/v22.18.0 darwin arm64 workspaces/false', 'npm'],
    ['pnpm/10.29.1 npm/? node/v22.18.0 darwin arm64', 'pnpm'],
    ['yarn/4.9.0 npm/? node/v22.18.0 darwin arm64', 'pnpm'],
    ['', 'pnpm'],
    [undefined, 'pnpm'],
  ])('is chosen for the user agent %j: %s', (userAgent, expected) => {
    expect(detectPackageManager(userAgent)).toBe(expected)
  })
})

describe('deployment workflows', () => {
  const workflow = async (deployment: string, file: string) => parseYaml(await readFile(join(await created({ deployment, slug: 'dr-zoe-site' }), file), 'utf8'))
  const stepIndex = (steps: { run?: string, uses?: string }[], match: string) => steps.findIndex(step => step.run === match || step.uses === match)

  it('Cloudflare Workers: deploys checked static assets from main', async () => {
    const root = await created({ deployment: 'cloudflare-workers', slug: 'dr-zoe-site' })
    const { jobs } = parseYaml(await readFile(join(root, '.github/workflows/workers.yml'), 'utf8'))
    expect(jobs.deploy.if).toContain('github.ref == \'refs/heads/main\'')
    expect(stepIndex(jobs.deploy.steps, 'cloudflare/wrangler-action@v4')).toBeGreaterThan(stepIndex(jobs.deploy.steps, 'pnpm check'))
    expect(stepIndex(jobs.deploy.steps, 'pnpm check')).toBeGreaterThan(-1)
    expect(JSON.parse(await readFile(join(root, 'wrangler.json'), 'utf8'))).toMatchObject({
      name: 'dr-zoe-site',
      workers_dev: true,
      assets: { directory: './.output/public', html_handling: 'auto-trailing-slash', not_found_handling: '404-page' },
    })
  })

  it('Codeberg: uploads checked static output with the automatic token', async () => {
    const { jobs } = await workflow('codeberg-pages', '.forgejo/workflows/codeberg.yml')
    const deploy = stepIndex(jobs.deploy.steps, 'https://codeberg.org/git-pages/action@v2')
    expect(deploy).toBeGreaterThan(stepIndex(jobs.deploy.steps, 'pnpm check'))
    expect(jobs.deploy.steps[deploy].with).toMatchObject({ token: '${{ forgejo.token }}', source: '.output/public/' })
  })

  it('GitLab: publishes the checked output from the default branch', async () => {
    const job = (await workflow('gitlab-pages', '.gitlab-ci.yml'))['deploy-pages']
    expect(job.script.at(-1)).toBe('pnpm check')
    expect(job.pages).toEqual({ publish: '.output/public' })
    expect(job.rules).toEqual([{ if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH' }])
  })

  describe('GitLab base path', () => {
    const basePath = async (env: Record<string, string>) => {
      const [script] = (await workflow('gitlab-pages', '.gitlab-ci.yml'))['deploy-pages'].script
      return execFileSync('bash', ['-e', '-c', `${script}\nprintf '%s' "$NUXT_APP_BASE_URL"`], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...env } })
    }

    it.each([
      ['https://my-site-a1b2c3.gitlab.io/', '', '/'],
      ['https://jane.gitlab.io/my-site', '', '/my-site/'],
      ['https://department.pages.example.edu/group/my-site/', '', '/group/my-site/'],
      ['https://jane.gitlab.io/my-site/', '/', '/'],
    ])('is taken from CI_PAGES_URL %s, unless set to %j: %s', async (url, override, expected) => {
      expect(await basePath({ CI_PAGES_URL: url, NUXT_APP_BASE_URL: override })).toBe(expected)
    })

    it('fails rather than building at / when CI_PAGES_URL is missing', async () => {
      await expect(basePath({ CI_PAGES_URL: '', NUXT_APP_BASE_URL: '' })).rejects.toThrow()
    })
  })
})
