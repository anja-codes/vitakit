/**
 * What `vitakit migrate` changes in a project written for an earlier vitakit.
 *
 * Each step looks for what is outdated and plans edits in a `Workspace`;
 * nothing found means nothing planned, so running it twice is harmless.
 * What it cannot change safely becomes a note to do by hand, and the run
 * goes on: the build and `vitakit validate` point at whatever is left.
 */
import { readdir, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { parseExpression } from '@babel/parser'
import { isMap, isScalar, parse as parseYaml, parseDocument } from 'yaml'
import { defaultPublications, loadPublicationsSchema } from '../bibliography'
import { importProjectModule } from '../issues'
import { addPublicationList, publicationListYaml } from '../edit/yaml'
import { renamePublicationsSettings } from '../edit/typescript'
import { publicationsElements, type PublicationsElement } from '../edit/vue'
import { findPdfPlacements } from '../placements'
import { LISTS_FILE, LISTS_HEADER } from '../publication-lists'
import type { Workspace } from './plan'

export interface MigrationNotes {
  before: string[]
  after: string[]
}

type Settings = Record<string, unknown>

/** Lists to declare, by name; the same settings share one name. */
class ListPlan {
  readonly added = new Map<string, Settings>()

  constructor(private readonly existing: Record<string, unknown>) {}

  /** The name of a list with these settings: an existing one, or a new one. */
  name(wanted: string, settings: Settings): string {
    const same = (other: unknown) => JSON.stringify(other ?? {}) === JSON.stringify(settings)
    for (const [name, other] of [...Object.entries(this.existing), ...this.added]) if (same(other)) return name
    let name = wanted
    for (let index = 2; Object.hasOwn(this.existing, name) || this.added.has(name); index++) name = `${wanted}-${index}`
    this.added.set(name, settings)
    return name
  }
}

/** The list of these statuses (all without), grouped by status as 0.2 grouped everything, or not. */
function statusList(statuses?: string[], grouped = true): { wanted: string, settings: Settings } {
  return {
    wanted: `${statuses?.join('-') ?? 'all'}${grouped ? '' : '-ungrouped'}`,
    settings: {
      ...(statuses ? { where: { status: statuses.length === 1 ? statuses[0] : statuses } } : {}),
      ...(grouped ? { groupBy: 'status' } : {}),
    },
  }
}

/** `['published', 'preprint']` as written in a template, or `undefined`. */
function literalStrings(expression: string): string[] | undefined {
  try {
    const node = parseExpression(expression)
    if (node.type !== 'ArrayExpression') return undefined
    const values = node.elements.map(element => element?.type === 'StringLiteral' ? element.value : undefined)
    return values.every(value => value !== undefined) ? values as string[] : undefined
  } catch {
    return undefined
  }
}

/**
 * The list an old `<VitaPublications>` showed, from its `groups` and
 * `headings`; a reason when they are not literal.
 */
function legacyList(element: PublicationsElement, statuses: string[]): { wanted: string, settings: Settings, note?: string } | { reason: string } {
  const groupsProp = element.props.find(prop => prop.name === 'groups')
  const headingsProp = element.props.find(prop => prop.name === 'headings')
  const groups = groupsProp?.expression !== undefined ? literalStrings(groupsProp.expression) : undefined
  if (groupsProp && !groups) return { reason: 'its groups are not a literal list such as [\'preprint\']' }
  const headings = !headingsProp || headingsProp.expression === 'true' || (headingsProp.expression === undefined && headingsProp.value === undefined)
  if (headingsProp && !headings && headingsProp.expression !== 'false') return { reason: 'its headings are not literally true or false' }

  const list = statusList(groups, headings)
  const reordered = headings && groups && groups.join() !== statuses.filter(status => groups.includes(status)).join()
  const merged = !headings && (groups?.length ?? 2) > 1
  const note = reordered ? 'its groups now appear in the order of the statuses in schemas/publications.ts'
    : merged ? 'it is now one list, newest first, rather than one status after the other' : undefined
  return { ...list, ...(note ? { note } : {}) }
}

/** The status ids in order, also from a schema that still says `groups`. */
async function statusOrder(root: string): Promise<string[]> {
  const ids = (statuses: { id: string }[]) => statuses.map(status => status.id)
  try {
    return ids((await loadPublicationsSchema(root)).statuses)
  } catch {
    const path = join(root, 'schemas', 'publications.ts')
    const old = await stat(path)
      .then(info => importProjectModule(path, info.mtimeMs, 'schemas/publications.ts'))
      .then(module => (module.default as { groups?: unknown } | undefined)?.groups, () => undefined)
    return Array.isArray(old) ? ids(old as { id: string }[]) : ids(defaultPublications.statuses)
  }
}

async function appFiles(root: string, extension: string, dir = join(root, 'app')): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await appFiles(root, extension, path))
    else if (entry.name.endsWith(extension)) files.push(relative(root, path).split(sep).join('/'))
  }
  return files.sort()
}

