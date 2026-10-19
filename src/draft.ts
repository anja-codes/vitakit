/**
 * Draft `schemas/<name>.ts` from the entries already in `content/<name>.yml`.
 *
 * Conservative: every value of every entry is looked at, nothing is restricted
 * on a guess, and what could reasonably be different is said in a comment
 * above the field rather than decided. The draft is built twice from one
 * description -- as source text and as a live schema -- and the live schema is
 * checked against the entries, so what the draft does not accept is known and
 * can be shown before anything is written.
 */
import { z } from 'zod'
import { dateRange, linked, richText, section, text, url } from './primitives'
import { propertyKey } from './edit/typescript'
import { isSitePath } from './site-paths'

/** One inferred value type, as code and as a schema. */
interface Inferred {
  code: string
  schema: z.ZodType
  imports: string[]
  /** Comment lines for this field, shown above it. */
  notes: string[]
}

export interface DraftField {
  name: string
  code: string
  notes: string[]
}

export interface Draft {
  /** The module's source text. */
  source: string
  fields: DraftField[]
  /** The draft as a schema, for checking. */
  schema: z.ZodType
  /** What the entries must change before the draft accepts them. */
  changes: string[]
}

const DATE_POINT = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/
const isDatePoint = (value: unknown) =>
  (typeof value === 'number' && Number.isInteger(value) && value >= 1000 && value <= 9999)
  || (typeof value === 'string' && DATE_POINT.test(value))
const isDateRange = (value: unknown) => isDatePoint(value)
  || (isRecord(value) && Object.keys(value).every(key => key === 'from' || key === 'to')
    && isDatePoint(value.from) && (value.to === undefined || value.to === 'present' || isDatePoint(value.to)))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isUrl = (value: unknown) => typeof value === 'string'
  && ((isSitePath(value) && !/\s/.test(value)) || /^(?:https?:\/\/|mailto:)\S+$/.test(value))

const isLinked = (value: unknown) => isRecord(value)
  && (typeof value.name === 'string' || typeof value.label === 'string')
  && Object.keys(value).every(key => ['name', 'label', 'url'].includes(key))
  && !('name' in value && 'label' in value)

/** How a date written in another format would be written for vitakit. */
function dateSuggestion(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const monthYear = /^(\d{1,2})\/(\d{4})$/.exec(value)
    if (monthYear) return `${monthYear[2]}-${monthYear[1]!.padStart(2, '0')}`
    const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value)
    if (dotted) return `${dotted[3]}-${dotted[2]!.padStart(2, '0')}-${dotted[1]!.padStart(2, '0')}`
    const since = /^since\s+(.+)$/i.exec(value)
    if (since) return `{ from: ${dateSuggestion(since[1]) ?? since[1]}, to: present }`
  }
  if (Array.isArray(value) && value.length >= 1 && value.length <= 2 && value.every(item => isDatePoint(item) || dateSuggestion(item))) {
    const [from, to] = value.map(item => isDatePoint(item) ? String(item) : dateSuggestion(item)!)
    return to ? `{ from: ${from}, to: ${to} }` : String(from)
  }
  if (isRecord(value) && 'start' in value) {
    return value.end !== undefined ? `{ from: ${String(value.start)}, to: ${String(value.end)} }` : String(value.start)
  }
  return undefined
}

const TITLE = /^(title|headline|name)$/

