/**
 * `content/publication-lists.yml`: named selections of `content/publications.bib`.
 *
 * A list says which publications it shows, in what order and in which groups;
 * a website page (`<VitaPublications list="recent" />`) or a PDF document
 * (`\vitapublications{recent}`) says where it appears and under which heading.
 * Lists are selected here, before any formatting, so that each group can be
 * formatted as a whole and the website and the PDF show the same entries.
 *
 * Selection follows `where`/`since`/`until`/`limit` of sections in a PDF
 * document's `.yml`: field equality, a year window, a count.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BibEntry, Bibliography } from '@behackl/citation-js-extras'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { fail, formatZodIssues, messageOf } from './issues'
import type { PublicationsSchema } from './publications'
import type { WhereValue } from './shared/select'

export const LISTS_FILE = 'content/publication-lists.yml'

/** The comment at the top of a new `content/publication-lists.yml`. */
export const LISTS_HEADER = `# Publication lists: which publications of publications.bib a list shows,
# in what order and in which groups. A page shows one with
#   <VitaPublications list="recent" title="Recent publications" />
# and a PDF with
#   \\vitapublications[Recent publications]{recent}
#
# Settings, all optional:
#   where:    { status: preprint }, { keywords: selected }, { year: 2024 } --
#             fields of the entries in publications.bib; [a, b] means a or b
#   keys:     [doe2024, roe2023] -- exactly these, in this order
#   since, until: years
#   sort:     date (newest first), year, title, source (as in publications.bib),
#             or a field; order: asc or desc
#   limit:    at most this many
#   groupBy:  status, year or a field; otherLabel: the heading for the entries
#             without it (Other)
# \`vitakit explain publications\` shows what each list contains and where.
`

/** Fields that are not BibTeX fields as written. */
const DERIVED = new Set(['key', 'status', 'year'])

export interface PublicationListOptions {
  /** Field (lowercase) -> wanted value(s); every field must match. */
  where: Record<string, WhereValue>
  /** Exactly these entries, in this order. */
  keys?: string[]
  since?: number
  until?: number
  /** `date`, `year`, `title`, `source` (the `.bib` order) or a BibTeX field. */
  sort: string
  order: 'asc' | 'desc'
  limit?: number
  /** `status`, `year` or a BibTeX field; ungrouped when absent. */
  groupBy?: string
  /** Heading of the group of entries without the `groupBy` field. */
  otherLabel: string
}

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const field = z.string().regex(/^[A-Za-z][\w-]*$/, 'expected a BibTeX field name').transform(name => name.toLowerCase())
const scalar = z.union([z.string(), z.number(), z.boolean()])

const listInput = z.strictObject({
  where: z.record(z.string(), z.union([scalar, z.array(scalar).min(1)])).default({}),
  keys: z.array(z.string().min(1)).min(1).optional(),
  since: z.number().int().optional(),
  until: z.number().int().optional(),
  sort: field.optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().positive().optional(),
  groupBy: field.optional(),
  otherLabel: z.string().trim().min(1).optional(),
})

/** Check one list and fill in its defaults. */
export function resolveList(name: string, value: unknown, schema: PublicationsSchema): PublicationListOptions {
  const at = (option: string) => `${name}.${option}`
  if (!NAME.test(name)) fail(LISTS_FILE, `${name}: a list name is lowercase kebab-case, e.g. recent-papers`)
  const parsed = listInput.safeParse(value ?? {})
  if (!parsed.success) fail(LISTS_FILE, `${name}: invalid\n${formatZodIssues(parsed.error)}`)
  const input = parsed.data

  const where: Record<string, WhereValue> = {}
  for (const [key, wanted] of Object.entries(input.where)) {
    const parsedField = field.safeParse(key)
    if (!parsedField.success) fail(LISTS_FILE, `${at(`where.${key}`)}: expected a BibTeX field name`)
    where[parsedField.data] = wanted
  }
  const statuses = schema.statuses.map(status => status.id)
  for (const status of where.status === undefined ? [] : [where.status].flat()) {
    if (!statuses.includes(String(status).toLowerCase())) {
      fail(LISTS_FILE, `${at('where.status')}: no status "${status}"; the statuses are ${statuses.join(', ')} (schemas/publications.ts)`)
    }
  }
  if (input.keys && input.sort) fail(LISTS_FILE, `${at('sort')}: a list of keys is shown in the order of its keys; remove sort or keys`)
  if (input.order && (input.keys || input.sort === 'source')) fail(LISTS_FILE, `${at('order')}: only applies when sorting by a field`)
  if (input.groupBy === 'keywords') fail(LISTS_FILE, `${at('groupBy')}: an entry can have several keywords; group by another field`)
  if (input.otherLabel && (!input.groupBy || input.groupBy === 'status')) {
    fail(LISTS_FILE, `${at('otherLabel')}: only applies when grouping by year or by a field`)
  }

  const sort = input.sort ?? 'date'
  return {
    where,
    ...(input.keys ? { keys: input.keys } : {}),
    ...(input.since !== undefined ? { since: input.since } : {}),
    ...(input.until !== undefined ? { until: input.until } : {}),
    sort,
    order: input.order ?? (sort === 'date' || sort === 'year' ? 'desc' : 'asc'),
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
    ...(input.groupBy ? { groupBy: input.groupBy } : {}),
    otherLabel: input.otherLabel ?? 'Other',
  }
}

