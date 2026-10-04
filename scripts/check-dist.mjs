#!/usr/bin/env node
/**
 * Assert that `pnpm build` produced the layout `src/assets.ts` resolves against.
 *
 * Bundled assets are read at build time, from a user's project. Without this
 * check, a change to the build config surfaces as a runtime error in someone
 * else's repository; with it, it fails here.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const root = fileURLToPath(new URL('..', import.meta.url))

const required = [
  // Entry points named in package.json#exports.
  'dist/index.mjs',
  'dist/index.d.mts',
  'dist/nuxt.mjs',
  'dist/shared/index.mjs',
  'dist/tex.mjs',
  'dist/check.mjs',
  'dist/cli.mjs',
  // Assets resolved by src/assets.ts.
  'dist/styles/vitakit-math.csl',
  'dist/tex/templates/_generic.eta',
  'dist/tex/templates/publications.eta',
  'dist/tex/vitakit-cv.cls',
  'dist/runtime/components/VitaSection.vue',
  'dist/runtime/composables/useVitakit.ts',
]

const missing = required.filter(path => !existsSync(join(root, path)))

if (missing.length) {
  console.error('dist/ is missing files that vitakit resolves at run time:')
  for (const path of missing) console.error(`  ${path}`)
  console.error('\nCheck build.config.ts (entries and the build:done copy hook).')
  process.exit(1)
}

console.log(`dist/ layout complete (${required.length} files).`)