/** The rules for a list's `title` that the 0.3 scaffold added to `main.css`. */
export const PUBLICATIONS_TITLE_CSS = `.vita-publications__title {
  @apply text-xl font-semibold;
}
.vita-publications__title ~ .vita-publications__group .vita-publications__heading {
  @apply mt-4 text-base;
}`

/**
 * A stylesheet styles a list's group headings but not its title: the title
 * would be plain text, smaller than the headings below it. The stylesheet is
 * the project's own, so this is a note, never an edit.
 */
async function checkStyles(ws: Workspace, root: string, notes: MigrationNotes): Promise<void> {
  const sheets: { path: string, source: string }[] = []
  for (const path of await appFiles(root, '.css')) sheets.push({ path, source: (await ws.read(path))! })
  if (sheets.some(sheet => sheet.source.includes('.vita-publications__title'))) return
  const styled = sheets.find(sheet => sheet.source.includes('.vita-publications__heading'))
  if (!styled) return
  notes.after.push(`By hand: ${styled.path} styles the groups of a publication list but not its title, <VitaPublications title>. New projects have, after .vita-publications__heading:\n${PUBLICATIONS_TITLE_CSS}`)
}

/** `groups`/`defaultGroup` in `schemas/publications.ts` are `statuses`/`defaultStatus`. */
async function migrateSchema(ws: Workspace, notes: MigrationNotes): Promise<void> {
  const path = 'schemas/publications.ts'
  const source = await ws.read(path)
  if (source === undefined || !/\b(groups|defaultGroup)\s*:/.test(source)) return
  const renamed = renamePublicationsSettings(source, { groups: 'statuses', defaultGroup: 'defaultStatus' })
  if (!renamed.ok) notes.after.push(`By hand: in ${path}, rename groups to statuses and defaultGroup to defaultStatus (${renamed.reason}).`)
  else if (renamed.value !== source) await ws.edit(path, renamed.value, 'groups is now statuses, defaultGroup defaultStatus')
}

