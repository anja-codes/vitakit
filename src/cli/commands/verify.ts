import type { CommandSpec } from '../command'

export const verify: CommandSpec = {
  name: 'verify',
  summary: 'check the generated website, after nuxt generate',
  positionals: [],
  options: {
    'out': { type: 'string', value: '<dir>', description: 'the generated site; .output/public by default' },
    'no-leak-check': { type: 'boolean', description: 'skip the check for cv and private entries (see below)' },
  },
  project: true,
  help: run => `
Checks the built HTML, not your content, because a schema cannot catch a
renderer that silently did nothing:

  - every page in content/pages/ was generated
  - mathematics was typeset, and KaTeX reported no errors
  - the site was built for the deployment base path (NUXT_APP_BASE_URL), and
    every link and asset (href, src, srcset, poster, …) stays inside it
  - every link into the site leads to a file or page that was generated
  - no entry marked \`visibility: cv\` or \`private\` appears anywhere in the site
  - the bibliography is fully formatted wherever it is shown

\`${run.script('check')}\` builds the site and runs this. The leak check compares the
titles of cv and private entries with the text of every page, so a title that
is legitimately public elsewhere looks like a leak; --no-leak-check skips it.`,

  async run({ io, style, run, root }, { values }) {
    const { checkStatic } = await import('../../check')
    const { checked, failures } = await checkStatic({
      rootDir: root,
      outDir: values.out as string | undefined,
      skipLeakCheck: values['no-leak-check'] === true,
    })
    for (const line of checked) io.out(`  ${style.green('ok')}  ${line}\n`)
    if (failures.length) {
      io.err(`\n${failures.length} ${failures.length === 1 ? 'problem' : 'problems'}:\n`)
      for (const failure of failures) {
        io.err(`  ${style.red('✖')} ${failure.replace('run `nuxt generate` first', `build it first with \`${run.script('generate')}\``)}\n`)
      }
      return 1
    }
    io.out(`\n${style.green('The generated site looks correct.')}\n`)
    return 0
  },
}
