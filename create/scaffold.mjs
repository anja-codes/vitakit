import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEMPLATE = fileURLToPath(new URL('template', import.meta.url))

export const DEPLOYMENTS = {
  'github-pages': { label: 'GitHub Pages (public repository)', keep: ['deploy.yml', 'cv.yml'], host: '_github' },
  'cloudflare': { label: 'Cloudflare Pages (works with a private repository)', keep: ['cloudflare.yml', 'cv.yml'], host: '_github' },
  'rsync': { label: 'Web space via rsync (Forgejo)', keep: ['deploy.yml'], host: '_forgejo' },
  'none': { label: 'None for now', keep: [], host: undefined },
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

/** Internal creator implementation, separate from the interactive CLI. */
export async function scaffold(target, answers) {
  await mkdir(target, { recursive: true })
  await cp(TEMPLATE, target, { recursive: true })

  // Files that cannot be shipped under their final name: `.gitignore` is
  // excluded by npm, and `package.json` would make the template a workspace.
  for (const [from, to] of [['.gitignore.template', '.gitignore'], ['package.json.template', 'package.json']]) {
    await rename(join(target, from), join(target, to))
  }

  const deployment = DEPLOYMENTS[answers.deployment]
  for (const [dir, name] of [['_github', '.github'], ['_forgejo', '.forgejo']]) {
    const path = join(target, dir)
    if (deployment.host !== dir) {
      await rm(path, { recursive: true, force: true })
      continue
    }
    const workflows = join(path, 'workflows')
    for (const file of await readdir(workflows)) {
      if (!deployment.keep.includes(file)) await rm(join(workflows, file))
    }
    await rename(path, join(target, name))
  }

  // Substitute placeholders in every text file.
  const walk = async (dir) => {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, item.name)
      if (item.isDirectory()) await walk(path)
      else if (TEXT_FILE.test(item.name) || item.name === 'package.json' || item.name === '.gitignore') {
        await writeFile(path, fill(await readFile(path, 'utf8'), answers))
      }
    }
  }
  await walk(target)
}
