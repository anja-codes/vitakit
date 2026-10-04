#!/usr/bin/env node
/**
 * pnpm create @anja.codes/vitakit [directory]
 *
 * Copies the template, substitutes the few things that are personal, and picks
 * a deployment workflow. Deliberately the *only* scaffolding step vitakit has:
 * everything afterwards is editing files in a repository you own.
 */
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import process from 'node:process'

const TEMPLATE = fileURLToPath(new URL('template', import.meta.url))

const DEPLOYMENTS = {
  'github-pages': { label: 'GitHub Pages (public repository)', keep: ['deploy.yml', 'cv.yml'], host: '_github' },
  'cloudflare': { label: 'Cloudflare Pages (works with a private repository)', keep: ['cloudflare.yml', 'cv.yml'], host: '_github' },
  'rsync': { label: 'Web space via rsync (Forgejo)', keep: ['deploy.yml'], host: '_forgejo' },
  'none': { label: 'None for now', keep: [], host: undefined },
}

function slugify(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-site'
}

/** Replace the placeholders the template uses. */
function fill(text, answers) {
  return text
    .replaceAll('__NAME__', answers.name)
    .replaceAll('__TITLE__', answers.title)
    .replaceAll('__AFFILIATION__', answers.affiliation)
    .replaceAll('__EMAIL__', answers.email)
    .replaceAll('__SLUG__', answers.slug)
}

const TEXT_FILE = /\.(md|ya?ml|json|ts|vue|css|bib|tex|svg|txt|yml|template)$/

async function scaffold(target, answers) {
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

async function main() {
  const [directoryArgument] = process.argv.slice(2).filter(argument => !argument.startsWith('-'))
  const interactive = process.stdin.isTTY && !process.env.VITAKIT_CREATE_DEFAULTS

  const answers = {
    name: 'Your Name',
    title: 'Postdoctoral Researcher',
    affiliation: 'Department of Mathematics, University of Graz',
    email: 'you@example.org',
    deployment: 'github-pages',
  }

  let directory = directoryArgument

  if (interactive) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const ask = async (question, fallback) => {
      const answer = (await rl.question(`${question} (${fallback}) `)).trim()
      return answer || fallback
    }

    console.log('\nvitakit — a website and a LaTeX CV from one set of files.\n')
    answers.name = await ask('Your name:', answers.name)
    answers.title = await ask('Your position:', answers.title)
    answers.affiliation = await ask('Affiliation:', answers.affiliation)
    answers.email = await ask('Email:', answers.email)
    directory ??= await ask('Directory:', slugify(answers.name))

    console.log('\nDeployment:')
    const keys = Object.keys(DEPLOYMENTS)
    keys.forEach((key, index) => console.log(`  ${index + 1}. ${DEPLOYMENTS[key].label}`))
    const choice = await ask('Choose:', '1')
    answers.deployment = keys[Number(choice) - 1] ?? 'github-pages'

    rl.close()
  }

  directory ??= slugify(answers.name)
  answers.slug = slugify(basename(directory))
  const target = resolve(process.cwd(), directory)

  if (existsSync(target) && (await readdir(target)).length) {
    throw new Error(`${directory} already exists and is not empty`)
  }

  await scaffold(target, answers)

  console.log(`\nCreated ${directory}\n`)
  console.log('  cd ' + directory)
  console.log('  pnpm install')
  console.log('  pnpm dev            # http://localhost:3000')
  console.log('  pnpm build:cv       # cv-tex/cv.pdf (needs LaTeX)')
  console.log('  pnpm check          # what CI runs\n')
  console.log('Then edit content/: profile.yml, the section files and publications.bib.')
  console.log('The PDF is not part of the website build; assume this repository is private.\n')
}

main().catch((error) => {
  console.error(`\n@anja.codes/create-vitakit: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
