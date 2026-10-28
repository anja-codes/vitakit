import type { CommandSpec } from '../command'
import { finish } from '../finish'

export const migrate: CommandSpec = {
  name: 'migrate',
  summary: 'update a project written for an earlier vitakit',
  positionals: [],
  options: {
    'dry-run': { type: 'boolean', description: 'show what would be written, write nothing' },
    'yes': { type: 'boolean', description: 'ask nothing and write' },
  },
  project: true,
  help: run => `
After updating vitakit, changes your files where they use what it no longer
supports. Everything is shown before it is written, and asked; what cannot be
changed safely is listed for you to do by hand. Running it again changes
nothing that is up to date.

  ${run.bin('vitakit', 'migrate --dry-run')}
  ${run.bin('vitakit', 'migrate')}

Then check the project: \`${run.bin('vitakit', 'validate')}\``,

  async run(context, { values }) {
    const { Workspace } = await import('../plan')
    const { migratePublicationLists, migrateSectionComponents } = await import('../migrations')
    const ws = new Workspace(context.root)
    const notes = { before: [] as string[], after: [] as string[] }
    await migratePublicationLists(context.root, ws, notes)
    await migrateSectionComponents(context.root, ws, notes)
    notes.after.push(`Check the project: \`${context.run.bin('vitakit', 'validate')}\``)
    return finish(context, ws, values, notes)
  },
}
