import { CommandError, UsageError, type CommandSpec } from '../command'
import { table } from '../io'

export const eject: CommandSpec = {
  name: 'eject',
  summary: 'take over a shared vitakit file: a component, the citation style, the LaTeX class',
  positionals: [{ name: 'asset' }],
  options: {
    'list': { type: 'boolean', description: 'show what can be ejected, and what each one affects' },
    'force': { type: 'boolean', description: 'replace your existing copy; the old one is kept as a backup' },
    'dry-run': { type: 'boolean', description: 'show what would be written, write nothing' },
    'yes': { type: 'boolean', description: 'do not ask for confirmation' },
  },
  project: true,
  help: run => `
Copies a file vitakit shares between all sections or all documents into your
project, where it then wins. It is yours from then on: later improvements to it
in vitakit will not reach you, so eject deliberately.

  ${run.bin('vitakit', 'eject --list')}
  ${run.bin('vitakit', 'eject VitaPublication')}     how one reference looks on the website
  ${run.bin('vitakit', 'eject publications.csl')}    the website's citation style
  ${run.bin('vitakit', 'eject vitakit-cv.cls')}      the LaTeX document class of every PDF

To change one section, prefer \`${run.bin('vitakit', 'customize <section>')}\`; CSS and
cv-tex/preamble.tex cover most styling without taking anything over.`,

  async run({ io, style, run, root }, { positionals, values }) {
    const { ejectableAssets } = await import('../eject')
    const assets = await ejectableAssets()
    const name = positionals[0]

    if (values.list || name === undefined) {
      if (!values.list) throw new UsageError('which file? See `--list`', 'eject')
      io.out(`${table(assets.map(asset => [asset.name, `→ ${asset.target}`, asset.scope]))}\n\n`
        + `Copy one with \`${run.bin('vitakit', 'eject <name>')}\`.\n`)
      return 0
    }

    const asset = assets.find(candidate => candidate.name.toLowerCase() === name.toLowerCase())
    if (!asset) {
      throw new CommandError(`"${name}" cannot be ejected. Ejectable: ${assets.map(candidate => candidate.name).join(', ')}.${
        /^[a-z0-9-]+(\.eta)?$/.test(name) ? `\n  For one section, use \`${run.bin('vitakit', `customize ${name.replace(/\.eta$/, '')}`)}\`.` : ''}`)
    }

    const { applyPlan, printPlan, confirmPlan } = await import('../plan')
    const plan = await (await import('../eject')).ejectPlan(root, asset, { force: values.force === true })
    printPlan(io, style, root, plan)
    if (values['dry-run']) return 0
    if (!await confirmPlan(io, plan, values.yes === true)) return 1
    await applyPlan(root, plan)
    io.out(`${style.green('✓')} done. ${asset.after}\n`)
    return 0
  },
}
