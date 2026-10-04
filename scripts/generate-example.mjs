#!/usr/bin/env node
/**
 * Regenerate `examples/scaffolded/` from the @anja.codes/create-vitakit template.
 *
 * The example is committed so that scaffolder output is reviewable in diffs and
 * testable in CI. Without it, `create` output rots silently against the package
 * — the most likely long-term failure mode of this design.
 *
 *   node scripts/generate-example.mjs [--check]
 *
 * `--check` regenerates into a temporary directory and fails when the committed
 * example differs, which is what CI runs.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const root = fileURLToPath(new URL('..', import.meta.url))
const example = join(root, 'examples/scaffolded')
const creator = join(root, 'create/index.mjs')

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: { ...process.env, VITAKIT_CREATE_DEFAULTS: '1' } })
    child.on('error', reject)
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))))
  })
}

async function generate(target) {
  await rm(target, { recursive: true, force: true })
  await run(process.execPath, [creator, target], root)

  // The example is consumed from the workspace, not from npm.
  const manifest = join(target, 'package.json')
  const pkg = JSON.parse(await readFile(manifest, 'utf8'))
  pkg.dependencies['@anja.codes/vitakit'] = 'workspace:*'
  await writeFile(manifest, `${JSON.stringify(pkg, null, 2)}\n`)
}

/** Build output that legitimately exists in a working copy of the example. */
const IGNORED = new Set([
  'node_modules', '.nuxt', '.output', '.data', '.nitro', '.cache', 'dist', 'generated',
])

async function listFiles(dir, prefix = '') {
  const entries = []
  for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    // The only build product left outside `generated/` is the PDF.
    if (IGNORED.has(item.name) || item.name.endsWith('.pdf')) continue
    const path = join(dir, item.name)
    const name = prefix ? `${prefix}/${item.name}` : item.name
    if (item.isDirectory()) entries.push(...await listFiles(path, name))
    else entries.push([name, await readFile(path, 'utf8')])
  }
  return entries
}

const check = process.argv.includes('--check')

if (!check) {
  await generate(example)
  console.log(`Regenerated ${example}`)
} else {
  const temporary = join(await mkdtemp(join(tmpdir(), 'vitakit-example-')), 'scaffolded')
  await generate(temporary)

  const [expected, actual] = await Promise.all([listFiles(temporary), listFiles(example).catch(() => [])])
  const expectedMap = new Map(expected)
  const actualMap = new Map(actual)
  const problems = []

  for (const [name, contents] of expectedMap) {
    if (!actualMap.has(name)) problems.push(`missing: ${name}`)
    else if (actualMap.get(name) !== contents) problems.push(`differs: ${name}`)
  }
  for (const name of actualMap.keys()) {
    if (!expectedMap.has(name)) problems.push(`unexpected: ${name}`)
  }

  await rm(temporary, { recursive: true, force: true })

  if (problems.length) {
    console.error('examples/scaffolded is out of date:\n' + problems.map(line => `  ${line}`).join('\n'))
    console.error('\nRun `node scripts/generate-example.mjs` and commit the result.')
    process.exit(1)
  }
  console.log('examples/scaffolded matches the template.')
}
