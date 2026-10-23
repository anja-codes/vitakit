import { join } from 'node:path'
import type { FieldDescription, FieldType } from '../../fields'
import type { Inventory, SectionInventory } from '../../inventory'
import { CommandError, UsageError, type CommandContext, type CommandSpec, type ParsedArgs } from '../command'
import type { Workspace } from '../plan'
import { asking, finish } from '../finish'

type Values = ParsedArgs['values']

const SECTION_OPTIONS = ['page', 'document', 'title', 'after', 'like']
const FIELD_OPTIONS = ['type', 'several', 'required', 'choice']
const PAGE_OPTIONS = ['title', 'no-menu']
const SELECTION_OPTIONS = ['where', 'since', 'until', 'sort', 'order', 'group-by', 'limit']
const LIST_OPTIONS = ['page', 'document', 'title', 'after', ...SELECTION_OPTIONS]
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
  const { matchingSchemas, schemaOwner, sharedSchemaModule } = await import('../authoring')
  const { draftSchema } = await import('../../draft')
  const { describeSection } = await import('../../fields')
  const { confirm } = await import('../prompt')
  const notes: string[] = []

  let like = values.like as string | undefined
  if (like) {
    if (!await schemaOwner(inv, like)) throw new CommandError(`--like ${like}: no section "${like}" with a schema`)
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
    const other = (await schemaOwner(inv, like))!
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
  if (id === 'publications') throw new CommandError(`publications come from content/publications.bib; to show some of them, \`${run.bin('vitakit', 'add publication-list <name>')}\` declares a list`)

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
      const other = like ? await authoring.schemaOwner(inv, like) : undefined
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
  // Entries with more fields than an existing schema accepts: accept them too.
  if (section && entries.length && (section.schema.origin === 'built-in' || section.schema.origin === 'local')) {
    const missing = await authoring.planMissingFields(root, ws, section, entries)
    if (missing.note) schemaResult.notes.push(missing.note)
    if (missing.fields.length) {
      // Only their names matter from here on: which of them are not shown.
      const added = missing.fields.map(name => ({ path: name, type: 'custom' as const, optional: true, several: false }))
      schemaResult = { ...schemaResult, fields: [...(schemaResult.fields ?? []), ...added], changes: missing.changes }
    }
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
      if (!name) throw new CommandError(`--page ${page.route}: no Vue page has this route; a new page needs a route like /talks/`)
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

// add publication-list ------------------------------------------------------

/** A list's settings from flags, as they are written to the YAML file. */
function listSettings(values: Values): Record<string, unknown> {
  const number = (name: string) => {
    if (values[name] === undefined) return undefined
    const value = Number(values[name])
    if (!Number.isInteger(value)) throw new UsageError(`--${name} must be a whole number`, 'add')
    return value
  }
  const where: Record<string, string | string[]> = {}
  for (const expression of strings(values.where)) {
    const equals = expression.indexOf('=')
    const field = expression.slice(0, equals).trim()
    const value = expression.slice(equals + 1).trim()
    if (equals === -1 || !field || !value) throw new UsageError(`--where ${expression}: use field=value, e.g. status=preprint`, 'add')
    const current = where[field]
    where[field] = current === undefined ? value : [current].flat().concat(value)
  }
  return {
    ...(Object.keys(where).length ? { where } : {}),
    since: number('since'),
    until: number('until'),
    sort: values.sort,
    order: values.order,
    limit: number('limit'),
    groupBy: values['group-by'],
  }
}

/** The questions behind the selection flags, in words. */
async function askListSettings(context: CommandContext, statuses: string[]): Promise<Record<string, unknown>> {
  const prompt = await import('../prompt')
  const { io } = context
  const settings: Record<string, unknown> = {}
  if (await prompt.choose(io, 'Which publications?', [{ label: 'all of them', value: false }, { label: 'only some statuses', value: true }])) {
    const answer = await prompt.input(io, `Which, separated by commas (${statuses.join(', ')})`)
    const chosen = answer.split(',').map(status => status.trim()).filter(Boolean)
    if (chosen.length) settings.where = { status: chosen.length === 1 ? chosen[0] : chosen }
  }
  const limit = await prompt.input(io, 'How many at most? (Enter for all)')
  if (limit) settings.limit = Number(limit)
  const order = await prompt.choose(io, 'In what order?', [
    { label: 'newest first', value: {} },
    { label: 'oldest first', value: { order: 'asc' } },
    { label: 'by title', value: { sort: 'title' } },
    { label: 'as in publications.bib', value: { sort: 'source' } },
  ])
  Object.assign(settings, order)
  const groupBy = await prompt.choose(io, 'In groups, each with a heading?', [
    { label: 'no, one list', value: undefined },
    { label: 'by status (Published, Preprints, …)', value: 'status' },
    { label: 'by year', value: 'year' },
  ])
  if (groupBy) settings.groupBy = groupBy
  return settings
}

async function addPublicationList(context: CommandContext, name: string, values: Values): Promise<number> {
  const { io, run, root } = context
  const { inventory } = await import('../../inventory')
  const { Workspace } = await import('../plan')
  const { loadPublicationsSchema } = await import('../../bibliography')
  const { LISTS_FILE, LISTS_HEADER, resolveList } = await import('../../publication-lists')
  const { addPublicationList: addToFile, publicationListLine } = await import('../../edit/yaml')
  const authoring = await import('../authoring')
  const prompt = await import('../prompt')

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new CommandError(`"${name}" must be lowercase kebab-case, e.g. recent-papers`)
  const inv = await inventory(root)
  const ws = new Workspace(root)
  const interactive = asking(context, values)
  const selecting = SELECTION_OPTIONS.some(option => values[option] !== undefined)
  const notes: string[] = []

  // The list
  const source = (await ws.read(LISTS_FILE)) ?? ''
  const line = publicationListLine(source, name)
  const exists = line !== undefined
  if (exists) {
    if (selecting) throw new CommandError(`${LISTS_FILE}:${line} declares ${name} already; change its settings there. Without selection options, this command only shows it somewhere else.`)
    ws.keep(LISTS_FILE, `the list ${name}, as it is`)
  } else {
    const schema = await loadPublicationsSchema(root)
    const settings = selecting || !interactive ? listSettings(values) : await askListSettings(context, schema.statuses.map(status => status.id))
    // Checked against the .bib file too, so that a misspelt field is found now.
    const { readBibliography } = await import('../../bibliography')
    const { selectPublications } = await import('../../publication-lists')
    let empty: boolean
    try {
      const list = resolveList(name, Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined)), schema)
      empty = !selectPublications(await readBibliography(join(root, 'content', 'publications.bib'), schema), name, list, schema).length
    } catch (error) {
      throw new CommandError(error instanceof Error ? error.message : String(error))
    }
    if (empty) notes.push(`No publication matches ${name} yet, so it shows nothing for now; check its settings if that is a surprise.`)
    const result = addToFile(source || LISTS_HEADER, name, settings)
    if (!result.ok) throw new CommandError(`${LISTS_FILE} ${result.reason}`)
    if (source) await ws.edit(LISTS_FILE, result.value, `declares the list ${name}`)
    else ws.create(LISTS_FILE, result.value, `declares the list ${name}`, { show: true })
  }

  // Where it appears
  const after = values.after as string | undefined
  const pages = strings(values.page).map(route => route.endsWith('/') ? route : `${route}/`)
  const documents = strings(values.document)
  let title = values.title as string | undefined
  if (interactive && !pages.length && !documents.length) {
    const shownOn = new Set(inv.web.publications.filter(placement => placement.list === name).map(placement => placement.route))
    const choices = [
      ...inv.pages.filter(page => page.vue && !shownOn.has(page.route)).map(page => ({ label: `${page.route}  (${page.vue})`, value: page.route })),
      { label: 'not on the website, for now', value: '' },
    ]
    const route = await prompt.choose(io, `Show ${name} on which page of your website?`, choices, Math.max(0, choices.findIndex(choice => choice.value === '/publications/')))
    if (route) pages.push(route)
    for (const document of inv.documents.filter(candidate => !candidate.publications.some(placement => placement.list === name))) {
      if (await prompt.confirm(io, `\nInclude ${name} in the PDF ${document.tex}?`, false)) documents.push(document.name)
    }
    if ((pages.length || documents.length) && title === undefined) title = await prompt.input(io, '\nHeading', prompt.headingFor(name))
  }
  // A heading by default, as for a section: in a PDF, a list without one would read as part of the section before it.
  title ??= prompt.headingFor(name)
  for (const route of pages) {
    const path = inv.pages.find(page => page.route === route)?.vue
    if (!path) throw new CommandError(`--page ${route}: no Vue page has this route; \`${run.bin('vitakit', 'add page <name>')}\` creates one`)
    await authoring.planListOnPage(ws, inv, path, { list: name, ...(title ? { title } : {}), ...(after ? { after } : {}) })
  }
  for (const document of documents) {
    if (!inv.documents.some(candidate => candidate.name === document)) {
      throw new CommandError(`--document ${document}: no cv-tex/${document}.tex; the documents are ${inv.documents.map(candidate => candidate.name).join(', ') || '(none)'}`)
    }
    await authoring.planListInDocument(ws, document, { id: name, ...(title ? { title } : {}), ...(after ? { after } : {}) })
  }

  if (!pages.length && !documents.length && !exists) {
    notes.push(`Not shown anywhere yet: \`${run.bin('vitakit', `add publication-list ${name} --page /publications/`)}\` or \`--document cv\` adds it later.`)
  }
  return finish(context, ws, values, {
    before: notes,
    after: [
      `Which publications the list ${name} shows is set in ${LISTS_FILE}.`,
      `\`${run.bin('vitakit', `explain ${name}`)}\` shows which ones it contains, and why.`,
    ],
  })
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
  summary: 'add a section, a field of a section, a website page, or a publication list',
  positionals: [{ name: 'what', required: true }, { name: 'name' }, { name: 'field' }],
  options: {
    'page': { type: 'string', multiple: true, value: '<route>', description: 'section, publication-list: show it on this page, e.g. /cv/ (repeatable)' },
    'document': { type: 'string', multiple: true, value: '<name>', description: 'section, publication-list: include it in this PDF document, e.g. cv (repeatable)' },
    'after': { type: 'string', value: '<name>', description: 'section, publication-list: place it after this section or list' },
    'title': { type: 'string', value: '<text>', description: 'section, publication-list: its heading; page: its title' },
    'where': { type: 'string', multiple: true, value: '<field=value>', description: 'publication-list: only entries with this value, e.g. status=preprint (repeatable)' },
    'since': { type: 'string', value: '<year>', description: 'publication-list: only entries from this year on' },
    'until': { type: 'string', value: '<year>', description: 'publication-list: only entries up to this year' },
    'sort': { type: 'string', value: '<by>', description: 'publication-list: date (default), year, title, source or a field' },
    'order': { type: 'string', value: '<asc|desc>', description: 'publication-list: sort direction' },
    'group-by': { type: 'string', value: '<by>', description: 'publication-list: status, year or a field' },
    'limit': { type: 'string', value: '<count>', description: 'publication-list: at most this many' },
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
    run.bin('vitakit', 'add publication-list <name> [options]'),
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

\`add publication-list\` declares which publications a list shows, in
content/publication-lists.yml, and shows it on a page or in a PDF:

  ${run.bin('vitakit', 'add publication-list preprints --where status=preprint --page /publications/')}
  ${run.bin('vitakit', 'add publication-list recent --limit 5 --document cv --title "Recent publications"')}

For a list that exists already, it only adds it to more pages and PDFs.

Everything is shown before it is written, and asked; nothing existing is
replaced. A file that cannot be changed safely gets a line to paste instead.`,

  async run(context, { positionals, values }) {
    const [what, name, field] = positionals
    if (what === 'publication-list') {
      if (!name) throw new UsageError('missing <name>: `add publication-list <name>`', 'add')
      if (field !== undefined) throw new UsageError(`unexpected argument "${field}"`, 'add')
      onlyOptions(what, values, LIST_OPTIONS)
      return addPublicationList(context, name, values)
    }
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
    throw new UsageError(`add what? \`add section <name>\`, \`add field <section> <name>\`, \`add page <name>\` or \`add publication-list <name>\`${what ? `, not "${what}"` : ''}`, 'add')
  },
}
