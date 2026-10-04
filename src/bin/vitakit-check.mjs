#!/usr/bin/env node
/**
 * Assert that the generated site is complete and correct.
 */
import process from 'node:process'
import { checkStatic } from '../../dist/check.mjs'

const HELP = `vitakit-check — verify the generated site

Usage
  pnpm check:static [--out <dir>]

Run after \`nuxt generate\`; \`pnpm check\` does both. Checks the built HTML,
not your content, because a schema cannot catch a renderer that silently did
nothing:

  - every page in content/pages/ was generated
  - mathematics was typeset, and KaTeX reported no errors
  - the site was built for the deployment base path (NUXT_APP_BASE_URL), and
    every link and asset (href, src, srcset, poster, …) stays inside it
  - every link into the site leads to a file or page that was generated,
    e.g. slides: /slides/talk.pdf to public/slides/talk.pdf
  - no entry marked \`visibility: cv\` or \`private\` appears anywhere in the site
  - the bibliography is fully formatted wherever it is shown

Options
  --out <dir>      the generated site; defaults to .output/public
  --no-leak-check  skip the check for cv and private entries. It compares their
                   titles with the text of every page, so a title that is
                   legitimately public elsewhere looks like a leak.
  --help           this text

Reports every problem and exits non-zero if there is one, so it can gate a
deployment.`

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP)
  process.exit(0)
}

const outIndex = args.indexOf('--out')

const { checked, failures } = await checkStatic({
  rootDir: process.cwd(),
  outDir: outIndex === -1 ? undefined : args[outIndex + 1],
  skipLeakCheck: args.includes('--no-leak-check'),
})

for (const line of checked) console.log(`  ok  ${line}`)
if (failures.length) {
  console.error(`\nvitakit-check: ${failures.length} problem(s):`)
  for (const failure of failures) console.error(`  \u2716 ${failure}`)
  process.exit(1)
}
console.log('\nvitakit-check: generated site looks correct.')