function inferValues(name: string, values: unknown[], depth: number): Inferred {
  const present = values.filter(value => value !== undefined && value !== null && value !== '')

  if (!present.length) {
    return { code: 'text', schema: text, imports: ['text'], notes: ['never filled in so far; text is a guess'] }
  }

  // Dates, in the one field where vitakit sorts by them.
  if (name === 'date') {
    if (present.every(isDateRange)) return { code: 'dateRange', schema: dateRange, imports: ['dateRange'], notes: [] }
    const example = present.map(dateSuggestion).find(Boolean)
    return {
      code: 'dateRange',
      schema: dateRange,
      imports: ['dateRange'],
      notes: [`dates must be written like 2024, 2024-03, 2024-03-15 or { from: 2019, to: present }${example ? `, e.g. ${example}` : ''}`],
    }
  }

  if (present.every(value => typeof value === 'boolean')) return { code: 'z.boolean()', schema: z.boolean(), imports: ['z'], notes: [] }

  const numeric = (value: unknown) => typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))
  if (present.every(numeric) && present.some(value => typeof value === 'number')) {
    const notes = present.some(value => typeof value === 'string') ? ['some entries write the number in quotes; remove them'] : []
    if (/^(year|time)$/.test(name) && present.every(isDatePoint)) notes.push('to sort entries by it, call this field date')
    return { code: 'z.number()', schema: z.number(), imports: ['z'], notes }
  }

  if (present.every(isLinked)) return { code: 'linked', schema: linked, imports: ['linked'], notes: [] }

  // Where vitakit's layouts show a place that may link, text is a link's label.
  if (depth === 0 && ['institution', 'issuer', 'organisation'].includes(name) && present.every(value => typeof value === 'string' || isLinked(value))) {
    return { code: 'linked', schema: linked, imports: ['linked'], notes: present.some(isLinked) ? ['a name, or { name, url }'] : ['a name; { name, url } links it'] }
  }

  if (present.every(value => typeof value === 'string' || isLinked(value)) && present.some(isLinked)) {
    return { code: 'linked', schema: linked, imports: ['linked'], notes: ['a name, or { name, url }'] }
  }

  if (present.every(isRecord)) {
    const keys = [...new Set(present.flatMap(value => Object.keys(value as object)))]
    if (keys.every(key => key === 'from' || key === 'to' || key === 'start' || key === 'end')) {
      const example = present.map(dateSuggestion).find(Boolean)
      return {
        code: 'dateRange',
        schema: dateRange,
        imports: ['dateRange'],
        notes: [`a date or a range; write { from, to }${example ? `, e.g. ${example}` : ''}${name === 'date' ? '' : ', and call the field date to sort by it'}`],
      }
    }
    const nested = inferObject(present as Record<string, unknown>[], depth + 1)
    return { code: nested.code, schema: nested.schema, imports: ['z', ...nested.imports], notes: [] }
  }

  if (present.some(Array.isArray)) {
    const items = present.flatMap(value => Array.isArray(value) ? value : [value])
    const element = inferValues(name, items, depth)
    const dates = present.find(value => Array.isArray(value) && dateSuggestion(value))
    const notes = dates ? element.notes.filter(note => !note.startsWith('looks like a date')) : [...element.notes]
    if (!present.every(Array.isArray)) notes.push('a list; where an entry has a single value, write it as a list: [value]')
    if (dates) notes.push(`if this is a period, write it as a date instead: ${dateSuggestion(dates)}${name === 'date' ? '' : ', and call the field date to sort by it'}`)
    return { code: `z.array(${element.code})`, schema: z.array(element.schema), imports: ['z', ...element.imports], notes }
  }

  if (present.every(value => typeof value === 'string')) {
    const strings = present as string[]
    if (strings.every(isUrl)) return { code: 'url', schema: url, imports: ['url'], notes: [] }
    const notes: string[] = []
    const odd = strings.map(dateSuggestion).find(Boolean)
    if (odd) notes.push(`looks like a date; to use it as one, write ${odd}${name === 'date' ? '' : ' and call the field date'}`)
    else if (strings.every(value => DATE_POINT.test(value)) && name !== 'date') notes.push('looks like a date; to sort by it, call this field date and use dateRange')
    const unique = [...new Set(strings)]
    // A few short values, each used several times, look like categories.
    if (unique.length > 1 && unique.length <= 5 && strings.length >= 2 * unique.length && unique.every(value => value.length <= 30)) {
      notes.push(`values so far: ${unique.join(', ')}; to allow only these: z.enum([${unique.map(value => `'${value.replace(/'/g, "\\'")}'`).join(', ')}])`)
    }
    if ((depth === 0 && TITLE.test(name)) || strings.some(value => /\$[^$]+\$/.test(value))) {
      return { code: 'richText', schema: richText, imports: ['richText'], notes: ['Markdown and $math$ allowed', ...notes] }
    }
    return { code: 'text', schema: text, imports: ['text'], notes }
  }

  // Mostly numbers, with some text: a number field, and the text is pointed out.
  const numbers = present.filter(value => typeof value === 'number').length
  if (numbers * 2 >= present.length && present.every(value => typeof value === 'number' || typeof value === 'string')) {
    const odd = [...new Set(present.filter(value => typeof value === 'string') as string[])]
    return {
      code: 'z.number()',
      schema: z.number(),
      imports: ['z'],
      notes: [`mostly numbers; ${odd.slice(0, 3).map(value => JSON.stringify(value)).join(', ')}${odd.length > 3 ? ', …' : ''} ${odd.length === 1 ? 'is' : 'are'} not: write a number, or use text`],
    }
  }

  // Mixed and unrecognizable values: the first kind wins, and the rest is said.
  const kinds = [...new Set(present.map(value => Array.isArray(value) ? 'list' : typeof value))]
  return {
    code: 'text',
    schema: text,
    imports: ['text'],
    notes: [`the entries mix ${kinds.join(' and ')}; text is a guess, make them consistent or write a custom schema`],
  }
}

