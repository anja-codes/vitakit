#!/usr/bin/env node
/**
 * The versions a release consists of, which must all agree:
 *
 *   package.json                          @anja.codes/vitakit
 *   create/package.json                   @anja.codes/create-vitakit
 *   create/template/package.json.template the vitakit range new projects get
 *
 *   node scripts/release.mjs check v0.2.0   # exit 1 unless all match the tag
 *   node scripts/release.mjs set 0.2.0      # set all three
 *
 * `check` prints the npm dist-tag to publish under: `latest`, or `next` for a
 * prerelease such as 0.3.0-beta.1, which must not become what installs by
 * default.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const root = fileURLToPath(new URL('..', import.meta.url))
const FILES = {
  package: `${root}package.json`,
  creator: `${root}create/package.json`,
  template: `${root}create/template/package.json.template`,
}
const RANGE = /("@anja\.codes\/vitakit":\s*")\^?([^"]+)(")/
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

async function versions() {
  const read = async path => readFile(path, 'utf8')
  const template = RANGE.exec(await read(FILES.template))
  return {
    package: JSON.parse(await read(FILES.package)).version,
    creator: JSON.parse(await read(FILES.creator)).version,
    template: template?.[2],
  }
}

async function check(tag) {
  const version = tag?.replace(/^refs\/tags\//, '').replace(/^v/, '')
  if (!version || !VERSION.test(version)) throw new Error(`"${tag}" is not a release tag like v0.2.0`)
  const found = await versions()
  const wrong = Object.entries(found).filter(([, value]) => value !== version)
  if (wrong.length) {
    throw new Error(`tag ${tag} does not match:\n${wrong.map(([name, value]) => `  ${FILES[name].slice(root.length)}: ${value ?? '(no @anja.codes/vitakit range)'}`).join('\n')}\n`
      + `Set them with \`node scripts/release.mjs set ${version}\`.`)
  }
  console.log(version.includes('-') ? 'next' : 'latest')
}

async function set(version) {
  if (!version || !VERSION.test(version)) throw new Error(`"${version}" is not a version like 0.2.0`)
  for (const name of ['package', 'creator']) {
    const text = await readFile(FILES[name], 'utf8')
    await writeFile(FILES[name], text.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`))
  }
  const template = await readFile(FILES.template, 'utf8')
  await writeFile(FILES.template, template.replace(RANGE, `$1^${version}$3`))
  console.log(`version ${version}: package.json, create/package.json, create/template/package.json.template`)
}

const [command, argument] = process.argv.slice(2)
try {
  if (command === 'check') await check(argument)
  else if (command === 'set') await set(argument)
  else throw new Error('usage: node scripts/release.mjs check <tag> | set <version>')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
