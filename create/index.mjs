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
import { detectPackageManager, scaffold } from './scaffold.mjs'
import { chooseDeployment, deploymentHelp, deploymentInstructions } from './deployments.mjs'

function slugify(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-site'
}

async function main() {
  const args = process.argv.slice(2)
  const packageManager = detectPackageManager(process.env.npm_config_user_agent)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: ${packageManager} create @anja.codes/vitakit [directory]\n\n  --help, -h          Show this help without creating a project\n  --deployment-help  Explain deployment targets without creating a project\n`)
    console.log(deploymentHelp())
    return
  }
  if (args.includes('--deployment-help')) {
    console.log(deploymentHelp())
    return
  }

  const [directoryArgument] = args.filter(argument => !argument.startsWith('-'))
  const interactive = process.stdin.isTTY && !process.env.VITAKIT_CREATE_DEFAULTS

  const answers = {
    name: 'Your Name',
    title: 'Postdoctoral Researcher',
    affiliation: 'Department of Mathematics, University of Graz',
    email: 'you@example.org',
    deployment: 'github-pages',
    packageManager,
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

    try {
      answers.deployment = await chooseDeployment(ask)
    } finally {
      rl.close()
    }
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
  console.log('Edit content/ to make it yours. Keep sensitive CV source private.\n')
  console.log(`${deploymentInstructions(answers.deployment, pm)}\n`)
}

main().catch((error) => {
  console.error(`\n@anja.codes/create-vitakit: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