/** The names of the lists, whatever their settings; none for a file that cannot be read. */
export async function publicationListNames(rootDir: string): Promise<string[]> {
  try {
    const data = parseYaml(await readFile(join(rootDir, LISTS_FILE), 'utf8')) as unknown
    return data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : []
  } catch {
    return []
  }
}

/** Every list in `content/publication-lists.yml`; none without the file. */
export async function loadPublicationLists(rootDir: string, schema: PublicationsSchema): Promise<Record<string, PublicationListOptions>> {
  const raw = await readFile(join(rootDir, LISTS_FILE), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (raw === undefined) return {}
  let data: unknown
  try {
    data = parseYaml(raw)
  } catch (error) {
    fail(LISTS_FILE, messageOf(error))
  }
  if (data === null || data === undefined) return {}
  if (typeof data !== 'object' || Array.isArray(data)) fail(LISTS_FILE, 'expected one list per name, e.g. `recent: { limit: 3 }`')
  return Object.fromEntries(Object.entries(data).map(([name, value]) => [name, resolveList(name, value, schema)]))
}

/** An entry's status: its `status` field, lowercase, or the default status. */
export function publicationStatus(entry: BibEntry, schema: PublicationsSchema): string {
  return (entry.custom.status?.trim() || schema.defaultStatus).toLowerCase()
}

/** A BibTeX value as text: braces that only protect capitals removed. */
const plain = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.replace(/[{}]/g, '').trim() : undefined
  return text || undefined
}

function valueOf(entry: BibEntry, name: string, schema: PublicationsSchema): string | undefined {
  if (name === 'key') return entry.key
  if (name === 'status') return publicationStatus(entry, schema)
  if (name === 'year') return entry.year === null ? undefined : String(entry.year)
  return plain(entry.raw[name])
}

