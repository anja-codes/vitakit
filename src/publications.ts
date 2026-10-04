/**
 * `schemas/publications.ts`: how `content/publications.bib` is grouped and
 * linked.
 *
 * Like a section schema, it is a file in the project that the website,
 * `vitakit-check` and the PDF all read, so the three cannot disagree about
 * which groups exist. `vitakit eject publications` writes the defaults
 * (`src/schemas/publications.ts`) as a starting point.
 */
import { z } from 'zod'
import { badgePresets, type BadgeConfig } from '@behackl/citation-js-extras'
import { fail, formatZodIssues } from './issues'

export { badgePresets }
export type { BadgeConfig }

export interface PublicationGroupConfig {
  /** A value of the `status` field; lowercase, e.g. `preprint` or `talk-slides`. */
  id: string
  /** Heading on the website and in the PDF. */
  label: string
}

/** What `schemas/publications.ts` may set; everything is optional. */
export interface PublicationsInput {
  /** The values of `status`, in the order the groups appear. */
  groups?: PublicationGroupConfig[]
  /** The group of an entry without `status`. Defaults to the first group. */
  defaultGroup?: string
  /** BibTeX fields that become links after a reference, on the website. */
  badges?: BadgeConfig[]
  /** Further BibTeX fields to hand to the website, as `entry.fields`. */
  fields?: string[]
  /**
   * A built-in CSL style (`apa`, `vancouver`, ...) or a path relative to the
   * project. Not needed for `content/publications.csl`, which is found anyway.
   */
  cslStyle?: string
}

/** The validated settings, defaults filled in. */
export interface PublicationsSchema {
  groups: PublicationGroupConfig[]
  defaultGroup: string
  badges: BadgeConfig[]
  fields: string[]
  cslStyle?: string
}

/**
 * Typing for `schemas/publications.ts`; the file is validated when it is
 * loaded, so that problems are reported with its name.
 */
export function publications(input: PublicationsInput): PublicationsInput {
  return input
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const callable = z.custom<Exclude<BadgeConfig['label'], string>>(value => typeof value === 'function', 'expected a function')

const badge = z.strictObject({
  field: z.string().min(1),
  label: z.union([z.string(), callable]),
  url: z.union([z.string(), callable]),
  match: z.instanceof(RegExp).optional(),
  split: z.union([z.string(), z.instanceof(RegExp)]).optional(),
  className: z.string().optional(),
})

const input = z.strictObject({
  groups: z.array(z.strictObject({
    id: z.string().regex(ID, 'expected a lowercase id such as `preprint` or `talk-slides`'),
    label: z.string().trim().min(1),
  })).min(1, 'expected at least one group').optional(),
  defaultGroup: z.string().optional(),
  badges: z.array(badge).optional(),
  fields: z.array(z.string().regex(/^[a-z][a-z0-9_-]*$/i, 'expected a BibTeX field name')).optional(),
  cslStyle: z.string().trim().min(1).optional(),
})

/**
 * Validate settings and fill in defaults. `where` names the file in errors;
 * `defaults` are the package's own settings (`src/schemas/publications.ts`).
 */
export function resolvePublications(
  value: unknown,
  defaults: PublicationsSchema = { groups: [], defaultGroup: '', badges: [], fields: [] },
  where = 'schemas/publications.ts',
): PublicationsSchema {
  const parsed = input.safeParse(value)
  if (!parsed.success) fail(where, `invalid\n${formatZodIssues(parsed.error)}`)

  const groups = parsed.data.groups ?? defaults.groups
  const ids = groups.map(group => group.id)
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index)
  if (duplicate) fail(where, `group "${duplicate}" is defined twice`)

  const defaultGroup = parsed.data.defaultGroup ?? (parsed.data.groups ? ids[0]! : defaults.defaultGroup)
  if (!ids.includes(defaultGroup)) {
    fail(where, `defaultGroup "${defaultGroup}" is not one of the groups (${ids.join(', ')})`)
  }

  return {
    groups,
    defaultGroup,
    badges: parsed.data.badges ?? defaults.badges,
    fields: parsed.data.fields ?? defaults.fields,
    ...(parsed.data.cslStyle ? { cslStyle: parsed.data.cslStyle } : {}),
  }
}