function inferObject(entries: Record<string, unknown>[], depth: number, skip: string[] = []): { code: string, schema: z.ZodType, imports: string[], fields: DraftField[] } {
  const names = [...new Set(entries.flatMap(entry => Object.keys(entry)))].filter(name => !skip.includes(name))
  const fields: DraftField[] = []
  const shape: Record<string, z.ZodType> = {}
  const imports: string[] = []
  for (const name of names) {
    const values = entries.map(entry => entry[name])
    const inferred = inferValues(name, values, depth)
    const filled = values.filter(value => value !== undefined && value !== null && value !== '').length
    const empty = values.filter(value => value === '' || value === null).length
    const optional = filled < entries.length
    const notes = [...inferred.notes]
    if (empty) notes.push(`empty in ${empty} ${empty === 1 ? 'entry' : 'entries'}; leave the field out instead`)
    if (propertyKey(name) !== name) notes.push(`a name like ${name.replace(/[^A-Za-z0-9]+(.)/g, (_match, next: string) => next.toUpperCase())} needs no quotes`)
    fields.push({ name, code: `${inferred.code}${optional ? '.optional()' : ''}`, notes })
    shape[name] = optional ? inferred.schema.optional() : inferred.schema
    imports.push(...inferred.imports)
  }
  const indent = '  '.repeat(depth + 1)
  const lines = fields.flatMap(field => [
    ...field.notes.map(note => `${indent}// ${note}`),
    `${indent}${propertyKey(field.name)}: ${field.code},`,
  ])
  return {
    code: depth === 0 ? lines.join('\n') : `z.strictObject({\n${lines.join('\n')}\n${'  '.repeat(depth)}})`,
    schema: z.strictObject(shape),
    imports,
    fields,
  }
}

/** `1–3, 5, 8` */
function ranges(numbers: number[]): string {
  const parts: string[] = []
  for (let index = 0; index < numbers.length; index++) {
    let end = index
    while (end + 1 < numbers.length && numbers[end + 1] === numbers[end]! + 1) end++
    parts.push(end > index + 1 ? `${numbers[index]}–${numbers[end]}` : end === index + 1 ? `${numbers[index]}, ${numbers[end]}` : `${numbers[index]}`)
    index = end
  }
  return parts.join(', ')
}

/**
 * Zod's issues as people count, one line per field and problem:
 * `type, entries 1–35: expected array, received string`.
 */
function changesFrom(error: z.ZodError, entries: unknown[]): string[] {
  const grouped = new Map<string, number[]>()
  for (const issue of error.issues) {
    const [index, ...path] = issue.path
    let message = issue.message === 'Invalid input' ? 'not written in a form this field accepts' : issue.message.replace(/^Invalid input: /, '')
    if (typeof index === 'number') {
      let value: unknown = entries[index]
      for (const key of path) value = (value as Record<PropertyKey, unknown> | undefined)?.[key as PropertyKey]
      if (value === '' || value === null) message = 'empty; leave the field out'
      else if (value === undefined && path.length) message = 'missing; every entry needs it'
    }
    const key = `${path.join('.') || '(entry)'}\u0000${message}`
    grouped.set(key, [...(grouped.get(key) ?? []), typeof index === 'number' ? index + 1 : 0])
  }
  return [...grouped].map(([key, numbers]) => {
    const [field, message] = key.split('\u0000')
    const unique = [...new Set(numbers)].sort((a, b) => a - b)
    return `${field}, ${unique.length === 1 ? 'entry' : 'entries'} ${ranges(unique)}: ${message}`
  })
}

/** The draft for `entries`, which are the parsed contents of `content/<id>.yml`. */
export function draftSchema(id: string, entries: unknown[], { file = `content/${id}.yml` }: { file?: string } = {}): Draft {
  const records = entries.filter(isRecord)
  const object = inferObject(records, 0, ['visibility'])
  const imports = [...new Set(['section', ...object.imports])].sort()
  const source = [
    '/**',
    ` * What ${file} may contain.`,
    ' *',
    ' * Drafted from its entries by `vitakit add section`: check the comments,',
    ' * change what is not right, then delete them. Every entry also has',
    ' * `visibility: public | cv | private`.',
    ...(object.fields.some(field => field.name === 'date') ? [] : [' *', ' * Without a field called `date`, entries keep the order of the file.']),
    ' */',
    `import { ${imports.join(', ')} } from '@anja.codes/vitakit'`,
    '',
    'export default section({',
    object.code,
    '})',
    '',
  ].join('\n')

  const schema = section((object.schema as z.ZodObject<z.ZodRawShape>).shape)
  const parsed = schema.safeParse(entries)
  return { source, fields: object.fields, schema, changes: parsed.success ? [] : changesFrom(parsed.error, entries) }
}

export interface DraftExtension {
  /** Fields the entries have and the schema does not, drafted like a schema's. */
  fields: DraftField[]
  imports: string[]
  /** What the entries must change before schema and fields accept them. */
  changes: string[]
}

/**
 * The fields to add to an existing section schema -- built-in or the user's --
 * for entries that have more fields than it accepts.
 */
export function draftExtension(base: z.ZodType, entries: unknown[]): DraftExtension | undefined {
  if (!(base instanceof z.ZodArray) || !(base.element instanceof z.ZodObject)) return undefined
  const element = base.element as z.ZodObject<z.ZodRawShape>
  const known = Object.keys(element.shape)
  const object = inferObject(entries.filter(isRecord), 0, known)
  const schema = z.array(element.extend((object.schema as z.ZodObject<z.ZodRawShape>).shape))
  const parsed = schema.safeParse(entries)
  return {
    fields: object.fields,
    imports: [...new Set(object.imports)].sort(),
    changes: parsed.success ? [] : changesFrom(parsed.error, entries),
  }
}