/** `keywords` holds several values; a list matches when one of them does. */
function matches(entry: BibEntry, name: string, wanted: WhereValue, schema: PublicationsSchema): boolean {
  const value = valueOf(entry, name, schema)
  const actual = name === 'keywords' ? value?.split(/[,;]/).map(keyword => keyword.trim()) ?? [] : value === undefined ? [] : [value]
  return [wanted].flat().map(String).some(candidate => actual.includes(name === 'status' ? candidate.toLowerCase() : candidate))
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Sorted by a field's text; entries without it last, ties in `.bib` order. */
function sortByText(entries: BibEntry[], value: (entry: BibEntry) => string | undefined, order: 'asc' | 'desc'): BibEntry[] {
  const keyed = entries.map(entry => ({ entry, value: value(entry) }))
  const sign = order === 'asc' ? 1 : -1
  return keyed
    .sort((a, b) => a.value === undefined ? (b.value === undefined ? 0 : 1) : b.value === undefined ? -1 : sign * collator.compare(a.value, b.value))
    .map(item => item.entry)
}

function sortEntries(bib: Bibliography, entries: BibEntry[], list: PublicationListOptions, schema: PublicationsSchema): BibEntry[] {
  if (list.keys || list.sort === 'source') return entries
  if (list.sort === 'date' || list.sort === 'year') {
    // Upstream knows month and day precision; an entry without a year is not
    // year 0 and goes last in either direction.
    const dated = entries.filter(entry => entry.year !== null)
    return [...bib.sort(dated, { by: list.sort, order: list.order }), ...entries.filter(entry => entry.year === null)]
  }
  return sortByText(entries, entry => valueOf(entry, list.sort, schema), list.order)
}

export interface SelectedGroup {
  label?: string
  entries: BibEntry[]
}

function group(entries: BibEntry[], list: PublicationListOptions, schema: PublicationsSchema): SelectedGroup[] {
  const by = list.groupBy
  if (!by) return entries.length ? [{ entries }] : []
  if (by === 'status') {
    return schema.statuses
      .map(status => ({ label: status.label, entries: entries.filter(entry => publicationStatus(entry, schema) === status.id) }))
      .filter(selected => selected.entries.length)
  }
  const values = [...new Set(entries.map(entry => valueOf(entry, by, schema)).filter(value => value !== undefined))]
  // Years newest first, anything else A to Z; the entries without it last.
  values.sort(by === 'year' ? (a, b) => Number(b) - Number(a) : collator.compare)
  const groups: SelectedGroup[] = values.map(value => ({ label: value, entries: entries.filter(entry => valueOf(entry, by, schema) === value) }))
  const other = entries.filter(entry => valueOf(entry, by, schema) === undefined)
  return other.length ? [...groups, { label: list.otherLabel, entries: other }] : groups
}

/** The steps of a list's selection, each with the setting it comes from. */
function selectionSteps(bib: Bibliography, name: string, list: PublicationListOptions, schema: PublicationsSchema): { rule: string, apply: (entries: BibEntry[]) => BibEntry[] }[] {
  // A misspelt field would silently empty the list.
  const fields = [...Object.keys(list.where), list.sort, list.groupBy]
    .filter((candidate): candidate is string => !!candidate && !DERIVED.has(candidate) && !['date', 'source'].includes(candidate))
  for (const candidate of new Set(fields)) {
    if (bib.entries.length && !bib.entries.some(entry => plain(entry.raw[candidate]) !== undefined)) {
      fail(LISTS_FILE, `${name}: no publication has a field "${candidate}"`)
    }
  }
  const steps: { rule: string, apply: (entries: BibEntry[]) => BibEntry[] }[] = []
  if (list.keys) {
    const byKey = new Map(bib.entries.map(entry => [entry.key, entry]))
    const missing = list.keys.filter(key => !byKey.has(key))
    if (missing.length) fail(LISTS_FILE, `${name}.keys: no publication ${missing.join(', ')} in content/publications.bib`)
    steps.push({ rule: `keys: ${list.keys.length}`, apply: () => list.keys!.map(key => byKey.get(key)!) })
  }
  for (const [field, wanted] of Object.entries(list.where)) {
    steps.push({ rule: `where ${field}: ${[wanted].flat().join(', ')}`, apply: entries => entries.filter(entry => matches(entry, field, wanted, schema)) })
  }
  if (list.since !== undefined) steps.push({ rule: `since: ${list.since}`, apply: entries => entries.filter(entry => entry.year !== null && entry.year >= list.since!) })
  if (list.until !== undefined) steps.push({ rule: `until: ${list.until}`, apply: entries => entries.filter(entry => entry.year !== null && entry.year <= list.until!) })
  steps.push({ rule: 'sort', apply: entries => sortEntries(bib, entries, list, schema) })
  if (list.limit !== undefined) steps.push({ rule: `limit: ${list.limit}`, apply: entries => entries.slice(0, list.limit) })
  return steps
}

/** The entries of one list, grouped; selection happens before any formatting. */
export function selectPublications(bib: Bibliography, name: string, list: PublicationListOptions, schema: PublicationsSchema): SelectedGroup[] {
  let entries = bib.entries
  for (const step of selectionSteps(bib, name, list, schema)) entries = step.apply(entries)
  return group(entries, list, schema)
}

/**
 * The same selection, step by step, so that "why is this paper not in my
 * list" has an answer: what each setting removed, and the keys that remain.
 */
export function explainPublications(bib: Bibliography, name: string, list: PublicationListOptions, schema: PublicationsSchema): { total: number, steps: { rule: string, removed: number }[], keys: string[] } {
  let entries = bib.entries
  const steps: { rule: string, removed: number }[] = []
  for (const step of selectionSteps(bib, name, list, schema)) {
    const next = step.apply(entries)
    // `keys` chooses rather than removes; it counts like the others.
    steps.push({ rule: step.rule, removed: entries.length - next.length })
    entries = next
  }
  return { total: bib.entries.length, steps: steps.filter(step => step.removed > 0), keys: group(entries, list, schema).flatMap(selected => selected.entries.map(entry => entry.key)) }
}

/** A list's settings in words: `status preprint · newest first · at most 3`. */
export function describeList(list: PublicationListOptions): string {
  const parts: string[] = []
  if (list.keys) parts.push(`${list.keys.length} chosen by key`)
  for (const [name, wanted] of Object.entries(list.where)) parts.push(`${name} ${[wanted].flat().join(' or ')}`)
  if (list.since !== undefined) parts.push(`since ${list.since}`)
  if (list.until !== undefined) parts.push(`until ${list.until}`)
  if (!list.keys) {
    if (list.sort === 'source') parts.push('in .bib order')
    else if (list.sort === 'date' || list.sort === 'year') parts.push(list.order === 'desc' ? 'newest first' : 'oldest first')
    else parts.push(`by ${list.sort}${list.order === 'desc' ? ', descending' : ''}`)
  }
  if (list.limit !== undefined) parts.push(`at most ${list.limit}`)
  if (list.groupBy) parts.push(`grouped by ${list.groupBy}`)
  return parts.join(' · ')
}
