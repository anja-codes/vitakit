/**
 * What a section's schema accepts, in plain language.
 *
 * Used to explain a schema and to write snippets for its fields. Recognition is
 * by identity of the vitakit primitives (`text`, `richText`, `dateRange`, …)
 * through `optional`/`default`/`array` wrappers, plus plain Zod numbers,
 * booleans, enums and objects. Nothing is reverse-engineered: anything else is
 * `custom`, which says "ordinary TypeScript, read the schema file".
 */
import { z } from 'zod'
import { absoluteUrl, dateRange, linked, requiredLink, richText, text, url, visibility } from './primitives'

/** The plain-language field types of the CLI and the docs. */
export type FieldType =
  | 'text'
  | 'formatted-text'
  | 'number'
  | 'yes-no'
  | 'date'
  | 'web-address'
  | 'link'
  | 'choice'
  | 'group'
  | 'custom'

export const FIELD_TYPE_NAMES: Readonly<Record<FieldType, string>> = {
  'text': 'text',
  'formatted-text': 'formatted text',
  'number': 'number',
  'yes-no': 'yes/no',
  'date': 'date',
  'web-address': 'web address',
  'link': 'link',
  'choice': 'one of a fixed list',
  'group': 'group of fields',
  'custom': 'custom',
}

export interface FieldDescription {
  /** The field's name; nested fields use dots: `thesis.title`. */
  path: string
  type: FieldType
  /** Entries may leave it out (it is optional or has a default). */
  optional: boolean
  /** A list of values of `type`. */
  several: boolean
  /** The value used when the field is left out, if any. */
  default?: unknown
  /** For `choice`: the allowed values. */
  choices?: string[]
  /** For `group`: its fields. */
  fields?: FieldDescription[]
}

const PRIMITIVES = new Map<unknown, FieldType>([
  [text, 'text'],
  [richText, 'formatted-text'],
  [dateRange, 'date'],
  [url, 'web-address'],
  [absoluteUrl, 'web-address'],
  [linked, 'link'],
  [requiredLink, 'link'],
])

/** Describe one field schema. */
export function describeField(path: string, schema: z.ZodType): FieldDescription {
  let current: z.ZodType = schema
  let optional = false
  let several = false
  let fallback: unknown
  let hasDefault = false

  for (;;) {
    if (PRIMITIVES.has(current)) break
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      optional = true
      current = current.unwrap() as z.ZodType
    } else if (current instanceof z.ZodDefault) {
      optional = true
      hasDefault = true
      fallback = current.def.defaultValue
      current = current.unwrap() as z.ZodType
    } else if (current instanceof z.ZodArray && !several) {
      several = true
      current = current.element as z.ZodType
    } else {
      break
    }
  }

  const description: FieldDescription = { path, type: 'custom', optional, several }
  if (hasDefault) description.default = fallback

  const primitive = PRIMITIVES.get(current)
  if (primitive) description.type = primitive
  else if (current instanceof z.ZodString) description.type = 'text'
  else if (current instanceof z.ZodNumber) description.type = 'number'
  else if (current instanceof z.ZodBoolean) description.type = 'yes-no'
  else if (current instanceof z.ZodEnum) {
    description.type = 'choice'
    description.choices = (current.options as unknown[]).map(String)
  } else if (current instanceof z.ZodObject) {
    description.type = 'group'
    description.fields = Object.entries(current.shape as Record<string, z.ZodType>)
      .map(([name, field]) => describeField(`${path}.${name}`, field))
  }
  return description
}

/**
 * The fields of a section schema -- an array of objects, as `section()` and
 * `extendSection()` make -- without `visibility`, which every section has.
 * `undefined` when the schema has another shape.
 */
export function describeSection(schema: z.ZodType): FieldDescription[] | undefined {
  if (!(schema instanceof z.ZodArray) || !(schema.element instanceof z.ZodObject)) return undefined
  return Object.entries(schema.element.shape as Record<string, z.ZodType>)
    .filter(([name, field]) => !(name === 'visibility' && field === visibility))
    .map(([name, field]) => describeField(name, field))
}

/** One line for a field: `formatted text, optional`, `list of link`. */
export function fieldSummary(field: FieldDescription): string {
  const type = field.type === 'choice' && field.choices
    ? `one of ${field.choices.join(', ')}`
    : FIELD_TYPE_NAMES[field.type]
  return [
    field.several ? `list of ${type}` : type,
    field.optional ? (field.default !== undefined ? `default ${JSON.stringify(field.default)}` : 'optional') : 'required',
  ].join(', ')
}
