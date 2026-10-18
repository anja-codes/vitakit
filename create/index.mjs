#!/usr/bin/env node
/**
 * pnpm create @anja.codes/vitakit [directory]
 * npm create @anja.codes/vitakit [directory]
 *
 * Copies the template, substitutes the few things that are personal, picks a
 * deployment workflow, and writes the project for the package manager that ran
 * it. Deliberately the *only* scaffolding step vitakit has:
 * everything afterwards is editing files in a repository you own.
 */
import { readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import process from 'node:process'
import { DEPLOYMENTS, detectPackageManager, scaffold } from './scaffold.mjs'

function slugify(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-site'
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
    packageManager: detectPackageManager(process.env.npm_config_user_agent),
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
  const pm = answers.packageManager
  const run = pm === 'npm' ? 'npm run' : 'pnpm'
  const step = (command, comment) => console.log(`  ${command.padEnd(20)}${comment ? `# ${comment}` : ''}`.trimEnd())
  step('cd ' + directory)
  step(`${pm} install`)
  step(`${run} dev`, 'http://localhost:3000')
  step(`${run} build:cv`, 'cv-tex/cv.pdf (needs LaTeX)')
  step(`${run} check`, 'what CI runs')
  console.log()
  console.log('Then edit content/: profile.yml, the section files and publications.bib.')
  console.log('The PDF is not part of the website build; assume this repository is private.\n')
}

main().catch((error) => {
  console.error(`\n@anja.codes/create-vitakit: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
