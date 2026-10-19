import { CommandError, UsageError, type CommandContext, type CommandSpec, type ParsedArgs } from '../command'

type Values = ParsedArgs['values']

async function customizeSchema(context: CommandContext, id: string, values: Values): Promise<number> {
  const { io, style, run, root } = context
  const { inventory } = await import('../../inventory')
  const { Workspace, applyPlan, confirmPlan, printPlan } = await import('../plan')
  const { extensionModule } = await import('../authoring')
  const { builtinSchemaSource } = await import('../schema-source')
  const { schemas } = await import('../../schemas')
  const { existsSync } = await import('node:fs')
  const { join } = await import('node:path')

  const ws = new Workspace(root)
  const path = `schemas/${id}.ts`
  let explanation: string[]
  let after: string[]

  if (id === 'publications') {
    if (existsSync(join(root, path))) {
      io.out(`${path} is yours already: its groups, badges and fields decide how content/publications.bib is grouped and linked.\n`)
      return 0
    }
    ws.create(path, await builtinSchemaSource('publications'), 'vitakit\'s publication groups, badges and fields, to change', { show: false })
    explanation = ['The website, `vitakit verify` and the PDF all read it from now on.']
    after = [`Edit ${path}: change groups, add badges, pass on BibTeX fields. Check it: \`${run.bin('vitakit', 'validate')}\``]
  } else {
    const inv = await inventory(root)
    const section = inv.sections.find(candidate => candidate.id === id)
    const builtIn = Object.hasOwn(schemas, id)
    if (!section && !builtIn) {
      throw new CommandError(`no section called "${id}"; the sections are ${inv.sections.map(candidate => candidate.id).join(', ') || '(none)'}`)
    }
    if (section?.schema.origin === 'local') {
      io.out(`${path} is yours already${section.schema.sharedWith ? `; it uses the schema of ${section.schema.sharedWith}` : ''}. Edit it, or add a field with \`${run.bin('vitakit', `add field ${id} <name>`)}\`.\n`)
      return 0
    }
    if (!builtIn) {
      throw new CommandError(`${id} has no schema yet; \`${run.bin('vitakit', `add section ${id}`)}\` drafts one from its entries`)
    }
    if (values.copy) {
      ws.create(path, await builtinSchemaSource(id), `vitakit's complete ${id} definition, yours from now on`)
      explanation = [
        'A complete copy: change or remove any rule. Improvements to vitakit\'s',
        `${id} fields will not reach you; without --copy, you would keep them and only add.`,
      ]
    } else {
      ws.create(path, extensionModule(id, [], []), `keeps vitakit's ${id} fields; yours go below them`, { show: true })
      explanation = [
        `Your fields are added to vitakit's, which stay as they are and keep improving.`,
        `To remove or rewrite built-in rules instead: \`${run.bin('vitakit', `customize ${id} --schema --copy`)}\``,
      ]
    }
    after = [`Add a field: \`${run.bin('vitakit', `add field ${id} <name>`)}\`. Check: \`${run.bin('vitakit', `validate ${id}`)}\``]
  }

  io.out('\n')
  const plan = ws.plan()
  printPlan(io, style, root, plan)
  io.out(`\n${explanation.join('\n')}\n`)
  if (values['dry-run']) {
    io.out(`\n${style.dim('Dry run: nothing was written.')}\n`)
    return 0
  }
  if (!await confirmPlan(io, plan, values.yes === true)) return 1
  await applyPlan(root, plan)
  io.out(`\n${style.green('✓')} done.\n\n${after.join('\n')}\n`)
  return 0
}

export const customize: CommandSpec = {
  name: 'customize',
  summary: 'make one section yours: what its entries may contain',
  positionals: [{ name: 'section', required: true }],
  options: {
    'schema': { type: 'boolean', description: 'what its entries may contain: creates schemas/<section>.ts' },
    'copy': { type: 'boolean', description: 'with --schema: a complete copy of a built-in schema, instead of additions to it' },
    'dry-run': { type: 'boolean', description: 'show what would be written, write nothing' },
    'yes': { type: 'boolean', description: 'do not ask for confirmation' },
  },
  project: true,
  help: run => `
  ${run.bin('vitakit', 'customize teaching --schema')}          add fields to a built-in section
  ${run.bin('vitakit', 'customize teaching --schema --copy')}   take over its whole definition
  ${run.bin('vitakit', 'customize publications')}               groups, badges and fields of publications

For a built-in section, --schema creates schemas/<section>.ts that keeps all of
vitakit's fields and adds yours; \`${run.bin('vitakit', 'add field <section> <name>')}\`
does this for you when it adds the first field. --copy copies the complete
built-in definition instead, for removing or rewriting its rules -- improvements
to it in vitakit will then not reach you.

An existing schema is never replaced.`,

  async run(context, { positionals, values }) {
    const id = positionals[0]!
    if (values.copy && !values.schema && id !== 'publications') throw new UsageError('--copy goes with --schema', 'customize')
    if (values.schema || id === 'publications') return customizeSchema(context, id, values)
    throw new UsageError(`what about ${id}? --schema (what its entries may contain)`, 'customize')
  },
}