/** `<VitaPublications>` without a list, with `groups` and `headings`, gets one. */
async function migratePages(root: string, ws: Workspace, lists: ListPlan, notes: MigrationNotes): Promise<void> {
  const statuses = await statusOrder(root)
  for (const path of await appFiles(root, '.vue')) {
    const source = (await ws.read(path))!
    if (/(^|\/)VitaPublications\.vue$/.test(path)) {
      notes.after.push(`By hand: ${path} is your copy of VitaPublications. Its props are now list and title, and it reads usePublicationList(list); \`vitakit eject VitaPublications\` shows vitakit's.`)
    }
    if (/\busePublications\s*\(/.test(source)) {
      notes.after.push(`By hand: ${path} calls usePublications(); use usePublicationList('<list>') with a list from ${LISTS_FILE}.`)
    }
    const found = publicationsElements(source)
    if (!found.ok) {
      if (source.includes('VitaPublications')) notes.after.push(`By hand: ${path} ${found.reason}; check its VitaPublications.`)
      continue
    }

    const edits: { start: number, end: number, text: string }[] = []
    const shown: string[] = []
    for (const element of found.value) {
      if (element.props.some(prop => prop.name === 'list')) continue
      const old = element.props.filter(prop => prop.name === 'groups' || prop.name === 'headings')
      const legacy = old.length ? legacyList(element, statuses) : statusList()
      if ('reason' in legacy) {
        notes.after.push(`By hand: ${path}:${element.line}: ${legacy.reason}. Declare the list in ${LISTS_FILE} and write <VitaPublications list="<name>" />.`)
        continue
      }
      const name = lists.name(legacy.wanted, legacy.settings)
      for (const prop of old) {
        // The prop with the space before it.
        let start = prop.start
        while (start > 0 && /\s/.test(source[start - 1]!)) start--
        edits.push({ start, end: prop.end, text: '' })
      }
      const afterTag = element.start + 1 + element.tag.length
      edits.push({ start: afterTag, end: afterTag, text: ` list="${name}"` })
      shown.push(name)
      if ('note' in legacy && legacy.note) notes.before.push(`${path}:${element.line} shows the list ${name}: ${legacy.note}.`)
    }
    if (!edits.length) continue
    let result = source
    // From the end, so earlier offsets stay valid.
    for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
    await ws.edit(path, result, `VitaPublications shows ${[...new Set(shown)].join(', ')}`)
  }
}

/**
 * `publications: { groups }` in a document's `.yml` goes, and its
 * `\vitainput{publications}` shows the list instead.
 */
async function migrateDocuments(root: string, ws: Workspace, lists: ListPlan, notes: MigrationNotes): Promise<void> {
  const files = (await readdir(join(root, 'cv-tex')).catch(() => [] as string[])).filter(name => name.endsWith('.tex')).sort()
  for (const file of files) {
    const tex = `cv-tex/${file}`
    const yml = tex.replace(/\.tex$/, '.yml')
    let list = statusList()

    const options = await ws.read(yml)
    const document = options === undefined ? undefined : parseDocument(options)
    const pair = document && isMap(document.contents) ? document.contents.items.find(item => isScalar(item.key) && item.key.value === 'publications') : undefined
    if (options !== undefined && pair) {
      const groups = (document!.toJS() as { publications?: { groups?: unknown } }).publications?.groups
      if (Array.isArray(groups) && groups.every(group => typeof group === 'string')) list = statusList(groups)
      const start = (pair.key as { range?: number[] }).range?.[0]
      const end = (pair.value as { range?: number[] } | null)?.range?.[1]
      if (start === undefined || end === undefined) {
        notes.after.push(`By hand: remove publications from ${yml}; which publications the PDF shows is now a list.`)
      } else {
        // The whole lines of the setting, from its key to the end of its value.
        const lines = options.split('\n')
        const lineOf = (offset: number) => options.slice(0, offset).split('\n').length
        lines.splice(lineOf(start) - 1, lineOf(Math.max(start, end - 1)) - lineOf(start) + 1)
        await ws.edit(yml, lines.join('\n'), `publications are now a list in ${LISTS_FILE}`)
      }
    }

    const source = (await ws.read(tex))!
    const inputs = findPdfPlacements('', tex, source).filter(placement => placement.macro === 'vitainput' && placement.section === 'publications')
    if (!inputs.length) continue
    const name = lists.name(list.wanted, list.settings)
    const lines = source.split('\n')
    // From the end, so that removing a heading line keeps the others' numbers.
    for (const input of [...inputs].reverse()) {
      const index = input.line - 1
      // `\section{Publications}` on the line before becomes the list's heading,
      // so that an empty list has none either.
      const heading = index > 0 ? /^\s*\\section\{([^{}]*)\}\s*$/.exec(lines[index - 1]!)?.[1] : undefined
      lines[index] = lines[index]!.replace('\\vitainput{publications}', `\\vitapublications${heading !== undefined ? `[${heading}]` : ''}{${name}}`)
      if (heading !== undefined) lines.splice(index - 1, 1)
    }
    await ws.edit(tex, lines.join('\n'), `shows the publication list ${name}`)
    notes.before.push(`${tex} shows the list ${name}: in the PDF too, publications now come in the list's order, as on the website (biblatex sorted them by year and author before), and each group is numbered from 1.`)
  }
  if (await ws.read('cv-tex/templates/publications.eta') !== undefined) {
    notes.after.push('By hand: cv-tex/templates/publications.eta is your copy of the PDF template. vitakit\'s now cites a list in its order, with `<%~ it.bib.cite() %>` instead of `\\nocite{*}`, inside `\\begin{refcontext}[sorting=none]`.')
  }
}

/**
 * Publications before publication lists: `groups`/`headings` on the
 * component, `publications.groups` in a document's `.yml`,
 * `\vitainput{publications}`, `groups`/`defaultGroup` in the schema.
 */
export async function migratePublicationLists(root: string, ws: Workspace, notes: MigrationNotes): Promise<void> {
  await migrateSchema(ws, notes)
  await checkStyles(ws, root, notes)

  const source = await ws.read(LISTS_FILE)
  let existing: unknown
  try {
    existing = source === undefined ? {} : parseYaml(source) ?? {}
  } catch {
    notes.after.push(`By hand: ${LISTS_FILE} cannot be read; fix it, then run \`vitakit migrate\` again.`)
    return
  }
  const lists = new ListPlan(typeof existing === 'object' && !Array.isArray(existing) ? existing as Record<string, unknown> : {})
  await migratePages(root, ws, lists, notes)
  await migrateDocuments(root, ws, lists, notes)
  if (!lists.added.size) return

  let lines = source ?? LISTS_HEADER
  for (const [name, settings] of lists.added) {
    const added = addPublicationList(lines, name, settings)
    if (!added.ok) {
      notes.after.push(`By hand: add to ${LISTS_FILE} (${added.reason}):\n${[...lists.added].map(([other, value]) => publicationListYaml(other, value)).join('\n')}`)
      return
    }
    lines = added.value
  }
  notes.after.push(`The new lists are named after what they show. To rename one, change its name in ${LISTS_FILE} and where it is shown.`)
  const reason = `declares ${[...lists.added.keys()].join(', ')}`
  if (source === undefined) ws.create(LISTS_FILE, lines, reason, { show: true })
  else await ws.edit(LISTS_FILE, lines, reason)
}

/** Casts that 0.3 made necessary: a local interface or `as` for an entry's field. */
const CAST = /\bentry\.[\w$]+\s+as\s+[A-Z][\w$]*(?:\s*\|\s*undefined)?|\(\s*entry\s+as\s+[A-Z][\w$<>'" |]*\)/

/**
 * Components `vitakit customize --web` wrote for 0.3 (`id?: string`,
 * `entries?: Entry[]`) get their `id` typed for the sections they are
 * shown with, which types their entries. The sections come from the pages:
 * `<TalkList id="talks" />` and `<TalkList id="talks-public" />` make
 * `id: 'talks' | 'talks-public'`.
 */
export async function migrateSectionComponents(root: string, ws: Workspace, notes: MigrationNotes): Promise<void> {
  const { findWebPlacements } = await import('../placements')
  const { sectionProps, typeSectionProps } = await import('../edit/props')
  const { placements, components } = await findWebPlacements(root)
  for (const [name, file] of components) {
    const source = await ws.read(file)
    if (source === undefined) continue
    const found = sectionProps(source)
    if (!found.ok || !found.value.untyped) continue
    const ids = [...new Set(placements.filter(placement => placement.component === name).map(placement => placement.section))].sort()
    if (!ids.length) {
      notes.after.push(`By hand: ${file} is shown on no page with a literal id. To type its entries, give its id the sections it shows, e.g. id: 'talks' | 'talks-public'.`)
      continue
    }
    const typed = typeSectionProps(source, ids)
    if (!typed.ok) continue
    await ws.edit(file, typed.value.source, `its entries are typed by the schema of ${ids.join(', ')}`)
    if (CAST.test(source)) {
      notes.after.push(`${file} casts entries to types of its own (as …). They still work, but its entries are typed by their schema now; the casts can go, and fields read as written, e.g. entry.<group>.<field>.`)
    }
  }
}
