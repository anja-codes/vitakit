import type { FieldDescription, FieldType } from '../../fields'
import type { Inventory, SectionInventory } from '../../inventory'
import { CommandError, UsageError, type CommandContext, type CommandSpec, type ParsedArgs } from '../command'
import type { Workspace } from '../plan'
import { asking, finish } from '../finish'

type Values = ParsedArgs['values']

const SECTION_OPTIONS = ['page', 'document', 'title', 'after', 'like']
const FIELD_OPTIONS = ['type', 'several', 'required', 'choice']
const PAGE_OPTIONS = ['title', 'no-menu']
const COMMON = ['help', 'root', 'no-color', 'dry-run', 'yes']

function onlyOptions(kind: string, values: Values, allowed: string[]): void {
  const wrong = Object.keys(values).filter(name => values[name] !== undefined && ![...COMMON, ...allowed].includes(name))
  if (wrong.length) throw new UsageError(`--${wrong[0]} does not apply to add ${kind}`, 'add')
}

const strings = (value: Values[string]): string[] => (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(String)


// add section ---------------------------------------------------------------

async function planSchema(
  context: CommandContext,
  ws: Workspace,
  inv: Inventory,
  id: string,
  section: SectionInventory | undefined,
  entries: unknown[],
  values: Values,
): Promise<{ fields?: FieldDescription[], changes: string[], notes: string[] }> {
  const { matchingSchemas, sharedSchemaModule } = await import('../authoring')
  const { draftSchema } = await import('../../draft')
  const { describeSection } = await import('../../fields')
  const { confirm } = await import('../prompt')
  const notes: string[] = []

  let like = values.like as string | undefined
  if (like) {
    const other = inv.sections.find(candidate => candidate.id === like)
    if (!other || other.schema.origin === 'none') throw new CommandError(`--like ${like}: no section "${like}" with a schema`)
  } else if (section && entries.length) {
    const matches = await matchingSchemas(context.root, inv, id, entries)
    if (matches.length && asking(context, values)) {
      if (await confirm(context.io, `\nThe entries of ${section.where} fit the schema of ${matches[0]}. Use the same schema?`)) like = matches[0]
    } else if (matches.length) {
      notes.push(`Its entries fit the schema of ${matches[0]}: --like ${matches[0]} would share it.`)
    }
  }

  const path = `schemas/${id}.ts`
  if (like) {
    const other = inv.sections.find(candidate => candidate.id === like)!
    ws.create(path, sharedSchemaModule(id, other), `the same fields as ${like}`, { show: true })
    return { ...(other.fields ? { fields: other.fields } : {}), changes: [], notes }
  }
  const file = section?.where ?? `content/${id}.yml`
  const draft = draftSchema(id, entries, { file })
  ws.create(path, draft.source, section ? `drafted from the ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} in ${file}; check its comments` : 'date, title and note; change it to fit', { show: true })
  return { fields: describeSection(draft.schema) ?? [], changes: draft.changes, notes }
}

async function addSection(context: CommandContext, id: string, values: Values): Promise<number> {
  const { io, run, root } = context
  const { sectionNameProblem } = await import('../../sections')
  const problem = sectionNameProblem(id)
  if (problem) throw new CommandError(problem)
  if (id === 'publications') throw new CommandError('publications come from content/publications.bib; `vitakit customize publications` changes their groups')

  const { inventory } = await import('../../inventory')
  const { Workspace } = await import('../plan')
  const authoring = await import('../authoring')
  const { schemas } = await import('../../schemas')
  const { describeSection } = await import('../../fields')
  const { countsText } = await import('../describe')
  const prompt = await import('../prompt')

  const inv = await inventory(root)
  const ws = new Workspace(root)
  const section = inv.sections.find(candidate => candidate.id === id)
  const builtIn = Object.hasOwn(schemas, id)
  const interactive = asking(context, values)

  // Data, and what it may contain
  let entries: unknown[] = []
  let schemaResult: { fields?: FieldDescription[], changes: string[], notes: string[] } = { changes: [], notes: [] }
  if (section) {
    try {
      entries = authoring.rawEntries((await ws.read(section.where)) ?? '')
    } catch (error) {
      throw new CommandError(`${section.where}: ${error instanceof Error ? error.message : String(error)}`)
    }
    ws.keep(section.where, countsText(section) || 'your entries')
  }
  if (section?.schema.origin === 'local') {
    ws.keep(section.schema.file!, section.schema.sharedWith ? `the schema of ${section.schema.sharedWith}` : 'your schema')
    schemaResult = { ...(section.fields ? { fields: section.fields } : {}), changes: [], notes: [] }
  } else if (builtIn) {
    schemaResult = { fields: describeSection(schemas[id as keyof typeof schemas]) ?? [], changes: [], notes: [] }
  } else {
    if (!section) {
      const like = values.like as string | undefined
      const other = like ? inv.sections.find(candidate => candidate.id === like) : undefined
      if (other?.fields) ws.create(`content/${id}.yml`, authoring.dataExample(id, other.fields), 'empty for now, with an example entry as a comment')
      else {
        ws.create(`content/${id}.yml`, authoring.dataStarter(id), 'one example entry, to replace')
        entries = authoring.STARTER_ENTRIES
      }
    }
    schemaResult = await planSchema(context, ws, inv, id, section, entries, values)
  }
  if (!section && builtIn) {
    ws.create(`content/${id}.yml`, authoring.dataExample(id, schemaResult.fields ?? []), `empty for now; vitakit already knows the ${id} fields`)
  }

  // Where it appears
  const { webPlacementsOf, pdfPlacementsOf } = await import('../describe')
  const shownOn = new Set(webPlacementsOf(inv, id).map(placement => placement.file))
  const inDocuments = new Set(pdfPlacementsOf(inv, id).map(placement => placement.document))
  const vuePages = inv.pages.filter(page => page.vue)
  let title = values.title as string | undefined
  const after = values.after as string | undefined
  const pages: { route: string, after?: string }[] = strings(values.page).map(route => ({ route: route.endsWith('/') ? route : `${route}/`, ...(after ? { after } : {}) }))
  const documents: { name: string, after?: string }[] = strings(values.document).map(name => ({ name, ...(after ? { after } : {}) }))

  if (interactive && !pages.length && !documents.length) {
    const candidates = vuePages.filter(page => !shownOn.has(page.vue!))
    const newRoute = `/${id}/`
    const choices = [
      ...candidates.map(page => ({ label: `${page.route}  (${page.vue})`, value: page.route })),
      ...(inv.pages.some(page => page.route === newRoute) ? [] : [{ label: `a new page, ${newRoute}`, value: newRoute }]),
      { label: shownOn.size ? `nowhere else (already on ${[...shownOn].join(', ')})` : 'not on the website, for now', value: '' },
    ]
    const preferred = Math.max(0, choices.findIndex(choice => choice.value === '/cv/'))
    const route = await prompt.choose(io, `Show ${id} on which page of your website?`, choices, preferred)
    if (route) {
      const existing = inv.web.placements.filter(placement => placement.route === route && placement.component !== 'code')
      let position: string | undefined
      if (existing.length) {
        position = await prompt.choose(io, 'After which section?', [
          ...existing.map(placement => ({ label: placement.section, value: placement.section })),
        ], existing.length - 1)
      }
      pages.push({ route, ...(position ? { after: position } : {}) })
    }
    for (const document of inv.documents.filter(candidate => !inDocuments.has(candidate.name))) {
      if (!await prompt.confirm(io, `\nInclude ${id} in the PDF ${document.tex}?`, true)) continue
      const existing = document.placements
      const position = existing.length
        ? await prompt.choose(io, 'After which section?', existing.map(placement => ({ label: placement.section, value: placement.section })), existing.length - 1)
        : undefined
      documents.push({ name: document.name, ...(position ? { after: position } : {}) })
    }
    if ((pages.length || documents.length) && title === undefined) title = await prompt.input(io, '\nHeading', prompt.headingFor(id))
  }
  title ??= prompt.headingFor(id)

  for (const page of pages) {
    let path = vuePages.find(candidate => candidate.route === page.route)?.vue
    if (!path) {
      const name = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/.exec(page.route)?.[1]
      if (!name || inv.pages.some(candidate => candidate.route === page.route)) {
        throw new CommandError(`--page ${page.route}: no Vue page has this route${name ? '' : '; a new page needs a route like /talks/'}`)
      }
      path = await authoring.planCreatePage(ws, inv, name, { title: page.route === `/${id}/` ? title : prompt.headingFor(name), menu: true })
    }
    await authoring.planPlaceOnPage(ws, inv, path, { id, title, ...(page.after ? { after: page.after } : {}) })
  }
  for (const document of documents) {
    if (!inv.documents.some(candidate => candidate.name === document.name)) {
      throw new CommandError(`--document ${document.name}: no cv-tex/${document.name}.tex; the documents are ${inv.documents.map(candidate => candidate.name).join(', ') || '(none)'}`)
    }
    await authoring.planPlaceInDocument(ws, document.name, { id, title, ...(document.after ? { after: document.after } : {}) })
  }

  // What the user should know before and after
  const before = [...schemaResult.notes]
  if (schemaResult.changes.length) {
    before.push(`The drafted schema does not accept every entry yet. In ${section?.where ?? `content/${id}.yml`}, change:`)
    before.push(...schemaResult.changes.slice(0, 12).map(change => `  ${change}`))
    if (schemaResult.changes.length > 12) before.push(`  … and ${schemaResult.changes.length - 12} more`)
  }
  if (!pages.length && !shownOn.size) before.push(`Not on the website: \`${run.bin('vitakit', `add section ${id} --page /cv/`)}\` adds it to a page later.`)
  if (!documents.length && !inDocuments.size && inv.documents.length) before.push(`Not in a PDF: \`${run.bin('vitakit', `add section ${id} --document ${inv.documents[0]!.name}`)}\` adds it later.`)

  const next: string[] = []
  if (!section) next.push(`Write your entries in content/${id}.yml.`)
  if (schemaResult.changes.length) next.push(`Then check them: \`${run.bin('vitakit', `validate ${id}`)}\``)
  const hidden = authoring.fieldsNotShown(schemaResult.fields)
  if (hidden.length && (pages.length || documents.length || shownOn.size || inDocuments.size)) {
    next.push(`Accepted, but not shown by the standard layout: ${hidden.join(', ')}. To show them: \`${run.bin('vitakit', `customize ${id} --web --pdf ${hidden.map(name => `--field ${name}`).join(' ')}`)}\``)
  }
  return finish(context, ws, values, { before, after: next })
}

// add field -----------------------------------------------------------------

async function addField(context: CommandContext, id: string, name: string, values: Values): Promise<number> {
  const { io, run, root } = context
  const { inventory } = await import('../../inventory')
  const { Workspace } = await import('../plan')
  const authoring = await import('../authoring')
  const { schemas } = await import('../../schemas')
  const { describeSection, FIELD_TYPE_NAMES } = await import('../../fields')
  const prompt = await import('../prompt')

  if (!/^[A-Za-z_][\w-]*$/.test(name)) throw new CommandError(`"${name}" cannot be a field name; use letters and digits, like evaluationScore`)
  if (name === 'visibility' || name === 'id') throw new CommandError(`"${name}" is a field every entry has already`)

  const inv = await inventory(root)
  let section = inv.sections.find(candidate => candidate.id === id)
  const builtIn = Object.hasOwn(schemas, id)
  if (!section && builtIn) {
    section = { id, where: `content/${id}.yml`, schema: { origin: 'built-in' }, fields: describeSection(schemas[id as keyof typeof schemas]) ?? [], problems: [] }
  }
  if (!section) throw new CommandError(`no section called "${id}"; the sections are ${inv.sections.map(candidate => candidate.id).join(', ') || '(none)'}`)
  if (section.schema.origin === 'none') throw new CommandError(`${id} has no schema yet; \`${run.bin('vitakit', `add section ${id}`)}\` drafts one from its entries`)
  if (section.schema.sharedWith) {
    throw new CommandError(`${id} uses the schema of ${section.schema.sharedWith} (schemas/${id}.ts). Add the field there, for both: \`${run.bin('vitakit', `add field ${section.schema.sharedWith} ${name}`)}\``)
  }
  const existing = section.fields?.find(field => field.path === name)
  if (existing) {
    const { fieldSummary } = await import('../../fields')
    io.out(`${id} has a field ${name} already: ${fieldSummary(existing)}. Nothing to do.\n`)
    return 0
  }

  const interactive = asking(context, values)
  let type = values.type as FieldType | undefined
  const known = authoring.FIELD_TYPES.map(entry => entry.type)
  if (type !== undefined && !known.includes(type)) throw new UsageError(`--type ${type}: one of ${known.join(', ')}`, 'add')
  if (type === undefined) {
    if (!interactive) throw new UsageError(`which type? --type ${known.join('|')}`, 'add')
    type = await prompt.choose(io, `What kind of value is "${name}"?`, authoring.FIELD_TYPES.map(entry => ({ label: entry.label, value: entry.type })))
  }
  let choices = strings(values.choice)
  if (type === 'choice' && !choices.length) {
    if (!interactive) throw new UsageError('a choice needs its values: --choice <value>, once per value', 'add')
    choices = (await prompt.input(io, 'The allowed values, separated by commas')).split(',').map(choice => choice.trim()).filter(Boolean)
  }
  const several = values.several === true || (values.several === undefined && interactive && await prompt.confirm(io, 'Can an entry have several?', false))
  const required = values.required === true || (values.required === undefined && interactive && await prompt.confirm(io, 'Should every entry have it?', false))

  const ws = new Workspace(root)
  const outcome = await authoring.planAddField(ws, section, name, { type, several, required, choices })
  const before: string[] = []
  const entries = section.entries ?? 0
  if (required && entries) before.push(`Required: the ${entries} entries in ${section.where} need it before they are valid again.`)
  const example = authoring.exampleValue({ type, several, choices })
  const after = [
    `Next: give entries in ${section.where} the new field, e.g.`,
    `    ${name}: ${example}`,
    ...(outcome === 'pasted' ? [] : [`It is accepted now, not shown yet (${FIELD_TYPE_NAMES[type]}). To show it: \`${run.bin('vitakit', `customize ${id} --web --pdf --field ${name}`)}\``]),
  ]
  return finish(context, ws, values, { before, after })
}

// add page ------------------------------------------------------------------

async function addPage(context: CommandContext, name: string, values: Values): Promise<number> {
  const { io, run, root } = context
  const { inventory } = await import('../../inventory')
  const { Workspace } = await import('../plan')
  const authoring = await import('../authoring')
  const prompt = await import('../prompt')

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new CommandError(`"${name}" must be lowercase kebab-case, e.g. research-interests; it becomes the address /${name}/`)
  const inv = await inventory(root)
  const interactive = asking(context, values)
  const title = (values.title as string | undefined) ?? (interactive ? await prompt.input(io, 'Title', prompt.headingFor(name)) : prompt.headingFor(name))
  const menu = values['no-menu'] !== true && (!interactive || await prompt.confirm(io, 'Add it to the menu?', true))

  const ws = new Workspace(root)
  await authoring.planCreatePage(ws, inv, name, { title, menu })
  return finish(context, ws, values, {
    after: [
      `The page is /${name}/. Write its text in content/pages/${name}.md;`,
      `add sections to it with \`${run.bin('vitakit', `add section <name> --page /${name}/`)}\`.`,
    ],
  })
}

export const add: CommandSpec = {
  name: 'add',
  summary: 'add a section, a field of a section, or a website page',
  positionals: [{ name: 'what', required: true }, { name: 'name' }, { name: 'field' }],
  options: {
    'page': { type: 'string', multiple: true, value: '<route>', description: 'section: show it on this page, e.g. /cv/ (repeatable)' },
    'document': { type: 'string', multiple: true, value: '<name>', description: 'section: include it in this PDF document, e.g. cv (repeatable)' },
    'after': { type: 'string', value: '<section>', description: 'section: place it after this section' },
    'title': { type: 'string', value: '<text>', description: 'section: its heading; page: its title' },
    'like': { type: 'string', value: '<section>', description: 'section: use the schema of another section' },
    'type': { type: 'string', value: '<type>', description: 'field: text, formatted-text, number, yes-no, date, web-address, link or choice' },
    'several': { type: 'boolean', description: 'field: an entry may have a list of values' },
    'required': { type: 'boolean', description: 'field: every entry must have it' },
    'choice': { type: 'string', multiple: true, value: '<value>', description: 'field: an allowed value of a choice (repeatable)' },
    'no-menu': { type: 'boolean', description: 'page: do not add it to the menu' },
    'dry-run': { type: 'boolean', description: 'show what would be written, write nothing' },
    'yes': { type: 'boolean', description: 'ask nothing: use the options given and write' },
  },
  project: true,
  usage: run => [
    run.bin('vitakit', 'add section <name> [options]'),
    run.bin('vitakit', 'add field <section> <name> [options]'),
    run.bin('vitakit', 'add page <name> [options]'),
  ],
  help: run => `
A section is a file content/<name>.yml. \`add section\` creates what is missing:
the file, a schema drafted from your entries (or one of another section, with
--like), and its place on a website page and in a PDF document -- one line in
each, after the section you choose.

  ${run.bin('vitakit', 'add section grants')}
  ${run.bin('vitakit', 'add section grants --page /cv/ --document cv --after education --yes')}
  ${run.bin('vitakit', 'add section talks-public --like talks')}

\`add field\` lets a section accept one more field. For a built-in section it
creates schemas/<section>.ts, which keeps all of vitakit's fields:

  ${run.bin('vitakit', 'add field teaching evaluation --type number')}
  ${run.bin('vitakit', 'add field talks audience --type choice --choice school --choice public')}

\`add page\` creates a website page that can show sections, with its text in
content/pages/<name>.md, and adds it to the menu:

  ${run.bin('vitakit', 'add page talks --title Talks')}

Everything is shown before it is written, and asked; nothing existing is
replaced. A file that cannot be changed safely gets a line to paste instead.`,

  async run(context, { positionals, values }) {
    const [what, name, field] = positionals
    if (what === 'section' || what === 'page') {
      if (!name) throw new UsageError(`missing <name>: \`add ${what} <name>\``, 'add')
      if (field !== undefined) throw new UsageError(`unexpected argument "${field}"`, 'add')
      onlyOptions(what, values, what === 'section' ? SECTION_OPTIONS : PAGE_OPTIONS)
      return what === 'section' ? addSection(context, name, values) : addPage(context, name, values)
    }
    if (what === 'field') {
      if (!name || !field) throw new UsageError('`add field <section> <name>`, e.g. add field teaching evaluation', 'add')
      onlyOptions(what, values, FIELD_OPTIONS)
      return addField(context, name, field, values)
    }
    throw new UsageError(`add what? \`add section <name>\`, \`add field <section> <name>\` or \`add page <name>\`${what ? `, not "${what}"` : ''}`, 'add')
  },
}
