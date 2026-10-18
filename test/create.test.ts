import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import matter from 'gray-matter'
import { parse as parseYaml } from 'yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { loadContent } from '../src/content'

const creator = fileURLToPath(new URL('../create/index.mjs', import.meta.url))
const scaffoldUrl = new URL('../create/scaffold.mjs', import.meta.url).href
const { detectPackageManager } = await import(scaffoldUrl) as { detectPackageManager: (userAgent?: string) => string }
const deploymentsUrl = new URL('../create/deployments.mjs', import.meta.url).href
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
function scaffold(root: string, answers: typeof defaults & { packageManager?: string } = defaults, implementationUrl = scaffoldUrl) {
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { scaffold } from ${JSON.stringify(implementationUrl)}
    await scaffold(process.argv[1], JSON.parse(process.argv[2]))
  `, root, JSON.stringify(answers)], { stdio: 'pipe' })
}

// Exercise the real menu in native Node without needing a pseudo-terminal.
function deploymentPrompt(choices: string[]) {
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { chooseDeployment } from ${JSON.stringify(deploymentsUrl)}
    const choices = JSON.parse(process.argv[1])
    const output = []
    const prompts = []
    const selected = await chooseDeployment(async (question, fallback) => {
      prompts.push({ question, fallback })
      if (!choices.length) throw new Error('Prompt did not accept the supplied choices')
      return choices.shift() || fallback
    }, message => output.push(message))
    console.log(JSON.stringify({ selected, output, prompts }))
  `, JSON.stringify(choices)], { encoding: 'utf8' }))
}

