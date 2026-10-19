import { join } from 'node:path'
import type { FieldDescription } from '../../fields'
import type { Inventory, SectionInventory } from '../../inventory'
import { CommandError, UsageError, type CommandContext, type CommandSpec, type ParsedArgs } from '../command'
import { asking, finish } from '../finish'
import type { Workspace } from '../plan'

type Values = ParsedArgs['values']
interface Notes { before: string[], after: string[] }

const strings = (value: Values[string]): string[] => (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(String)
const pascal = (id: string) => id.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')

// Schema ----------------------------------------------------------------------

async function planSchema(context: CommandContext, ws: Workspace, inv: Inventory, id: string, values: Values, notes: Notes): Promise<void> {
  const { run } = context
  const { extensionModule } = await import('../authoring')
  const { builtinSchemaSource } = await import('../schema-source')
  const { schemas } = await import('../../schemas')
  const path = `schemas/${id}.ts`

  if (id === 'publications') {
    if (ws.exists(path)) {
      notes.after.push(`${path} is yours already: its groups, badges and fields decide how content/publications.bib is grouped and linked.`)
      return
    }
    ws.create(path, await builtinSchemaSource('publications'), 'vitakit\'s publication groups, badges and fields, to change')
    notes.before.push('The website, `vitakit verify` and the PDF all read it from now on.')
    notes.after.push(`Edit ${path}: change groups, add badges, pass on BibTeX fields. Check it: \`${run.bin('vitakit', 'validate')}\``)
    return
  }

  const section = inv.sections.find(candidate => candidate.id === id)
  if (section?.schema.origin === 'local') {
    notes.after.push(`${path} is yours already${section.schema.sharedWith ? `; it uses the schema of ${section.schema.sharedWith}` : ''}. Edit it, or add a field with \`${run.bin('vitakit', `add field ${id} <name>`)}\`.`)
    return
  }
  if (!Object.hasOwn(schemas, id)) {
    throw new CommandError(`${id} has no schema yet; \`${run.bin('vitakit', `add section ${id}`)}\` drafts one from its entries`)
  }
  if (values.copy) {
    ws.create(path, await builtinSchemaSource(id), `vitakit's complete ${id} definition, yours from now on`)
    notes.before.push(
      'A complete copy: change or remove any rule. Improvements to vitakit\'s',
      `${id} fields will not reach you; without --copy, you would keep them and only add.`,
    )
  } else {
    ws.create(path, extensionModule(id, [], []), `keeps vitakit's ${id} fields; yours go below them`, { show: true })
    notes.before.push(
      `Your fields are added to vitakit's, which stay as they are and keep improving.`,
      `To remove or rewrite built-in rules instead: \`${run.bin('vitakit', `customize ${id} --schema --copy`)}\``,
    )
  }
  notes.after.push(`Add a field: \`${run.bin('vitakit', `add field ${id} <name>`)}\`. Check: \`${run.bin('vitakit', `validate ${id}`)}\``)
}

// Website ---------------------------------------------------------------------

async function planWeb(context: CommandContext, ws: Workspace, inv: Inventory, section: SectionInventory, fields: FieldDescription[], list: boolean, values: Values, notes: Notes): Promise<void> {
  const { io, run } = context
  const { entryComponent, listComponent } = await import('../snippets')
  const { useComponentForSection } = await import('../../edit/vue')
  const { planPlaceOnPage } = await import('../authoring')
  const prompt = await import('../prompt')
  const id = section.id
  const interactive = asking(context, values)

  // Already shown by a component of the user's: add to it, by hand.
  const current = [...new Set(inv.web.placements
    .filter(placement => placement.section === id && inv.web.components.has(placement.component))
    .map(placement => placement.component))]
  if (current.length === 1 && !values.use && !values.component && !values.force && values.list === undefined) {
    const { webFieldSnippet } = await import('../snippets')
    const file = inv.web.components.get(current[0]!)!
    const existing = (await ws.read(file)) ?? ''
    const missing = fields.map(field => webFieldSnippet(field)).filter(snippet => !existing.includes(snippet.markup))
    if (!fields.length) notes.after.push(`${id} is shown by ${file} already, which is yours. --force starts over, keeping it as a backup.`)
    else if (!missing.length) ws.keep(file, `shows ${fields.map(field => field.path).join(', ')} already`)
    else {
      const imports = [...new Set(missing.flatMap(snippet => snippet.imports))]
      ws.paste(file, [...missing.map(snippet => snippet.markup), ...(imports.length ? ['', `import { ${imports.join(', ')} } from '@anja.codes/vitakit/shared'`] : [])].join('\n'),
        'is yours already; add these lines where the entry\'s lines are, e.g. in its #note slot')
    }
    return
  }

  let component = values.use as string | undefined
  if (component) {
    if (!inv.web.components.has(component)) {
      throw new CommandError(`--use ${component}: no app/components/${component}.vue; the components are ${[...inv.web.components.keys()].join(', ') || '(none)'}`)
    }
  } else {
    const fallback = `${pascal(id)}${list ? 'List' : 'Section'}`
    component = (values.component as string | undefined) ?? (interactive ? await prompt.input(io, 'Name of the component', fallback) : fallback)
    if (!/^[A-Z][A-Za-z0-9]*$/.test(component)) throw new CommandError(`"${component}" cannot be a component name; use PascalCase, like TalkList`)
    if (component.startsWith('Vita')) throw new CommandError(`"${component}" would replace vitakit's own component; choose a name that does not start with Vita`)
    const path = `app/components/${component}.vue`
    const region = (values.region as string | undefined) ?? 'note'
    if (region !== 'note' && region !== 'meta') throw new UsageError('--region note or --region meta', 'customize')
    let groupBy = values['group-by'] as string | undefined
    if (list && groupBy === undefined && interactive) {
      groupBy = (await prompt.input(io, 'Group the entries by a field, e.g. term? (Enter for no groups)')) || undefined
    }
    if (groupBy && !section.fields?.some(field => field.path === groupBy)) {
      throw new CommandError(`--group-by ${groupBy}: ${id} has no such field; its fields are ${section.fields?.map(field => field.path).join(', ')}`)
    }
    const source = list ? listComponent(id, component, section.fields ?? [], groupBy) : entryComponent(id, component, fields, region)
    const reason = list ? `${id} as your own list${groupBy ? `, grouped by ${groupBy}` : ''}, with a line for each field` : `${id} through VitaSection, with your own ${region} line${fields.length ? ` showing ${fields.map(field => field.path).join(', ')}` : ''}`
    if (ws.exists(path)) {
      if (!values.force) throw new CommandError(`${path} exists. \`--use ${component}\` shows ${id} with it; --force replaces it, keeping yours as a backup.`)
      ws.replace(path, source, `${reason}; yours is kept next to it as a .backup`, { show: true })
    } else {
      ws.create(path, source, reason, { show: true })
    }
  }

  // Pages: the section's elements get the component.
  const placements = inv.web.placements.filter(placement => placement.section === id)
  const files = [...new Set(placements.filter(placement => placement.component !== 'code').map(placement => placement.file))]
  const known = [...inv.web.components.keys(), component]
  for (const file of files) {
    const source = (await ws.read(file))!
    const result = useComponentForSection(source, id, component, known)
    if (result.ok && result.value.changed.length) await ws.edit(file, result.value.source, `shows ${id} with ${component}`)
    else if (result.ok) ws.keep(file, `shows ${id} with ${component} already`)
    else ws.paste(file, `<${component} id="${id}" />`, `cannot be changed safely (${result.reason}); use this where ${id} should appear`)
  }
  for (const placement of placements.filter(candidate => candidate.component === 'code')) {
    notes.before.push(`${placement.file}:${placement.line} uses useSection('${id}') in code; that is left as it is.`)
  }

  let routes = strings(values.page)
  if (!files.length && !routes.length && interactive) {
    const pages = inv.pages.filter(page => page.vue)
    const route = await prompt.choose(io, `${id} is on no page yet. Show it on which page?`, [
      ...pages.map(page => ({ label: `${page.route}  (${page.vue})`, value: page.route })),
      { label: 'not now', value: '' },
    ], Math.max(0, pages.findIndex(page => page.route === '/cv/')))
    if (route) routes = [route]
  }
  for (const route of routes) {
    const page = inv.pages.find(candidate => candidate.route === (route.endsWith('/') ? route : `${route}/`))
    if (!page?.vue) throw new CommandError(`--page ${route}: no Vue page has this route`)
    await planPlaceOnPage(ws, inv, page.vue, { id, title: prompt.headingFor(id), component })
  }
  if (!files.length && !routes.length) {
    notes.before.push(`${id} is on no page. Show it with <${component} id="${id}" title="${prompt.headingFor(id)}" />, or --page /cv/.`)
  }
  notes.after.push(`Edit app/components/${component}.vue; \`${run.script('dev')}\` shows every change as you save.`)
}

// PDF -------------------------------------------------------------------------

async function planPdf(context: CommandContext, ws: Workspace, inv: Inventory, id: string, fields: FieldDescription[], values: Values, notes: Notes): Promise<void> {
  const { io, run, root } = context
  const { resolveTemplate } = await import('../../tex/emit')
  const { etaFieldSnippet } = await import('../snippets')
  const { addToEntryLoop } = await import('../../edit/eta')
  const prompt = await import('../prompt')
  const templateDir = join(root, 'cv-tex', 'templates')
  const path = `cv-tex/templates/${id}.eta`
  const lines = fields.map(field => etaFieldSnippet(field))

  if (!inv.documents.length) throw new CommandError('there are no PDF documents in cv-tex/')
  if (id === 'publications' && fields.length) throw new CommandError('publications are formatted by biblatex; --field does not apply')

  let from = values.from as string | undefined
  if (!from && !ws.exists(path) && asking(context, values)) {
    const section = inv.sections.find(candidate => candidate.id === id)
    const relatives = inv.sections.filter(candidate => candidate.id !== id && (
      candidate.id === section?.schema.sharedWith || candidate.schema.sharedWith === id
      || (section?.schema.sharedWith !== undefined && candidate.schema.sharedWith === section.schema.sharedWith)))
    const withTemplate = relatives.find(candidate => ws.exists(`cv-tex/templates/${candidate.id}.eta`))
    if (withTemplate && await prompt.confirm(io, `\n${id} has the fields of ${withTemplate.id}, which has its own template. Start from a copy of it?`)) from = withTemplate.id
  }

  if (ws.exists(path) && !values.force) {
    const existing = (await ws.read(path)) ?? ''
    const missing = lines.filter(line => !existing.includes(line))
    if (lines.length && !missing.length) {
      ws.keep(path, `shows ${fields.map(field => field.path).join(', ')} already`)
      return
    }
    if (!missing.length) {
      notes.after.push(`${path} is yours already. \`${run.bin('vitakit', `explain ${id} --field <name>`)}\` shows lines to add for a field; --force starts over, keeping yours as a backup.`)
      return
    }
    ws.paste(path, missing.join('\n'), 'is yours already; add these lines inside its loop over the entries, where the notes are')
    return
  }

  let source: string
  let reason: string
  if (from) {
    const copied = await ws.read(`cv-tex/templates/${from}.eta`)
    if (copied === undefined) throw new CommandError(`--from ${from}: there is no cv-tex/templates/${from}.eta to copy`)
    source = `<%/* A copy of ${from}.eta: the two are separate files from now on. */%>\n${copied}`
    reason = `a copy of your ${from}.eta`
  } else {
    const template = await resolveTemplate(id, templateDir, { exclude: join(templateDir, `${id}.eta`) })
    source = template.source
    reason = template.origin === 'local'
      ? 'a copy of your _generic.eta'
      : template.generic ? 'a copy of vitakit\'s generic template' : `a copy of vitakit's ${id}.eta`
  }
  if (lines.length) {
    const added = addToEntryLoop(source, lines)
    if (added.ok) {
      source = added.value
      reason += `, with ${fields.map(field => field.path).join(', ')}`
    } else {
      ws.paste(path, lines.join('\n'), `add these lines inside the loop over the entries (${added.reason})`)
    }
  }
  if (ws.exists(path)) ws.replace(path, source, `${reason}; yours is kept next to it as a .backup`, { show: true })
  else ws.create(path, source, reason, { show: true })

  const included = inv.documents.filter(document => document.placements.some(placement => placement.section === id))
  if (!included.length) notes.before.push(`No PDF document includes ${id} yet: \`${run.bin('vitakit', `add section ${id} --document ${inv.documents[0]!.name}`)}\``)
  if (id === 'publications') {
    notes.before.push('This template groups the references; how each one is formatted is up to biblatex, in cv-tex/preamble.tex.')
  }
  notes.after.push(`Edit ${path}; \`${run.bin('vitakit', `validate ${id}`)}\` checks it without LaTeX, \`${run.bin('vitakit', 'pdf')}\` builds.`)
}

// Command ---------------------------------------------------------------------

async function selectFields(context: CommandContext, section: SectionInventory | undefined, values: Values, ask: boolean): Promise<FieldDescription[]> {
  const all = section?.fields ?? []
  const requested = strings(values.field)
  const unknown = requested.filter(name => !all.some(field => field.path === name))
  if (unknown.length) {
    throw new CommandError(`${section?.id ?? 'this section'} has no field ${unknown.join(', ')}; its fields are ${all.map(field => field.path).join(', ') || '(unknown)'}`)
  }
  if (requested.length || !ask || !all.length) return all.filter(field => requested.includes(field.path))
  const { fieldsNotShown } = await import('../authoring')
  const { input } = await import('../prompt')
  const hidden = fieldsNotShown(all)
  context.io.out(`\nFields of ${section!.id}: ${all.map(field => field.path).join(', ')}${hidden.length ? `\nNot shown by the standard layout: ${hidden.join(', ')}` : ''}\n`)
  const answer = await input(context.io, 'Which fields should it show? (separated by commas, - for none)', hidden.join(', ') || '-')
  const chosen = answer === '-' ? [] : answer.split(',').map(name => name.trim()).filter(Boolean)
  const missing = chosen.filter(name => !all.some(field => field.path === name))
  if (missing.length) throw new CommandError(`${section!.id} has no field ${missing.join(', ')}`)
  return all.filter(field => chosen.includes(field.path))
}

export const customize: CommandSpec = {
  name: 'customize',
  summary: 'make one section yours: how it looks on the website and in the PDF, what it may contain',
  positionals: [{ name: 'section', required: true }],
  options: {
    'web': { type: 'boolean', description: 'how it looks on the website: a component of your own' },
    'pdf': { type: 'boolean', description: 'how it looks in the PDF: cv-tex/templates/<section>.eta' },
    'schema': { type: 'boolean', description: 'what its entries may contain: schemas/<section>.ts' },
    'field': { type: 'string', multiple: true, value: '<name>', description: 'show this field (repeatable)' },
    'list': { type: 'boolean', description: 'web: your own list markup, for grouping or numbering' },
    'group-by': { type: 'string', value: '<field>', description: 'web, with --list: one group per value of this field, e.g. term' },
    'region': { type: 'string', value: 'note|meta', description: 'web: the line of each entry the fields go on (note)' },
    'component': { type: 'string', value: '<Name>', description: 'web: the component\'s name; <Section>Section by default' },
    'use': { type: 'string', value: '<Name>', description: 'web: show it with a component you have already' },
    'page': { type: 'string', multiple: true, value: '<route>', description: 'web: also show it on this page' },
    'from': { type: 'string', value: '<section>', description: 'pdf: start from a copy of that section\'s template' },
    'copy': { type: 'boolean', description: 'schema: a complete copy of a built-in schema, instead of additions' },
    'force': { type: 'boolean', description: 'replace your component or template; yours is kept as a backup' },
    'dry-run': { type: 'boolean', description: 'show what would be written, write nothing' },
    'yes': { type: 'boolean', description: 'ask nothing: use the options given and write' },
  },
  project: true,
  help: run => `
  ${run.bin('vitakit', 'customize grants')}                              asks what to change
  ${run.bin('vitakit', 'customize grants --web --pdf --field amount')}   show a field in both
  ${run.bin('vitakit', 'customize talks --web --list --component TalkList')}
  ${run.bin('vitakit', 'customize talks-public --web --use TalkList')}   reuse a component
  ${run.bin('vitakit', 'customize teaching --schema')}                   add fields to a built-in section
  ${run.bin('vitakit', 'customize publications --schema')}               groups, badges and fields

On the website, a section is shown by a component. --web creates one of your
own in app/components/ -- either around VitaSection, which keeps vitakit's list
and changes one line of every entry, or (--list) with a list of its own -- and
uses it everywhere the section appears. One component can show several
sections with the same fields (--use).

In the PDF, a section is written by a template. --pdf copies the one in use to
cv-tex/templates/<section>.eta, where yours wins.

With --field, the new files show those fields. Files you have already are
never replaced without --force; for them, \`${run.bin('vitakit', 'explain <section> --field <name>')}\`
prints lines to add.`,

  async run(context, { positionals, values }) {
    const id = positionals[0]!
    const { io, root } = context
    const interactive = asking(context, values)
    let web = values.web === true
    let pdf = values.pdf === true
    let schema = values.schema === true
    const webOnly = ['list', 'group-by', 'region', 'component', 'use', 'page'].filter(name => values[name] !== undefined)
    if (webOnly.length && !web) throw new UsageError(`--${webOnly[0]} goes with --web`, 'customize')
    if (values['group-by'] !== undefined && !values.list) throw new UsageError('--group-by goes with --list', 'customize')
    if (values.from !== undefined && !pdf) throw new UsageError('--from goes with --pdf', 'customize')
    if (values.copy && !schema) throw new UsageError('--copy goes with --schema', 'customize')

    // `customize publications` is about its groups, as the scaffold's comments say.
    if (!web && !pdf && !schema && id === 'publications') schema = true
    if (!web && !pdf && !schema) {
      if (!interactive) throw new UsageError(`what about ${id}? --web, --pdf or --schema`, 'customize')
      const { choose } = await import('../prompt')
      const choice = await choose(io, `What do you want to change about ${id}?`, [
        { label: 'how it looks on the website', value: 'web' },
        { label: 'how it looks in the PDF', value: 'pdf' },
        { label: 'how it looks on the website and in the PDF', value: 'both' },
        { label: 'which fields its entries may have', value: 'schema' },
      ])
      web = choice === 'web' || choice === 'both'
      pdf = choice === 'pdf' || choice === 'both'
      schema = choice === 'schema'
    }

    const { inventory } = await import('../../inventory')
    const { Workspace } = await import('../plan')
    const inv = await inventory(root)
    const ws = new Workspace(root)
    const notes: Notes = { before: [], after: [] }

    if (id === 'publications' && web) {
      throw new CommandError('publications are shown by VitaPublications and VitaPublication: `vitakit eject VitaPublication` changes how one reference looks, `vitakit eject VitaPublications` the whole list')
    }
    const section = inv.sections.find(candidate => candidate.id === id)
    if (!section && id !== 'publications' && (web || pdf || !(await import('../../schemas')).schemas[id as 'talks'])) {
      throw new CommandError(`no section called "${id}"; the sections are ${inv.sections.map(candidate => candidate.id).join(', ') || '(none)'}`)
    }
    if (section?.problems.length && (web || pdf)) {
      notes.before.push(`${section.where} has problems; \`vitakit validate ${id}\` lists them. The new files work once it is valid.`)
    }

    if (schema) await planSchema(context, ws, inv, id, values, notes)
    let list = values.list === true
    if (web && !values.use && values.list === undefined && interactive) {
      const { choose } = await import('../prompt')
      list = await choose(io, 'What do you want to change on the website?', [
        { label: 'how each entry reads (title, details, links); vitakit keeps the list', value: false },
        { label: 'how the list is organised (grouping, numbering, badges); the list is yours', value: true },
      ])
    }
    const fields = web || pdf ? await selectFields(context, section, values, interactive && (pdf || (web && !list && !values.use))) : []
    if (web) await planWeb(context, ws, inv, section!, fields, list, values, notes)
    if (pdf) await planPdf(context, ws, inv, id, fields, values, notes)
    return finish(context, ws, values, notes)
  },
}
