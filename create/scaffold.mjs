import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEPLOYMENTS } from './deployments.mjs'

export { DEPLOYMENTS } from './deployments.mjs'

const TEMPLATE = fileURLToPath(new URL('template', import.meta.url))

/** Package managers a project can be written for; the first is the default. */
export const PACKAGE_MANAGERS = ['pnpm', 'npm']

/**
 * The package manager that started `create`, from the user agent every package
 * manager sets for the processes it runs (`npm/11.6.0 node/v22.18.0 …`).
 * Anything but npm (pnpm, another one, or running this file directly) gets
 * the default.
 */
export function detectPackageManager(userAgent = '') {
  return userAgent.startsWith('npm/') ? 'npm' : 'pnpm'
}

/**
 * The template is written for pnpm. For npm, its commands are translated in
 * every text file (scripts, workflows, comments, the pages' own instructions),
 * so a project never mentions a package manager its owner does not use.
 */
function forNpm(text, scripts) {
  return text
    // The pnpm setup step, together with the comment lines directly above it.
    .replace(/^(?:[ \t]*#.*\n)*[ \t]*- uses: \S*pnpm\/action-setup@\S+\n/gm, '')
    .replace(/cache: pnpm\b/g, 'cache: npm')
    .replace(/^[ \t]*- corepack (?:enable|install)\n/gm, '')
    .replace(/pnpm install --frozen-lockfile/g, 'npm ci')
    .replace(/pnpm vitakit\b/g, 'npx vitakit')
    // `pnpm pdf --tex-only` -> `npm run pdf -- --tex-only`
    .replace(/pnpm ([\w:-]+)((?: --?[\w-]+)*)/g, (command, script, args) =>
      scripts.includes(script) ? `npm run ${script}${args ? ` --${args}` : ''}` : command)
}

/** YAML placeholders represent whole scalars; prose/TeX placeholders stay raw. */
function fill(text, answers) {
  const values = {
    NAME: answers.name,
    TITLE: answers.title,
    AFFILIATION: answers.affiliation,
    EMAIL: answers.email,
    SLUG: answers.slug,
    SUMMARY: `${answers.title} at ${answers.affiliation}, working on your research area.`,
  }
  // One callback pass preserves literal $ replacements and placeholder-like
  // text in answers. JSON strings are valid quoted YAML scalars, including
  // embedded quotes, backslashes and newlines.
  return text.replace(/__(YAML_)?(NAME|TITLE|AFFILIATION|EMAIL|SLUG|SUMMARY)__/g,
    (_, yaml, key) => yaml ? JSON.stringify(values[key]) : values[key])
}

const TEXT_FILE = /\.(md|ya?ml|json|ts|vue|css|bib|tex|svg|txt|yml|template)$/
const TEXT_NAMES = new Set(['package.json', '.gitignore', 'latexmkrc'])

/** Internal creator implementation, separate from the interactive CLI. */
export async function scaffold(target, answers) {
  const deployment = DEPLOYMENTS[answers.deployment]
  if (!deployment || !Object.hasOwn(DEPLOYMENTS, answers.deployment)) {
    throw new Error(`Unknown deployment target: ${answers.deployment}`)
  }

  await mkdir(target, { recursive: true })
  await cp(TEMPLATE, target, {
    recursive: true,
    // Finder metadata can exist in a checkout but must not reach a project.
    filter: source => basename(source) !== '.DS_Store',
  })

  // Files that cannot be shipped under their final name: `.gitignore` is
  // excluded by npm, and `package.json` would make the template a workspace.
  for (const [from, to] of [['.gitignore.template', '.gitignore'], ['package.json.template', 'package.json']]) {
    await rename(join(target, from), join(target, to))
  }

  for (const [dir, name] of [['_github', '.github'], ['_forgejo', '.forgejo']]) {
    const path = join(target, dir)
    const keep = deployment.files.filter(file => file.startsWith(`${name}/workflows/`))
    if (!keep.length) {
      await rm(path, { recursive: true, force: true })
      continue
    }
    const workflows = join(path, 'workflows')
    for (const file of await readdir(workflows)) {
      if (!keep.includes(`${name}/workflows/${file}`)) await rm(join(workflows, file))
    }
    await rename(path, join(target, name))
  }

  // Standalone provider configuration is just as target-specific as workflows.
  for (const [from, to] of [['gitlab-ci.yml.template', '.gitlab-ci.yml'], ['wrangler.json.template', 'wrangler.json']]) {
    if (deployment.files.includes(to)) await rename(join(target, from), join(target, to))
    else await rm(join(target, from))
  }

  const manifest = join(target, 'package.json')
  const npm = answers.packageManager === 'npm'
  const scripts = Object.keys(JSON.parse(await readFile(manifest, 'utf8')).scripts)

  // Substitute placeholders in every text file, and translate commands for npm.
  const walk = async (dir) => {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, item.name)
      if (item.isDirectory()) await walk(path)
      else if (TEXT_FILE.test(item.name) || TEXT_NAMES.has(item.name)) {
        const text = fill(await readFile(path, 'utf8'), answers)
        await writeFile(path, npm ? forNpm(text, scripts) : text)
      }
    }
  }
  await walk(target)

  // `packageManager` pins pnpm for Corepack and for pnpm/action-setup.
  if (npm) {
    const pkg = JSON.parse(await readFile(manifest, 'utf8'))
    delete pkg.packageManager
    await writeFile(manifest, `${JSON.stringify(pkg, null, 2)}\n`)
  }
}