function deploymentCopy(packageManager = 'pnpm'): { help: string, instructions: Record<string, string> } {
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { DEPLOYMENTS, deploymentHelp, deploymentInstructions } from ${JSON.stringify(deploymentsUrl)}
    console.log(JSON.stringify({
      help: deploymentHelp(),
      instructions: Object.fromEntries(Object.keys(DEPLOYMENTS).map(key => [key, deploymentInstructions(key, ${JSON.stringify(packageManager)})])),
    }))
  `], { encoding: 'utf8' }))
}

describe('deployment selection and help', () => {
  it('keeps the comparison compact and saves setup details for after selection', () => {
    const { help, instructions } = deploymentCopy()
    expect(help.split(/\s+/).length).toBeLessThan(300)
    expect(help).toMatch(/1\. GitHub Pages\n   [^\n]+\n   URL:/)
    expect(help).toContain('   Source:')
    expect(help).toContain('   CI:')
    expect(help).not.toContain('CLOUDFLARE_API_TOKEN')
    expect(help).not.toContain('--project-name')
    expect(help.indexOf('Cloudflare Workers')).toBeLessThan(help.indexOf('Cloudflare Pages'))
    expect(help).toContain('Legacy Cloudflare option. Still available;')
    for (const setup of Object.values(instructions)) {
      expect(setup).toMatch(/^  1\. /m)
      expect(setup).toMatch(/^  2\. /m)
      expect(setup).not.toContain('   Source:')
    }
    // Terminal output should not turn back into unbroken paragraphs.
    for (const line of [help, ...Object.values(instructions)].join('\n').split('\n')) {
      expect(line.length, line).toBeLessThanOrEqual(80)
    }
  })

  it('formats Workers setup as short steps with a separate secrets sublist', () => {
    expect(deploymentCopy().instructions['cloudflare-workers']).toBe([
      'Deployment: Cloudflare Workers (recommended)',
      '  1. Enable a workers.dev subdomain in your Cloudflare account.',
      '  2. Set the Worker name in wrangler.json.',
      '  3. Add GitHub Actions repository secrets:',
      '     - CLOUDFLARE_ACCOUNT_ID',
      '     - CLOUDFLARE_API_TOKEN (Workers Scripts: Edit permission)',
      '  4. Commit pnpm-lock.yaml and push to main.',
    ].join('\n'))
  })

  it('uses npm commands and lockfiles in setup instructions for npm projects', () => {
    const { instructions } = deploymentCopy('npm')
    for (const setup of Object.values(instructions)) expect(setup).not.toContain('pnpm')
    expect(instructions['cloudflare-workers']).toContain('Commit package-lock.json')
    expect(instructions.none).toContain('npm run check')
  })

  it.each(['?', 'h', 'help', 'HELP'])('shows context for %j and then accepts a selection', (help) => {
    const { selected, output, prompts } = deploymentPrompt([help, '2'])
    expect(selected).toBe('cloudflare-workers')
    expect(prompts).toHaveLength(2)
    const context = output.join('\n')
    for (const text of [
      'GitHub Pro', 'Team/Enterprise', 'https://<user>.github.io/<repo>/',
      'https://<project>.pages.dev/', 'Direct Upload', 'Cloudflare Pages (legacy)',
      'SSH/rsync', 'Forgejo Actions, not GitHub Actions',
      'No deployment or PDF-build workflows added.',
      'Cloudflare Workers (recommended)', 'https://<worker>.<account>.workers.dev/',
      'GitLab 17.10+', 'Codeberg Pages (git-pages)', 'public, freely licensed source',
    ]) expect(context).toContain(text)
  })

  it('re-prompts for invalid input instead of silently choosing GitHub Pages', () => {
    const { selected, output, prompts } = deploymentPrompt(['bogus', '0', '-1', '8', '1.5', '1e0', '2'])
    expect(selected).toBe('cloudflare-workers')
    expect(prompts).toHaveLength(7)
    expect(output.filter((message: string) => message.startsWith('Please choose'))).toHaveLength(6)
  })

  it('allows repeated help without selecting or discarding the subsequent choice', () => {
    const { selected, prompts } = deploymentPrompt(['?', 'help', '7'])
    expect(selected).toBe('none')
    expect(prompts).toHaveLength(3)
  })

  it('keeps the existing default but uses short, hosting-focused menu labels', () => {
    const { selected, output } = deploymentPrompt([''])
    expect(selected).toBe('github-pages')
    expect(output).toContain('  1. GitHub Pages')
    expect(output).toContain('  2. Cloudflare Workers (recommended)')
    expect(output).toContain('  3. Cloudflare Pages (legacy)')
    expect(output).toContain('  4. GitLab Pages')
    expect(output).toContain('  5. Codeberg Pages (git-pages)')
    expect(output).toContain('  6. Existing web space (SSH/rsync)')
    expect(output.join('\n')).not.toMatch(/Forgejo|public repository|private repository/)
  })

  it.each(['--help', '-h', '--deployment-help'])('%s prints context without touching the filesystem', async (flag) => {
    const root = await project()
    await writeFile(join(root, 'keep.txt'), 'untouched')
    const output = execFileSync(process.execPath, [creator, 'would-be-site', flag], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, VITAKIT_CREATE_DEFAULTS: '1' },
    })
    expect(output).toContain('Choosing a deployment target')
    expect(output).toContain('GitHub Pro')
    expect(output).toContain('pages.dev')
    expect(output).toContain('workers.dev')
    expect(output).toContain('GitLab Pages')
    expect(output).toContain('Codeberg Pages (git-pages)')
    expect(output).toContain('Forgejo Actions, not GitHub Actions')
    expect(output).toContain('Decide later / deploy manually')
    expect(output).not.toContain('Created ')
    expect(await readdir(root)).toEqual(['keep.txt'])
    expect(await readFile(join(root, 'keep.txt'), 'utf8')).toBe('untouched')
  })

  it('ships the shared deployment module in the published creator', async () => {
    const manifest = JSON.parse(await readFile(new URL('../create/package.json', import.meta.url), 'utf8'))
    expect(manifest.files).toContain('deployments.mjs')
  })

  it.each([
    ['1', 'github-pages'], ['2', 'cloudflare-workers'], ['3', 'cloudflare'],
    ['4', 'gitlab-pages'], ['5', 'codeberg-pages'], ['6', 'rsync'], ['7', 'none'],
  ])('selects %s as %s', (choice, deployment) => {
    expect(deploymentPrompt([choice]).selected).toBe(deployment)
  })

  it.each(['missing', 'toString'])('rejects unknown target %j before creating files', async (deployment) => {
    const root = await project()
    expect(() => scaffold(join(root, 'site'), { ...defaults, deployment })).toThrow('Unknown deployment target')
    expect(await readdir(root)).toEqual([])
  })

  it.each([
    { deployment: 'github-pages', github: ['cv.yml', 'deploy.yml'], forgejo: [], config: [] },
    { deployment: 'cloudflare', github: ['cloudflare.yml', 'cv.yml'], forgejo: [], config: [] },
    { deployment: 'cloudflare-workers', github: ['cv.yml', 'workers.yml'], forgejo: [], config: ['wrangler.json'] },
    { deployment: 'gitlab-pages', github: [], forgejo: [], config: ['.gitlab-ci.yml'] },
    { deployment: 'codeberg-pages', github: [], forgejo: ['codeberg.yml'], config: [] },
    { deployment: 'rsync', github: [], forgejo: ['deploy.yml'], config: [] },
    { deployment: 'none', github: [], forgejo: [], config: [] },
  ])('keeps only the promised workflows and config for $deployment', async ({ deployment, github, forgejo, config }) => {
    const root = await project()
    scaffold(root, { ...defaults, deployment })
    expect((await readdir(join(root, '.github/workflows')).catch(() => [])).sort()).toEqual(github)
    expect((await readdir(join(root, '.forgejo/workflows')).catch(() => [])).sort()).toEqual(forgejo)
    const files = await readdir(root)
    expect(files).not.toContain('_github')
    expect(files).not.toContain('_forgejo')
    if (!github.length) expect(files).not.toContain('.github')
    if (!forgejo.length) expect(files).not.toContain('.forgejo')
    expect(files.filter(file => ['.gitlab-ci.yml', 'wrangler.json'].includes(file))).toEqual(config)
    expect(files.some(file => file.endsWith('.template'))).toBe(false)
    for (const file of config) {
      expect(await readFile(join(root, file), 'utf8')).not.toMatch(/__SLUG__/)
    }
  })
})

describe('new deployment presets', () => {
  it('deploys Workers assets only, after a successful check, with SSG routing', async () => {
    const root = await project()
    scaffold(root, { ...defaults, deployment: 'cloudflare-workers', slug: 'dr-zoe-site' })
    const workflow = parseYaml(await readFile(join(root, '.github/workflows/workers.yml'), 'utf8'))
    const config = JSON.parse(await readFile(join(root, 'wrangler.json'), 'utf8'))
    expect(workflow.on.push.branches).toEqual(['main'])
    expect(workflow.jobs.deploy.if).toContain("github.ref == 'refs/heads/main'")
    const steps = workflow.jobs.deploy.steps
    const check = steps.findIndex((step: { run?: string }) => step.run === 'pnpm check')
    const deploy = steps.findIndex((step: { uses?: string }) => step.uses === 'cloudflare/wrangler-action@v4')
    expect(check).toBeGreaterThan(-1)
    expect(deploy).toBeGreaterThan(check)
    expect(steps[deploy].with.command).toBe('deploy')
    expect(steps[deploy].with.apiToken).toBe('${{ secrets.CLOUDFLARE_API_TOKEN }}')
    expect(steps[deploy].with.accountId).toBe('${{ secrets.CLOUDFLARE_ACCOUNT_ID }}')
    expect(config.name).toBe('dr-zoe-site')
    expect(config.workers_dev).toBe(true)
    expect(config).not.toHaveProperty('main')
    expect(config.assets).toEqual({
      directory: './.output/public',
      html_handling: 'auto-trailing-slash',
      not_found_handling: '404-page',
    })
  })

  it('publishes only checked static output through GitLab Pages on the default branch', async () => {
    const root = await project()
    scaffold(root, { ...defaults, deployment: 'gitlab-pages' })
    const workflow = parseYaml(await readFile(join(root, '.gitlab-ci.yml'), 'utf8'))
    expect(workflow.image).toBe('node:22-bookworm')
    const job = workflow['deploy-pages']
    expect(job.before_script).toEqual(['corepack enable', 'corepack install', 'pnpm install --frozen-lockfile'])
    expect(job.script.at(-1)).toBe('pnpm check')
    expect(job.pages).toEqual({ publish: '.output/public' })
    expect(job.rules).toEqual([{ if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH' }])
  })

  it.each([
    ['https://my-site-a1b2c3.gitlab.io/', '', '/'],
    ['https://jane.gitlab.io/my-site', '', '/my-site/'],
    ['https://jane.gitlab.io/my-site/', '', '/my-site/'],
    ['https://department.pages.example.edu/group/my-site', '', '/group/my-site/'],
    ['https://jane.gitlab.io/my-site/', '/', '/'],
    ['https://my-site-a1b2c3.gitlab.io/', '/website/', '/website/'],
  ])('uses GitLab URL %s with override %j to build at %s', async (url, override, expected) => {
    const root = await project()
    scaffold(root, { ...defaults, deployment: 'gitlab-pages' })
    const workflow = parseYaml(await readFile(join(root, '.gitlab-ci.yml'), 'utf8'))
    const script = workflow['deploy-pages'].script[0]
    const output = execFileSync('bash', ['-e', '-c', `${script}\nprintf '%s' "$NUXT_APP_BASE_URL"`], {
      encoding: 'utf8',
      env: { ...process.env, CI_PAGES_URL: url, NUXT_APP_BASE_URL: override },
    })
    expect(output).toBe(expected)
  })

  it('fails rather than silently building at / when the GitLab URL is missing or invalid', async () => {
    const root = await project()
    scaffold(root, { ...defaults, deployment: 'gitlab-pages' })
    const workflow = parseYaml(await readFile(join(root, '.gitlab-ci.yml'), 'utf8'))
    expect(() => execFileSync('bash', ['-e', '-c', workflow['deploy-pages'].script[0]], {
      env: { ...process.env, CI_PAGES_URL: '', NUXT_APP_BASE_URL: '' },
      stdio: 'pipe',
    })).toThrow()
  })

  it('uploads only checked Codeberg output with the git-pages action and automatic token', async () => {
    const root = await project()
    scaffold(root, { ...defaults, deployment: 'codeberg-pages' })
    const text = await readFile(join(root, '.forgejo/workflows/codeberg.yml'), 'utf8')
    const workflow = parseYaml(text)
    expect(workflow.on.push.branches).toEqual(['main'])
    const job = workflow.jobs.deploy
    expect(job.if).toContain("forgejo.ref == 'refs/heads/main'")
    expect(job['runs-on']).toBe('codeberg-medium')
    expect(job.env.NUXT_APP_BASE_URL).toBe('/${{ forgejo.event.repository.name }}/')
    const check = job.steps.findIndex((step: { run?: string }) => step.run === 'pnpm check')
    const deploy = job.steps.findIndex((step: { uses?: string }) => step.uses === 'https://codeberg.org/git-pages/action@v2')
    expect(check).toBeGreaterThan(-1)
    expect(deploy).toBeGreaterThan(check)
    expect(job.steps[deploy].with).toEqual({
      site: 'https://${{ forgejo.repository_owner }}.codeberg.page/${{ forgejo.event.repository.name }}/',
      server: 'codeberg.page',
      token: '${{ forgejo.token }}',
      source: '.output/public/',
    })
    expect(text).toContain('PUBLIC, freely licensed repository')
    expect(text).toContain('For private CV source, use your own')
    expect(text).not.toContain('git push')
  })
})

describe('published creator personalisation', () => {
  it('does not copy Finder metadata from a local template checkout', async () => {
    const root = await project()
    const creatorCopy = join(root, 'create')
    await cp(fileURLToPath(new URL('../create', import.meta.url)), creatorCopy, { recursive: true })
    await writeFile(join(creatorCopy, 'template/.DS_Store'), 'root metadata')
    await writeFile(join(creatorCopy, 'template/content/.DS_Store'), 'nested metadata')
    const target = join(root, 'site')
    scaffold(target, defaults, pathToFileURL(join(creatorCopy, 'scaffold.mjs')).href)
    expect(await readdir(target)).not.toContain('.DS_Store')
    expect(await readdir(join(target, 'content'))).not.toContain('.DS_Store')
    expect(await readFile(join(target, 'content/profile.yml'), 'utf8')).toContain(defaults.name)
  })

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
    expect(output).toContain('Deployment: GitHub Pages\n')
    expect(output).toContain('  1. In GitHub Settings → Pages, select GitHub Actions as the source.')
    expect(output).not.toContain('Static hosting built into GitHub.')
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

  it.each(['github-pages', 'cloudflare-workers', 'cloudflare', 'gitlab-pages', 'codeberg-pages', 'rsync', 'none'])('writes an npm project without a trace of pnpm (%s)', async (deployment) => {
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

  it('uses npm ci without Corepack in the GitLab pipeline', async () => {
    const root = await project()
    scaffold(root, { ...defaults, deployment: 'gitlab-pages', packageManager: 'npm' })
    const workflow = parseYaml(await readFile(join(root, '.gitlab-ci.yml'), 'utf8'))
    expect(workflow['deploy-pages'].before_script).toEqual(['npm ci'])
    expect(workflow['deploy-pages'].script.at(-1)).toBe('npm run check')
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

  it.each(['--help', '-h', '--deployment-help'])('prints npm help for %s when started by npm', (flag) => {
    const output = execFileSync(process.execPath, [creator, flag], {
      encoding: 'utf8',
      env: { ...process.env, npm_config_user_agent: 'npm/11.6.0 node/v22.18.0' },
    })
    expect(output).toContain('Choosing a deployment target')
    expect(output).not.toContain('pnpm')
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
