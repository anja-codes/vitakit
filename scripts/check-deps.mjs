#!/usr/bin/env node
/**
 * Compare the scaffolded project's dependency ranges with the newest published
 * versions.
 *
 * Ranges go stale invisibly: pnpm installs the newest version *the range
 * allows*, so comparing against what is installed only ever confirms the range
 * agrees with itself. The registry is the only source that can say a floor is
 * old, which is why this queries it rather than node_modules.
 *
 * Network-dependent, so it is a script rather than a test:
 *
 *   node scripts/check-deps.mjs          # report
 *   node scripts/check-deps.mjs --write  # update the template
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const manifest = fileURLToPath(new URL('../create/template/package.json.template', import.meta.url))

/**
 * Ranges that are held back deliberately. Bumping these breaks something, so
 * they need a reason, not a version number.
 */
const PINNED = {
  typescript: 'vue-tsc 3.x cannot load TypeScript 7 (ERR_PACKAGE_PATH_NOT_EXPORTED)',
}

async function latest(name) {
  const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}/latest`)
  if (!response.ok) throw new Error(`${name}: registry returned ${response.status}`)
  return (await response.json()).version
}

const template = JSON.parse(await readFile(manifest, 'utf8'))
const groups = ['dependencies', 'devDependencies']
const outdated = []
const held = []

for (const group of groups) {
  for (const [name, range] of Object.entries(template[group])) {
    if (name === '@anja.codes/vitakit') continue
    const published = await latest(name).catch(error => String(error))
    const floor = range.replace(/^[\^~]/, '')
    if (published === floor) continue
    if (PINNED[name]) {
      held.push(`${name}: ${range} (latest ${published}) — ${PINNED[name]}`)
      continue
    }
    outdated.push({ group, name, range, published })
  }
}

for (const line of held) console.log(`  held  ${line}`)

if (!outdated.length) {
  console.log('\nScaffolded dependencies are current.')
  process.exit(0)
}

for (const { name, range, published } of outdated) {
  console.log(`  old   ${name}: ${range} -> ^${published}`)
}

if (process.argv.includes('--write')) {
  for (const { group, name, published } of outdated) template[group][name] = `^${published}`
  await writeFile(manifest, `${JSON.stringify(template, null, 2)}\n`)
  console.log('\nUpdated the template. Run `pnpm example` and check the build.')
} else {
  console.log('\nRun with --write to update, then `pnpm example` and verify the build.')
  process.exit(1)
}
